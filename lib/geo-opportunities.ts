import type { GeoRunResult } from "@/types";
import { analyzeRun, isDemoRun, type BrandRef } from "@/lib/geo-loss";
import { runSmallAiJson } from "@/lib/ai-small";
import { validateOpportunities, type Evidence, type Opportunity } from "@/lib/opportunity-check";

/**
 * GEO analisti: son testin gerçek cevaplarından kanıt çıkarır (kod), bunu öncelikli fırsatlara
 * çevirir (AI, 1 sorgu), sonra her fırsatı kanıtla doğrular (lib/opportunity-check).
 */

export interface OpportunityReport {
  status: "ready" | "insufficient-data";
  generatedAt: string;
  runAt: string;
  summary: string[];
  opportunities: Opportunity[];
  risks: string[];
  answers: number;
}

const MIN_ANSWERS = 3;
/** Kaçan iç numaraları temizle: "[2] numaralı …", "(0, 1, 3)". */
const noIdx = (t: string) => t.replace(/(?:\[\d+\]\s*(?:,|ve|and)?\s*)+(?:numaralı\s*)?/g, "").replace(/\s*\((\d+,\s*)*\d+\)/g, "").replace(/\s{2,}/g, " ").trim();

export function buildEvidence(runs: GeoRunResult[], own: BrandRef, rivals: BrandRef[]) {
  const real = runs.filter((r) => !isDemoRun(r));
  const texts = [...new Set(real.map((r) => r.promptText))];
  const srcMap = new Map<string, { count: number; urls: Set<string> }>();
  const lines: string[] = [];
  const prompts = texts.map((text, i) => {
    const rs = real.filter((r) => r.promptText === text);
    let lost = 0;
    const parts = rs.map((r) => {
      const a = analyzeRun(r, own, rivals);
      if (a.status === "lost" || a.status === "empty") lost++;
      for (const c of r.citations) {
        const d = (c.domain || "").toLowerCase().replace(/^www\./, "");
        if (!d) continue;
        const e = srcMap.get(d) ?? { count: 0, urls: new Set<string>() };
        e.count++;
        e.urls.add(c.url);
        srcMap.set(d, e);
      }
      return `${r.engine}: ${a.status === "won" ? "kazandın (1.)" : a.status === "mentioned" ? `anıldın (${a.ownRank}.)` : a.status === "lost" ? "kaybettin" : "kimse anılmadı"}${a.rivals.length ? `; rakipler: ${a.rivals.map((x) => `${x.name} ${x.rank}.`).join(", ")}` : ""}${a.sources.length ? `; kaynaklar: ${a.sources.slice(0, 6).join(", ")}` : "; kaynak yok"}`;
    });
    lines.push(`[${i}] "${text}"\n   ${parts.join("\n   ")}`);
    return { i, text, answers: rs.length, lost };
  });
  const sources = [...srcMap.entries()]
    .map(([domain, v]) => ({ domain, count: v.count, urls: [...v.urls].slice(0, 5) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 40);
  const evidence: Evidence = { prompts, sources, totalAnswers: real.length };
  return { evidence, lines };
}

export function opportunitiesPrompt(own: BrandRef, rivals: BrandRef[], lines: string[], ev: Evidence): string {
  return `You are a senior GEO (AI search visibility) analyst for the brand "${own.name}" (${own.domain}). Competitors tracked: ${rivals.map((r) => r.name).join(", ") || "none"}.
Below is REAL data: how AI assistants (ChatGPT, Gemini, Claude, Perplexity — with web search) answered each tracked question, who they named, and which web pages they cited.

ANSWERS PER QUESTION:
${lines.join("\n")}

SOURCES AI CITED (domain — times cited):
${ev.sources.map((s) => `${s.domain} — ${s.count}`).join("\n") || "(none)"}

Write the analysis in TURKISH. Return ONLY JSON:
{"summary":["2-4 short sentences: how AI sees ${own.name} vs competitors, the main pattern behind losses"],
 "opportunities":[{"category":"creation|existing-content|outreach|social","title":"verb-first, concrete","why":"2-3 sentences citing the specific data above (which questions, which competitor won, which sites were cited and how often)","prompts":[question numbers],"sources":["domain from the SOURCES list"]}],
 "risks":["0-3 short risks seen in the data, e.g. a competitor dominating a topic, negative tone"]}
Rules:
- 3-7 opportunities, most valuable first. Every opportunity MUST list question numbers from the data; outreach/social MUST list cited domains from the SOURCES list.
- outreach = get ${own.name} mentioned/listed on a third-party editorial, comparison or listing site that AI cites. social = community/UGC/video sites (reddit, ekşi, şikayetvar, youtube, forums). creation = a new page on ${own.domain} answering questions where nobody or a competitor wins. existing-content = improve an existing ${own.domain} page that is cited or should be.
- Research shows rewriting pages alone rarely moves AI answers; being present on the sites AI already cites matters more — prioritise outreach/social when cited third-party sites explain the losses.
- In summary, why and risks NEVER write question numbers like [0] or (0, 1, 3) — the reader doesn't see them; refer to a question by a short quote of it instead. Numbers go only in the "prompts" array.
- Use only facts present above. Never invent sites, numbers, prices or features. Do not mention ${own.name}'s own domain as an outreach target.`;
}

export async function generateOpportunities(userId: number, runAt: string, runs: GeoRunResult[], own: BrandRef, rivals: BrandRef[]): Promise<OpportunityReport> {
  const { evidence, lines } = buildEvidence(runs, own, rivals);
  const base = { generatedAt: new Date().toISOString(), runAt, answers: evidence.totalAnswers };
  if (evidence.totalAnswers < MIN_ANSWERS) return { ...base, status: "insufficient-data", summary: [], opportunities: [], risks: [] };
  const parsed = await runSmallAiJson(userId, opportunitiesPrompt(own, rivals, lines, evidence));
  const ownHost = own.domain.toLowerCase().replace(/^www\./, "");
  const opportunities = validateOpportunities(parsed.opportunities, { ...evidence, sources: evidence.sources.filter((s) => s.domain !== ownHost) });
  const list = (v: unknown, n: number) => (Array.isArray(v) ? v : []).map((x) => noIdx(String(x ?? ""))).filter((x) => x.length > 5).slice(0, n);
  for (const o of opportunities) o.why = noIdx(o.why);
  return { ...base, status: opportunities.length ? "ready" : "insufficient-data", summary: list(parsed.summary, 4), opportunities, risks: list(parsed.risks, 3) };
}
