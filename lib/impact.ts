import type { EngineId } from "@/types";
import { runPromptAcrossEngines } from "@/lib/geo-engine";
import { configuredEngines, isDemoMode } from "@/lib/geo-providers";
import { quotaExceededMessage, refundQuota, reserveQuota } from "@/lib/usage-guard";
import { runSmallAiJson } from "@/lib/ai-small";
import { brandMentioned, trLower } from "@/lib/text-match";
import type { ImpactCheck, ImpactResult, ImpactTrack } from "@/lib/db";

/**
 * Etki ölçümü (Peec "Impact" karşılığı): bir yazı ya da off-page işinin, hedef soru ve onunla
 * bağlantılı soru setinde AI görünürlüğünü önce/sonra karşılaştırır.
 *
 * Bağlantılı sorular HER PROJE İÇİN o projenin kendi bağlamından üretilir (proje açıklaması,
 * ürünleri, sektörü, dili ve prompt kütüphanesindeki aynı konudaki sorular) — hiçbir sektöre
 * özel sabit liste yoktur.
 */

export interface RelatedPrompt {
  text: string;
  intent: string;
  source: "target" | "generated" | "library";
}

export { INTENT_LABEL } from "@/lib/impact-labels";

const norm = (s: string) => trLower(s).replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();

/** Kelime örtüşmesi (Jaccard) — kütüphanedeki ilgili soruları bulmak ve tekrarları atmak için. */
function overlap(a: string, b: string): number {
  const A = new Set(norm(a).split(" ").filter((w) => w.length > 2));
  const B = new Set(norm(b).split(" ").filter((w) => w.length > 2));
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / (A.size + B.size - n);
}

/** Bağlantılı soru üretim talimatı (test edilebilsin diye ayrı). */
export function relatedPromptsPrompt(opts: { target: string; keyword?: string; brand: string; context: string; count: number; lang: string }): string {
  return `You help measure whether a piece of content changed a brand's visibility in AI assistants (ChatGPT, Gemini, Claude, Perplexity).
Target question the content answers: "${opts.target}"${opts.keyword ? `\nMain keyword: "${opts.keyword}"` : ""}
Brand: ${opts.brand}
Project context (what the business does, products, audience — use it to stay in the right industry and market):
${opts.context.slice(0, 2500)}

Write ${opts.count} OTHER questions a real customer of this business would type into an AI assistant about the SAME topic, worded differently. Cover different intents: "best/which one", comparison, price/cost, how-to, problem/complaint, alternatives, local (city) if the business is local. Rules:
- Written in ${opts.lang === "tr" ? "Turkish" : opts.lang}, natural and conversational, like a real user; mostly short (6-16 words), at most one longer one.
- Do NOT include the brand name "${opts.brand}" (we measure discovery, not branded searches).
- Stay on the target question's topic; do not drift to other products of the business.
- No duplicates or trivial rewordings of the target question.
Return ONLY JSON: {"prompts":[{"text":"question?","intent":"best|compare|price|howto|problem|alternative|local|info"}]}`;
}

export async function generateRelatedPrompts(
  userId: number,
  opts: { target: string; keyword?: string; brand: string; context: string; library: string[]; language?: string; count?: number }
): Promise<RelatedPrompt[]> {
  const count = Math.min(8, Math.max(3, opts.count ?? 6));
  const lang = opts.language && opts.language !== "tr" ? opts.language : "tr";
  // Kütüphaneden aynı konudaki sorular (AI'sız).
  const lib = opts.library
    .map((p) => ({ p, s: Math.max(overlap(p, opts.target), opts.keyword ? overlap(p, opts.keyword) : 0) }))
    .filter((x) => x.s >= 0.2 && norm(x.p) !== norm(opts.target))
    .sort((a, b) => b.s - a.s)
    .slice(0, 4)
    .map((x) => ({ text: x.p, intent: "library", source: "library" as const }));

  const prompt = relatedPromptsPrompt({ ...opts, count, lang });
  const parsed = await runSmallAiJson(userId, prompt);
  const gen: RelatedPrompt[] = (Array.isArray(parsed.prompts) ? parsed.prompts : [])
    .map((x: any) => ({ text: String(x?.text ?? "").trim().slice(0, 200), intent: String(x?.intent ?? "info"), source: "generated" as const }))
    .filter((x: RelatedPrompt) => x.text.length > 8 && !brandMentioned(x.text, { name: opts.brand }));

  const out: RelatedPrompt[] = [{ text: opts.target.trim(), intent: "target", source: "target" }];
  for (const p of [...lib, ...gen]) {
    if (out.some((o) => norm(o.text) === norm(p.text) || overlap(o.text, p.text) > 0.8)) continue;
    out.push(p);
  }
  return out.slice(0, count + 1 + lib.length);
}

const host = (u: string) => u.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase();

