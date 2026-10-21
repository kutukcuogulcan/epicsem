import { importRankPoint, rankKeywordId, setRankLatest } from "./db";
import { serpbearKeywords } from "./integrations";

/**
 * SerpBear → Sıralama Takibi aktarımı. SerpBear'daki her kelime (domain + ülke) bizim
 * tabloya eklenir/güncellenir; son 60 günün günlük geçmişi de taşınır. SerpApi harcamaz.
 */
export async function syncSerpBear(userId: number, domain?: string): Promise<{ keywords: number; points: number }> {
  const kws = await serpbearKeywords(userId, domain);
  const cutoff = Date.now() - 60 * 864e5;
  let points = 0;
  for (const k of kws) {
    const d = String(k.domain || "").replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase();
    if (!d || !k.keyword) continue;
    const gl = String(k.country || "tr").toLowerCase().slice(0, 4);
    const id = await rankKeywordId(userId, d, String(k.keyword).trim().slice(0, 120), gl);
    for (const [date, pos] of Object.entries(k.history ?? {})) {
      const at = new Date(`${date}T12:00:00Z`);
      if (isNaN(at.getTime()) || at.getTime() < cutoff) continue;
      if (await importRankPoint(id, pos > 0 && pos <= 100 ? pos : null, null, at)) points++;
    }
    const last = k.lastUpdated ? new Date(k.lastUpdated) : new Date();
    await setRankLatest(id, k.position > 0 && k.position <= 100 ? k.position : null, k.url || null, isNaN(last.getTime()) ? new Date() : last, "serpbear");
  }
  return { keywords: kws.length, points };
}
