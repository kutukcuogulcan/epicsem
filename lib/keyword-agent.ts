import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { projectContextBlock } from "@/lib/project-context";
import { hostOf, ownPagesTool, searchResultUrls } from "@/lib/agent-tools";
import { trLower } from "@/lib/text-match";

/**
 * Kelime agent'ı (Claude, SDK Tool Runner): araştırılan kelimelerden en değerlilerini seçer, her biri için
 * web'de arayıp ilk sonuçları görür (rakip mi, karşılaştırma sitesi mi, forum mu), markanın sitesinde
 * karşılık gelen sayfa var mı bakar; sonra kazanılabilirlik ve içerik planı çıkarır.
 * Uydurma yok: kelime yalnızca verilen listeden; "ilk sonuçlar" yalnızca agent'ın gerçekten gördüğü arama
 * sonuçlarından; "mevcut sayfa" yalnızca sitenin sayfa listesinden (kod kontrol eder). Arama hacmi YOK —
 * bu bir tahmin değil, Google'ın gösterdiğine dayalı rekabet okuması.
 */

const MODEL = process.env.GEO_AGENT_MODEL || "claude-opus-5-5";

export interface KeywordVerdict {
  keyword: string;
  intent: string;
  difficulty: "kolay" | "orta" | "zor";
  contentType: string;
  action: "new" | "improve";
  ownPage: string | null;
  topResults: { url: string; kind: string }[];
  why: string;
}

export interface KeywordAgentReport {
  seed: string;
  generatedAt: string;
  model: string;
  summary: string[];
  plan: string[];
  keywords: KeywordVerdict[];
  trace: string[];
}

