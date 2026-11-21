import type { GeoRunResult } from "@/types";
import { analyzeRun, isDemoRun, type BrandRef } from "@/lib/geo-loss";
import { runSmallAiJson } from "@/lib/ai-small";
import { diffRuns, type Cell, type RunDiff } from "@/lib/geo-diff";

/** Haftalık "ne değişti": kod iki testi karşılaştırır (lib/geo-diff), AI yalnızca bu farkları anlatır (1 sorgu). */

export interface ChangeReport {
  status: "ready" | "no-baseline" | "no-change";
  from: string | null;
  to: string;
  diff: RunDiff | null;
  narrative: string[];
  actions: string[];
}

export function toCells(runs: GeoRunResult[], own: BrandRef, rivals: BrandRef[]): Cell[] {
  return runs
    .filter((r) => !isDemoRun(r))
    .map((r) => {
      const a = analyzeRun(r, own, rivals);
      return { prompt: r.promptText, engine: r.engine, status: a.status, ownRank: a.ownRank, rivals: a.rivals.map((x) => x.name), sources: a.sources };
    });
}

const ST: Record<string, string> = { won: "1. sırada", mentioned: "anıldı", lost: "rakip kazandı", empty: "kimse anılmadı" };

export async function generateChange(userId: number, cur: { createdAt: string; runs: GeoRunResult[] }, prev: { createdAt: string; runs: GeoRunResult[] } | null, own: BrandRef, rivals: BrandRef[]): Promise<ChangeReport> {
  if (!prev) return { status: "no-baseline", from: null, to: cur.createdAt, diff: null, narrative: [], actions: [] };
  const diff = diffRuns(toCells(prev.runs, own, rivals), toCells(cur.runs, own, rivals));
  const base = { from: prev.createdAt, to: cur.createdAt, diff };
  if (!diff.compared || (!diff.gained.length && !diff.lost.length && !diff.rivals.length && !diff.newSources.length)) return { ...base, status: "no-change", narrative: [], actions: [] };

  const facts = [
    `Karşılaştırılan cevap: ${diff.compared}. ${own.name} görünürlüğü %${Math.round(diff.visibilityBefore * 100)} → %${Math.round(diff.visibilityAfter * 100)}.`,
    ...diff.gained.map((g) => `KAZANILDI: "${g.prompt}" (${g.engine}): ${ST[g.from]} → ${ST[g.to]}`),
    ...diff.lost.map((l) => `KAYBEDİLDİ: "${l.prompt}" (${l.engine}): ${ST[l.from]} → ${ST[l.to]}${l.rivals.length ? `; şimdi anılanlar: ${l.rivals.join(", ")}` : ""}`),
    ...diff.rivals.map((r) => `RAKİP: ${r.name} ${r.before} → ${r.after} cevapta anıldı`),
    diff.newSources.length ? `YENİ KAYNAKLAR (AI bu kez gösterdi): ${diff.newSources.join(", ")}` : "",
    diff.goneSources.length ? `ARTIK GÖSTERİLMEYEN KAYNAKLAR: ${diff.goneSources.join(", ")}` : "",
  ].filter(Boolean);

  const p = await runSmallAiJson(
    userId,
    `You are a GEO analyst writing a short weekly update in TURKISH for ${own.name}. These are the ONLY facts (comparison of two AI-visibility tests, ${prev.createdAt.slice(0, 10)} → ${cur.createdAt.slice(0, 10)}):
${facts.join("\n")}
Return ONLY JSON: {"narrative":["3-5 short sentences: what changed, the most likely reason based on the facts (e.g. a competitor started being named, new sources appeared), and how significant it is"],"actions":["1-3 concrete next steps tied to the facts above"]}
Rules: use only the facts above; if a reason is uncertain say "muhtemelen"; never invent numbers, sites or competitors; AI answers vary run to run, so call single-answer changes "tek cevaplık" rather than a trend.`
  );
  const list = (v: unknown, n: number) => (Array.isArray(v) ? v : []).map((x) => String(x ?? "").trim()).filter((x) => x.length > 5).slice(0, n);
  return { ...base, status: "ready", narrative: list(p.narrative, 5), actions: list(p.actions, 3) };
}
