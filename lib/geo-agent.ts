import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import type { GeoRunResult } from "@/types";
import type { BrandRef } from "@/lib/geo-loss";
import { buildEvidence, type OpportunityReport } from "@/lib/geo-opportunities";
import { validateOpportunities } from "@/lib/opportunity-check";
import { fetchPageSummary } from "@/lib/content-fetch";
import { ownPagesTool } from "@/lib/agent-tools";
import { projectContextBlock } from "@/lib/project-context";
import { trLower } from "@/lib/text-match";

/**
 * GEO analist AGENT'ı (Claude, SDK Tool Runner). Tek çağrılı analistten farkı: kendisi karar verip
 * araç kullanır — AI'ın gösterdiği kaynak sayfaları açıp okur (markalar orada geçiyor mu, kaçıncı),
 * markanın kendi sitesinde ilgili sayfa var mı bakar, gerekirse web'de arar; raporu ancak sonra yazar.
 * Uydurma yok: rapordaki her "kanıt" agent'ın gerçekten okuduğu bir sayfaya bağlı olmalı (kod kontrol eder);
 * marka sayıları kodla sayılır, AI'a bırakılmaz. Maliyet sınırı: en fazla 10 tur, 8 sayfa, 3 web araması.
 */

const MODEL = process.env.GEO_AGENT_MODEL || "claude-opus-5-5";
const MAX_PAGES = 8;

export interface AgentReport extends OpportunityReport {
  agent: true;
  model: string;
  /** Agent'ın attığı adımlar (şeffaflık için arayüzde gösterilir). */
  trace: string[];
}

const host = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** Bir metinde markanın (ad + takma adlar) kaç kez geçtiği — kodla sayılır. */
function countBrand(text: string, b: BrandRef & { aliases?: string[] }): number {
  const t = trLower(text);
  let n = 0;
  for (const name of [b.name, ...(b.aliases ?? [])].map(trLower).filter((x) => x.length > 1)) {
    for (let i = t.indexOf(name); i >= 0; i = t.indexOf(name, i + name.length)) n++;
  }
  return n;
}

