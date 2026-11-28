import type { GeoRunResult } from "../types";
import type { GeoReport } from "./geo-report.ts";

/**
 * Otomatik izlemenin sabit soru seti (Peec'teki gibi her seferinde aynı sorular → trend gerçek değişimi gösterir).
 * Öncelik: kaybedilen sorular → rakibin önde olduğu sorular → diğerleri; en fazla n soru, konusu korunur.
 */
export function pickTrackedPrompts(runs: GeoRunResult[], report: GeoReport, n = 5): { text: string; topic: string }[] {
  const topicOf = new Map<string, string>();
  for (const r of runs) if (!topicOf.has(r.promptText)) topicOf.set(r.promptText, r.topic || "Genel");
  const order = [...report.lost.map((q) => q.question), ...(report.leader?.ahead ?? []).map((a) => a.question), ...topicOf.keys()];
  return [...new Set(order)].filter((q) => topicOf.has(q)).slice(0, n).map((text) => ({ text, topic: topicOf.get(text)! }));
}
