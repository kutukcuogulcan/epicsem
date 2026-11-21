import type { GeoRunResult } from "@/types";
import { runSmallAiJson } from "@/lib/ai-small";
import { analyzeRun, type BrandRef } from "@/lib/geo-loss";
import type { Opportunity } from "@/lib/opportunity-check";

/**
 * Analist fırsatından Peec tarzı içerik brief'i (1 AI sorgusu): başlık/meta önerileri, ana soru,
 * markanın açısı ve kanıt noktaları, bölüm bölüm cevaplanacak sorular, yazılmayacak ifadeler,
 * eksik bilgiler. Marka iddiaları yalnızca proje bağlamından; kaynaklar yalnızca AI'ın gösterdiklerinden.
 */

export interface BriefSection {
  h2: string;
  angle: string;
  questions: string[];
  points: string[];
}

export interface ContentBrief {
  h1Options: string[];
  metaTitle: string;
  metaDescription: string;
  mainQuestion: string;
  angle: string;
  proofPoints: string[];
  neverWrite: string[];
  sections: BriefSection[];
  faq: string[];
  neededInputs: string[];
  sources: string[];
}

const str = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const arr = (v: unknown, n: number, len: number) => (Array.isArray(v) ? v : []).map((x) => str(x, len)).filter((x) => x.length > 2).slice(0, n);

export async function generateBrief(userId: number, o: Opportunity, runs: GeoRunResult[], own: BrandRef, rivals: BrandRef[], brandContext: string): Promise<ContentBrief> {
  const texts = new Set(o.prompts.map((p) => p.text));
  const answers = runs
    .filter((r) => texts.has(r.promptText))
    .map((r) => {
      const a = analyzeRun(r, own, rivals);
      return `- "${r.promptText}" (${r.engine}): ${a.status === "won" ? `${own.name} 1.` : a.ownRank ? `${own.name} ${a.ownRank}.` : `${own.name} anılmadı`}${a.rivals.length ? `; rakipler ${a.rivals.map((x) => `${x.name} ${x.rank}.`).join(", ")}` : ""}${a.sources.length ? `; kaynaklar ${a.sources.slice(0, 5).join(", ")}` : ""}`;
    });
  const sourceList = [...new Set([...o.sources.map((s) => s.domain), ...runs.filter((r) => texts.has(r.promptText)).flatMap((r) => r.citations.map((c) => c.domain))])].filter(Boolean).slice(0, 10);

  const prompt = `You are a senior content strategist writing a content brief (in TURKISH) for ${own.name} (${own.domain}) so that AI assistants start recommending it for these questions.
TASK: ${o.title}
WHY: ${o.why}
REAL AI ANSWERS TODAY:
${answers.join("\n") || "(none)"}
SITES AI CITES FOR THESE QUESTIONS: ${sourceList.join(", ") || "(none)"}
${brandContext ? `BRAND CONTEXT (the ONLY source for brand claims):\n${brandContext.slice(0, 5000)}` : "BRAND CONTEXT: (none given) — make no specific brand claims; list what is missing under neededInputs."}

Return ONLY JSON:
{"h1Options":["2-3 titles"],"metaTitle":"<60 chars","metaDescription":"<155 chars","mainQuestion":"the one question the page must answer first",
 "angle":"2 sentences: ${own.name}'s honest angle vs the competitors named above",
 "proofPoints":["facts about ${own.name} taken ONLY from BRAND CONTEXT"],
 "neverWrite":["phrases to avoid: superlatives/unverifiable claims, e.g. 'en iyi', 'kesin', 'bedava' unless true in context"],
 "sections":[{"h2":"question-style heading","angle":"1 sentence: what this section argues","questions":["real user questions it answers — reuse the questions above where they fit"],"points":["3-4 concrete points to cover; say where a comparison table, a statistic with source or a quote belongs"]}],
 "faq":["4-6 short questions people ask"],
 "neededInputs":["facts the writer must get from ${own.name} before publishing (prices, plan names, numbers) — things not in BRAND CONTEXT"]}
Rules: 4-7 sections, answer-first structure, the first section answers mainQuestion directly. Never invent brand features, prices or statistics. Be fair to competitors.`;

  const p = await runSmallAiJson(userId, prompt);
  const sections: BriefSection[] = (Array.isArray(p.sections) ? p.sections : [])
    .map((s: any) => ({ h2: str(s?.h2, 140), angle: str(s?.angle, 300), questions: arr(s?.questions, 5, 200), points: arr(s?.points, 5, 300) }))
    .filter((s: BriefSection) => s.h2.length > 3)
    .slice(0, 8);
  if (!sections.length) throw new Error("Brief üretilemedi, tekrar dene.");
  return {
    h1Options: arr(p.h1Options, 3, 140),
    metaTitle: str(p.metaTitle, 80),
    metaDescription: str(p.metaDescription, 180),
    mainQuestion: str(p.mainQuestion, 200) || o.prompts[0].text,
    angle: str(p.angle, 500),
    proofPoints: arr(p.proofPoints, 6, 200),
    neverWrite: arr(p.neverWrite, 8, 60),
    sections,
    faq: arr(p.faq, 6, 200),
    neededInputs: arr(p.neededInputs, 6, 200),
    sources: sourceList,
  };
}