export async function runGeoAgent(userId: number, runAt: string, runs: GeoRunResult[], own: BrandRef, rivals: BrandRef[]): Promise<AgentReport> {
  const { evidence, lines } = buildEvidence(runs, own, rivals);
  const base = { generatedAt: new Date().toISOString(), runAt, answers: evidence.totalAnswers, agent: true as const, model: MODEL };
  if (evidence.totalAnswers < 3) return { ...base, status: "insufficient-data", summary: [], opportunities: [], risks: [], trace: [] };

  const brandContext = (await projectContextBlock(userId, own.domain).catch(() => "")).trim();
  const trace: string[] = [];
  const read = new Map<string, string>(); // okunan sayfa (son adres) → başlık
  let submitted: Record<string, unknown> | null = null;

  const readPage = betaZodTool({
    name: "read_page",
    description: `Open a web page and get its title, main text (first ~6000 chars) and how many times each tracked brand (${[own, ...rivals].map((b) => b.name).join(", ")}) is mentioned — counted by code, trust these counts. Use it on sources the AI engines cited to find out WHY they favor a competitor (is ${own.name} listed? in which order? what do they say?). At most ${MAX_PAGES} pages.`,
    inputSchema: z.object({ url: z.string().describe("Full http(s) URL") }),
    run: async ({ url }) => {
      if (read.size >= MAX_PAGES) return `Sınır: en fazla ${MAX_PAGES} sayfa okunabilir. Elindekiyle raporu yaz.`;
      try {
        const p = await fetchPageSummary(url);
        read.set(p.url, p.title ?? p.url);
        trace.push(`Sayfayı okudu: ${p.url}`);
        const counts = [own, ...rivals].map((b) => `${b.name}: ${countBrand(p.bodyText, b)}`).join(", ");
        return `URL: ${p.url}\nTitle: ${p.title ?? "-"}\nBrand mentions (code count): ${counts}\nText:\n${p.bodyText.slice(0, 6000)}`;
      } catch (e) {
        trace.push(`Açamadı: ${url}`);
        return `Sayfa açılamadı (${e instanceof Error ? e.message : "hata"}).`;
      }
    },
  });

  const listOwnPages = ownPagesTool(userId, own.domain, trace, new Set());

  const submitReport = betaZodTool({
    name: "submit_report",
    description: "Submit the final analysis. Call exactly once, at the end, after verifying the key sources.",
    inputSchema: z.object({
      summary: z.array(z.string()).describe("2-4 short Turkish sentences"),
      opportunities: z.array(
        z.object({
          category: z.enum(["creation", "existing-content", "outreach", "social"]),
          title: z.string(),
          why: z.string().describe("Turkish, cite concrete findings; never write question numbers"),
          prompts: z.array(z.number()).describe("question numbers from the data"),
          sources: z.array(z.string()).describe("domains from the data or pages you read"),
          evidence: z.array(z.object({ url: z.string().describe("a URL you opened with read_page"), finding: z.string().describe("what you found there, Turkish, 1 sentence") })),
        })
      ),
      risks: z.array(z.string()),
    }),
    run: async (input) => {
      submitted = input;
      trace.push("Raporu yazdı");
      return "Rapor kaydedildi. Bitir; başka bir şey yazma.";
    },
  });

  const system = `You are a senior GEO (AI search visibility) analyst agent for the brand "${own.name}" (${own.domain}). Competitors: ${rivals.map((r) => r.name).join(", ") || "none"}.
Work like an analyst: first look at the test data, then VERIFY the most important sources with read_page (the third-party pages AI engines cited, especially where a competitor won), check ${own.domain} with list_own_pages before recommending a new page, use web_search only if something is missing. Then call submit_report once.
Rules: write everything in Turkish. Use only what the data and the pages you read show; never invent sites, rankings, numbers, prices or features. Every opportunity needs question numbers from the data; outreach/social need cited domains; put what you verified on a page into "evidence" with that page's URL. Research shows being present on the sites AI already cites matters more than rewriting your own pages — prioritise that when the pages confirm it. Never write question numbers like [0] in text.
${brandContext ? `BRAND CONTEXT (only source for brand claims):\n${brandContext.slice(0, 4000)}` : ""}`;

  const client = new Anthropic(); // anahtar: ANTHROPIC_API_KEY (Entegrasyonlar'dan da gelir)
  const final = await client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    max_iterations: 10,
    thread: false, // kısa döngü; beta "message threads" + fallbacks birleşimine gerek yok
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // güvenlik sınıflandırıcısı reddederse aynı istek yedek modelde sürer
    system,
    tools: [readPage, listOwnPages, submitReport, { type: "web_search_20260209", name: "web_search", max_uses: 3 }],
    messages: [
      {
        role: "user",
        content: `AI ENGINE ANSWERS PER QUESTION (real data, with web search):\n${lines.join("\n")}\n\nSOURCES AI CITED (domain — times — sample URLs):\n${evidence.sources.map((s) => `${s.domain} — ${s.count} — ${s.urls.slice(0, 2).join(" ")}`).join("\n") || "(none)"}\n\nAnalyse, verify the key sources, then submit_report.`,
      },
    ],
  });
  if (final.stop_reason === "refusal") throw new Error("Model bu analizi reddetti; tekrar dene.");
  const report = submitted as Record<string, any> | null;
  if (!report) throw new Error("Agent raporu tamamlayamadı (tur sınırı). Tekrar dene.");

  // Doğrulama: kanıt yalnızca gerçekten okunan sayfalardan; kaynak alan adları veri ya da okunan sayfalardan.
  const readUrls = new Set(read.keys());
  const readHosts = new Set([...readUrls].map(host));
  const ownHost = host(`https://${own.domain}`);
  const allowed = [...evidence.sources, ...[...readHosts].filter((h) => !evidence.sources.some((s) => s.domain === h)).map((h) => ({ domain: h, count: 0, urls: [...readUrls].filter((u) => host(u) === h) }))].filter((s) => s.domain !== ownHost);
  const raw: any[] = Array.isArray(report.opportunities) ? report.opportunities : [];
  const opportunities = validateOpportunities(raw, { ...evidence, sources: allowed }).map((o) => {
    const src = raw.find((r) => String(r?.title ?? "").trim() === o.title);
    const ev = (Array.isArray(src?.evidence) ? src.evidence : [])
      .map((e: any) => ({ url: String(e?.url ?? ""), finding: String(e?.finding ?? "").trim().slice(0, 300) }))
      .filter((e: { url: string; finding: string }) => e.finding.length > 5 && [...readUrls].some((u) => u === e.url || host(u) === host(e.url)));
    return { ...o, evidence: ev.slice(0, 4) };
  });
  const list = (v: unknown, n: number) => (Array.isArray(v) ? v : []).map((x) => String(x ?? "").replace(/\[\d+\]\s*/g, "").trim()).filter((x) => x.length > 5).slice(0, n);
  return { ...base, model: final.model ?? MODEL, status: opportunities.length ? "ready" : "insufficient-data", summary: list(report.summary, 4), opportunities, risks: list(report.risks, 3), trace };
}
