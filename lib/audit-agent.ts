import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import type { SeoAuditResult } from "@/types";
import { runSeoAudit } from "@/lib/seo-audit";
import { overallLosses, pillarScores } from "@/lib/audit-insights";
import { projectContextBlock } from "@/lib/project-context";
import { hostOf, ownPagesTool } from "@/lib/agent-tools";

/**
 * Site Denetimi agent'ı (Claude, SDK Tool Runner): son denetimi okur, audit_page ile sitenin önemli
 * sayfalarını ve rakibin karşılık gelen sayfalarını aynı ölçütle denetler, sonra en önemli 3-5 işi
 * gerekçe + kanıt + adımlarla ve rakip karşılaştırmasıyla çıkarır.
 * Uydurma yok: kanıt ve karşılaştırma yalnızca agent'ın gerçekten denetlediği sayfalardan (kod kontrol eder);
 * sayfa ölçümleri (puan, kelime sayısı, schema…) kodla üretilir, AI'a bırakılmaz. En fazla 6 sayfa denetimi.
 */

const MODEL = process.env.GEO_AGENT_MODEL || "claude-opus-5-5";
const MAX_AUDITS = 6;

export interface AuditPriority {
  title: string;
  why: string;
  steps: string[];
  effort: "düşük" | "orta" | "yüksek";
  impact: "yüksek" | "orta" | "düşük";
  evidence: { url: string; finding: string }[];
}

export interface AuditAgentReport {
  url: string;
  generatedAt: string;
  model: string;
  summary: string[];
  priorities: AuditPriority[];
  comparison: { aspect: string; own: string; rival: string; rivalUrl: string }[];
  trace: string[];
}

/** Bir denetim sonucunun kısa, kodla üretilmiş özeti (agent'a verilir). */
export function auditDigest(r: SeoAuditResult): string {
  const m = r.meta;
  const bad = r.issues.filter((i) => i.severity === "critical" || i.severity === "warning");
  const blocked = (m.aiBotAccess ?? []).filter((b) => !b.allowed).map((b) => b.bot);
  return [
    `URL: ${r.url} | puan ${r.score}/100 | AI tarama puanı ${r.aiCrawlScore}/100`,
    `Title: ${m.title ?? "-"} | Meta description: ${m.description ? `${m.description.length} karakter` : "yok"} | H1: ${m.h1Count} | Kelime: ${m.wordCount}`,
    `Schema: ${m.hasSchema ? m.schemaTypes.join(", ") || "var" : "yok"} | Canonical: ${m.canonical ? "var" : "yok"} | robots.txt: ${m.robotsTxtFound ? "var" : "yok"} | sitemap: ${m.sitemapFound ? "var" : "yok"} | Engelli AI botları: ${blocked.join(", ") || "yok"}`,
    `Sorunlar (${bad.length}): ${bad.slice(0, 25).map((i) => `[${i.severity}] ${i.title}${i.detail ? ` — ${String(i.detail).slice(0, 80)}` : ""}`).join(" ; ") || "yok"}`,
  ].join("\n");
}