export async function runKeywordAgent(userId: number, seed: string, ideas: { keyword: string; intent: string; hits: number }[], brand: { name: string; domain: string }, rivals: { name: string; domain: string }[]): Promise<KeywordAgentReport> {
  const trace: string[] = [];
  const ownSeen = new Set<string>();
  let submitted: Record<string, any> | null = null;
  const brandContext = (await projectContextBlock(userId, brand.domain).catch(() => "")).trim();
  const known = new Map(ideas.map((i) => [trLower(i.keyword), i]));

  const submit = betaZodTool({
    name: "submit_report",
    description: "Submit the final keyword analysis. Call exactly once at the end.",
    inputSchema: z.object({
      summary: z.array(z.string()).describe("2-4 Turkish sentences: overall competitive picture"),
      plan: z.array(z.string()).describe("ordered content plan, 3-6 items, Turkish"),
      keywords: z.array(
        z.object({
          keyword: z.string().describe("exactly as in the given list"),
          difficulty: z.enum(["kolay", "orta", "zor"]),
          contentType: z.string().describe("e.g. karşılaştırma yazısı, rehber, fiyat sayfası, ürün sayfası, liste"),
          action: z.enum(["new", "improve"]),
          ownPage: z.string().nullable().describe("URL from list_own_pages if a page already targets it, else null"),
          topResults: z.array(z.object({ url: z.string(), kind: z.enum(["rakip", "karşılaştırma sitesi", "forum/topluluk", "haber/blog", "resmi kurum", "pazar yeri", "marka sitesi", "diğer"]) })).describe("URLs you saw in web_search results"),
          why: z.string().describe("1-2 Turkish sentences citing what you saw"),
        })
      ),
    }),
    run: async (input) => {
      submitted = input;
      trace.push("Raporu yazdı");
      return "Rapor kaydedildi. Bitir.";
    },
  });

  const system = `You are an SEO keyword strategist agent for "${brand.name}" (${brand.domain}) in Turkey. Competitors: ${rivals.map((r) => `${r.name} (${r.domain})`).join(", ") || "none"}.
From the keyword list, pick the 5-8 keywords with the best business value for ${brand.name} (commercial and comparison intent first, then high-signal questions). For each: run web_search with that exact keyword to see what ranks (competitors? comparison/listing sites? forums? official sites?), and use list_own_pages to see if ${brand.domain} already has a page for it. Then call submit_report once.
Difficulty: "zor" if the top results are dominated by big brands/marketplaces or exact-match competitor pages; "kolay" if results are thin, forums or off-topic; else "orta". There is NO search-volume data — never mention volumes or invent numbers. Write in Turkish.
${brandContext ? `BRAND CONTEXT:\n${brandContext.slice(0, 2500)}` : ""}`;

  const client = new Anthropic();
  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    max_iterations: 12,
    thread: false,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    tools: [ownPagesTool(userId, brand.domain, trace, ownSeen), submit, { type: "web_search_20260209", name: "web_search", max_uses: 8, user_location: { type: "approximate", country: "TR" } }],
    messages: [
      {
        role: "user",
        content: `SEED: "${seed}"\nKEYWORDS (from Google suggestions; intent, how many suggestion lists it appeared in):\n${ideas.slice(0, 80).map((i) => `- ${i.keyword} (${i.intent}, ${i.hits})`).join("\n")}\n\nAnalyse and submit_report.`,
      },
    ],
  });
  const final = await runner.runUntilDone();
  if (final.stop_reason === "refusal") throw new Error("Model bu analizi reddetti; tekrar dene.");
  const report = submitted as Record<string, any> | null;
  if (!report) throw new Error("Agent raporu tamamlayamadı (tur sınırı). Tekrar dene.");

  // Doğrulama: kelime listeden, ilk sonuçlar gerçekten görülen arama sonuçlarından, mevcut sayfa sitenin listesinden.
  const seen = searchResultUrls([...runner.params.messages, { role: "assistant", content: final.content }]);
  const searches = [...runner.params.messages, { role: "assistant", content: final.content }].flatMap((m: any) => (m.role === "assistant" && Array.isArray(m.content) ? m.content : [])).filter((b: any) => b?.type === "server_tool_use" && b?.name === "web_search").length;
  if (searches) trace.unshift(`Web'de ${searches} arama yaptı (${seen.size} sonuç gördü)`);
  const keywords: KeywordVerdict[] = (Array.isArray(report.keywords) ? report.keywords : [])
    .map((k: any) => {
      const src = known.get(trLower(String(k?.keyword ?? "").trim()));
      if (!src) return null;
      const ownPage = typeof k.ownPage === "string" && ownSeen.has(k.ownPage) ? k.ownPage : null;
      const topResults = (Array.isArray(k.topResults) ? k.topResults : [])
        .filter((r: any) => typeof r?.url === "string" && (seen.has(r.url) || [...seen].some((u) => hostOf(u) === hostOf(r.url) && hostOf(u))))
        .slice(0, 5)
        .map((r: any) => ({ url: r.url, kind: String(r.kind ?? "diğer") }));
      return {
        keyword: src.keyword,
        intent: src.intent,
        difficulty: ["kolay", "orta", "zor"].includes(k.difficulty) ? k.difficulty : "orta",
        contentType: String(k.contentType ?? "").slice(0, 60),
        action: ownPage ? "improve" : "new",
        ownPage,
        topResults,
        why: String(k.why ?? "").trim().slice(0, 400),
      } as KeywordVerdict;
    })
    .filter((k: KeywordVerdict | null): k is KeywordVerdict => !!k && k.why.length > 5);
  const list = (v: unknown, n: number) => (Array.isArray(v) ? v : []).map((x) => String(x ?? "").trim()).filter((x) => x.length > 5).slice(0, n);
  if (!keywords.length) throw new Error("Agent doğrulanabilir bir sonuç üretemedi; tekrar dene.");
  return { seed, generatedAt: new Date().toISOString(), model: final.model ?? MODEL, summary: list(report.summary, 4), plan: list(report.plan, 6), keywords: keywords.slice(0, 8), trace };
}
