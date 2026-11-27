import type { GeoRunResult, GeoVisibilitySummary, TopicVisibility } from "../types";
import { brandMentioned } from "./text-match.ts";

/**
 * Alt markalar (Pro Plan, Felix…) sonradan eklendiğinde eski GEO testindeki "anıldı" bilgisini yeniden sayar.
 * Yalnızca anılmamış cevaplar alt markayla anılmış olabilir; anılmış hiçbir cevap geri alınmaz.
 * shortcut: ses payı ve ortalama sıra yeniden hesaplanmaz (yalnızca görünürlük ve konu dağılımı); bir sonraki test hepsini doğru kaydeder.
 */
export function recountWithAliases(
  stored: { runs: GeoRunResult[]; summaries: GeoVisibilitySummary[]; topics: TopicVisibility[] },
  brand: { name: string; domain: string; aliases: string[] }
): { runs: GeoRunResult[]; summaries: GeoVisibilitySummary[]; topics: TopicVisibility[] } | null {
  let changed = 0;
  const runs = stored.runs.map((r) => {
    if (r.mentioned || !r.responseText || !brandMentioned(r.responseText, brand)) return r;
    changed++;
    return { ...r, mentioned: true };
  });
  if (!changed || !runs.length) return null;
  const hits = runs.filter((r) => r.mentioned).length;
  const summaries = stored.summaries.map((s) => (s.domain === brand.domain ? { ...s, visibility: hits / runs.length } : s));
  const topics = stored.topics.map((t) => {
    const rs = runs.filter((r) => (r.topic || "Genel") === t.topic);
    if (!rs.length) return t;
    const m = rs.filter((r) => r.mentioned).length;
    return { ...t, mentionedCount: m, totalCount: rs.length, visibility: m / rs.length };
  });
  return { runs, summaries, topics };
}