export async function runAuditAgent(userId: number, main: SeoAuditResult, brand: { name: string; domain: string }, rivals: { name: string; domain: string }[]): Promise<AuditAgentReport> {
  const trace: string[] = [];
  const audited = new Set<string>([main.url]);
  let submitted: Record<string, any> | null = null;
  const pillars = pillarScores(main);
  const losses = overallLosses(pillars).slice(0, 8);
  const brandContext = (await projectContextBlock(userId, brand.domain).catch(() => "")).trim();

  const auditPage = betaZodTool({
    name: "audit_page",
    description: `Run the same technical SEO + AI-readiness audit on any page (a page on ${brand.domain} or a competitor's matching page). Returns code-measured facts: score, title, meta, H1, word count, schema types, blocked AI bots, failing checks. At most ${MAX_AUDITS} audits — choose important pages (home, pricing, main product/category, a key blog post) and the competitor's equivalent.`,
    inputSchema: z.object({ url: z.string().describe("Full http(s) URL") }),
    run: async ({ url }) => {
      if (audited.size > MAX_AUDITS) return `Sınır: en fazla ${MAX_AUDITS} sayfa denetlenebilir. Elindekiyle raporu yaz.`;
      try {
        const r = await runSeoAudit(url);
        if (r.unreadable) {
          trace.push(`Okuyamadı: ${url}`);
          return `Sayfa okunamadı (${r.unreadable}). Bu sayfa hakkında tahmin yürütme.`;
        }
        audited.add(r.url);
        trace.push(`Denetledi: ${r.url} (puan ${r.score})`);
        return auditDigest(r);
      } catch (e) {
        trace.push(`Denetleyemedi: ${url}`);
        return `Sayfa denetlenemedi (${e instanceof Error ? e.message : "hata"}).`;
      }
    },
  });

  const submit = betaZodTool({
    name: "submit_report",
    description: "Submit the final audit analysis. Call exactly once at the end.",
    inputSchema: z.object({
      summary: z.array(z.string()).describe("2-4 Turkish sentences"),
      priorities: z.array(
        z.object({
          title: z.string().describe("verb-first, Turkish"),
          why: z.string().describe("why this matters most for this site, citing measured facts"),
          steps: z.array(z.string()).describe("2-5 concrete steps"),
          effort: z.enum(["düşük", "orta", "yüksek"]),
          impact: z.enum(["yüksek", "orta", "düşük"]),
          evidence: z.array(z.object({ url: z.string().describe("an audited URL"), finding: z.string() })),
        })
      ).describe("3-5 items, most important first"),
      comparison: z.array(z.object({ aspect: z.string(), own: z.string(), rival: z.string(), rivalUrl: z.string().describe("the competitor URL you audited") })).describe("only if you audited a competitor page"),
    }),
    run: async (input) => {
      submitted = input;
      trace.push("Raporu yazdı");
      return "Rapor kaydedildi. Bitir.";
    },
  });

  const system = `You are a senior technical SEO + GEO consultant agent for "${brand.name}" (${brand.domain}). Competitors: ${rivals.map((r) => `${r.name} (${r.domain})`).join(", ") || "none"}.
You have the latest audit of ${main.url}. Go deeper like a consultant: use list_own_pages to find the site's most important pages (pricing, main product/category, a key article), audit 2-3 of them with audit_page, and audit the matching page of the strongest competitor to compare. Then submit_report once with the 3-5 MOST IMPORTANT things to do for THIS site — not a generic checklist: rank by real impact on Google and on being cited by AI assistants, explain why using the measured facts, give concrete steps, and attach evidence from audited URLs.
Rules: Turkish; use only the measured facts; never invent numbers, pages or competitor details; comparison rows only from pages you audited.
${brandContext ? `BRAND CONTEXT:\n${brandContext.slice(0, 2000)}` : ""}`;

  const client = new Anthropic();
  const final = await client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    max_iterations: 12,
    thread: false,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    tools: [ownPagesTool(userId, brand.domain, trace, new Set()), auditPage, submit],
    messages: [
      {
        role: "user",
        content: `LATEST AUDIT (code-measured):\n${auditDigest(main)}\n\nSCORE BREAKDOWN: overall ${pillars.overall}/100; ${pillars.pillars.map((p) => `${p.label} ${p.score}`).join(", ")}\nBIGGEST POINT LOSSES: ${losses.map((l) => `${l.label} (-${l.lost})`).join("; ") || "-"}\n\nInvestigate, then submit_report.`,
      },
    ],
  });
  if (final.stop_reason === "refusal") throw new Error("Model bu analizi reddetti; tekrar dene.");
  const report = submitted as Record<string, any> | null;
  if (!report) throw new Error("Agent raporu tamamlayamadı (tur sınırı). Tekrar dene.");

  const auditedHosts = new Set([...audited].map(hostOf));
  const isAudited = (u: unknown) => typeof u === "string" && (audited.has(u) || [...audited].some((a) => a.replace(/\/+$/, "") === u.replace(/\/+$/, "")));
  const str = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
  const priorities: AuditPriority[] = (Array.isArray(report.priorities) ? report.priorities : [])
    .map((p: any) => ({
      title: str(p?.title, 160),
      why: str(p?.why, 600),
      steps: (Array.isArray(p?.steps) ? p.steps : []).map((s: unknown) => str(s, 300)).filter((s: string) => s.length > 3).slice(0, 5),
      effort: ["düşük", "orta", "yüksek"].includes(p?.effort) ? p.effort : "orta",
      impact: ["yüksek", "orta", "düşük"].includes(p?.impact) ? p.impact : "orta",
      evidence: (Array.isArray(p?.evidence) ? p.evidence : []).filter((e: any) => isAudited(e?.url) && str(e?.finding, 300).length > 5).map((e: any) => ({ url: e.url, finding: str(e.finding, 300) })).slice(0, 4),
    }))
    .filter((p: AuditPriority) => p.title.length > 5 && p.why.length > 10)
    .slice(0, 5);
  const ownHost = hostOf(main.url);
  const comparison = (Array.isArray(report.comparison) ? report.comparison : [])
    .filter((c: any) => isAudited(c?.rivalUrl) && hostOf(c.rivalUrl) !== ownHost && auditedHosts.has(hostOf(c.rivalUrl)))
    .map((c: any) => ({ aspect: str(c.aspect, 80), own: str(c.own, 160), rival: str(c.rival, 160), rivalUrl: c.rivalUrl }))
    .slice(0, 8);
  if (!priorities.length) throw new Error("Agent doğrulanabilir bir sonuç üretemedi; tekrar dene.");
  const list = (v: unknown, n: number) => (Array.isArray(v) ? v : []).map((x) => str(x, 400)).filter((x) => x.length > 5).slice(0, n);
  return { url: main.url, generatedAt: new Date().toISOString(), model: final.model ?? MODEL, summary: list(report.summary, 4), priorities, comparison, trace };
}