/** Soru seti × motorlar ölçümü. Kota kontrolü dahil; GEO test geçmişine yazılmaz (trend bozulmasın). */
export async function measureImpact(
  userId: number,
  t: { prompts: { text: string }[]; engines: string[]; brand: { name: string; domain: string }; competitors: { name: string; domain: string }[] }
): Promise<ImpactCheck> {
  const engines = t.engines as EngineId[];
  const demo = isDemoMode();
  if (demo) {
    const e = new Error("Etki ölçümü gerçek AI cevabı gerektirir; demo modda çalışmaz. Entegrasyonlar'dan en az bir AI anahtarı ekle.") as Error & { status?: number };
    e.status = 400;
    throw e;
  }
  const planned = t.prompts.length * configuredEngines(engines).length;
  if (!planned) {
    const e = new Error("Seçili motorların hiçbirinin anahtarı tanımlı değil.") as Error & { status?: number };
    e.status = 400;
    throw e;
  }
  const quota = await reserveQuota(userId, "engineQueries", planned);
  if (!quota.allowed) {
    const e = new Error(quotaExceededMessage("engineQueries", quota, planned)) as Error & { status?: number };
    e.status = 402;
    throw e;
  }
  let runs: Awaited<ReturnType<typeof runPromptAcrossEngines>>;
  try {
    runs = (await Promise.all(t.prompts.map((p) => runPromptAcrossEngines(p.text, t.brand, t.competitors, engines)))).flat();
  } catch (e) {
    await refundQuota(userId, "engineQueries", planned);
    throw e;
  }
  await refundQuota(userId, "engineQueries", planned - runs.length);
  const results: ImpactResult[] = runs.map((r) => ({
    prompt: r.promptText,
    engine: r.engine,
    mentioned: r.mentioned,
    position: r.position,
    rivals: t.competitors.filter((c) => c.name && brandMentioned(r.responseText, { name: c.name })).map((c) => c.name),
    sources: [...new Set(r.citations.map((c) => host(c.domain || c.url)).filter(Boolean))].slice(0, 8),
  }));
  return { at: new Date().toISOString(), results };
}

export interface ImpactSummary {
  /** Anılma oranı (0-1). */
  before: number | null;
  after: number | null;
  /** Kaç cevap (soru × motor) ölçüldü. */
  beforeN: number;
  afterN: number;
  /** Sonradaki ölçüm sayısı (ortalaması alınan). */
  afterChecks: number;
  verdict: "waiting" | "up" | "down" | "flat" | "early";
  perPrompt: { prompt: string; intent: string; before: number | null; after: number | null; engines: { engine: string; before: boolean | null; after: number | null }[] }[];
  /** Sonradaki ölçümlerde bu sitenin/ sayfanın kaynak olarak gösterildiği cevap sayısı. */
  ownCitedAfter: number;
}

const rate = (rs: ImpactResult[]) => (rs.length ? rs.filter((r) => r.mentioned).length / rs.length : null);

/** Önce/sonra özeti. "Sonra" = işin tamamlanmasından sonraki ölçümlerin ortalaması (dalgalanmayı azaltır). */
export function summarizeImpact(t: ImpactTrack, ownDomain: string): ImpactSummary {
  const base = t.baseline?.results ?? [];
  const afterChecks = t.checks.filter((c) => !t.doneAt || c.at >= t.doneAt);
  const after = afterChecks.flatMap((c) => c.results);
  const b = rate(base);
  const a = rate(after);
  const perPrompt = t.prompts.map((p) => {
    const engines = [...new Set([...base, ...after].filter((r) => r.prompt === p.text).map((r) => r.engine))];
    return {
      prompt: p.text,
      intent: p.intent,
      before: rate(base.filter((r) => r.prompt === p.text)),
      after: rate(after.filter((r) => r.prompt === p.text)),
      engines: engines.map((e) => {
        const bb = base.find((r) => r.prompt === p.text && r.engine === e);
        const aa = after.filter((r) => r.prompt === p.text && r.engine === e);
        return { engine: e, before: bb ? bb.mentioned : null, after: aa.length ? aa.filter((r) => r.mentioned).length / aa.length : null };
      }),
    };
  });
  const d = a != null && b != null ? a - b : null;
  const verdict: ImpactSummary["verdict"] = !t.doneAt || !afterChecks.length ? "waiting" : afterChecks.length < 2 ? "early" : d == null ? "waiting" : d >= 0.1 ? "up" : d <= -0.1 ? "down" : "flat";
  const own = host(ownDomain);
  return {
    before: b,
    after: a,
    beforeN: base.length,
    afterN: after.length,
    afterChecks: afterChecks.length,
    verdict,
    perPrompt,
    ownCitedAfter: after.filter((r) => r.sources.some((s) => s === own || s.endsWith("." + own))).length,
  };
}
