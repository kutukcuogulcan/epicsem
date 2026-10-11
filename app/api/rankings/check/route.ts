import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listAllRankKeywords, listRankKeywords, saveRankCheck, type RankKeyword } from "@/lib/db";
import { rankOf, serpAvailable } from "@/lib/serp";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Sıralama kontrolü. İki çağıran: GitHub Actions cron (x-cron-secret; günde bir, son
 * kontrolü 20 saatten eski kelimeler) ve kullanıcının "Şimdi kontrol et" düğmesi (kendi kelimeleri).
 * Her kelime 1 SerpApi araması harcar.
 */
export async function POST(req: NextRequest) {
  if (!serpAvailable()) return NextResponse.json({ error: "Sıralama takibi için SerpApi anahtarı gerekli (SERPAPI_API_KEY).", needsKey: true }, { status: 400 });
  const isCron = !!process.env.CRON_SECRET && req.headers.get("x-cron-secret") === process.env.CRON_SECRET;
  let list: RankKeyword[];
  if (isCron) {
    const cutoff = Date.now() - 20 * 3600e3;
    list = (await listAllRankKeywords()).filter((k) => !k.lastCheckedAt || new Date(k.lastCheckedAt).getTime() < cutoff).slice(0, 400);
  } else {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
    const rl = rateLimit(`rank-check:${user.id}`, 6, 60 * 60 * 1000);
    if (!rl.allowed) return NextResponse.json({ error: "Saatte en fazla 6 manuel kontrol yapılabilir." }, { status: 429 });
    const body = await req.json().catch(() => ({}));
    const only: number[] | null = Array.isArray(body?.ids) ? body.ids.map(Number) : null;
    list = (await listRankKeywords(user.id)).filter((k) => !only || only.includes(k.id)).slice(0, 50);
  }
  let checked = 0;
  const errors: string[] = [];
  for (let i = 0; i < list.length; i += 4) {
    await Promise.all(
      list.slice(i, i + 4).map(async (k) => {
        try {
          const r = await rankOf(k.keyword, k.domain, { gl: k.gl, hl: k.gl === "tr" ? "tr" : "en" });
          await saveRankCheck(k.id, r.position, r.url);
          checked++;
        } catch (e) {
          errors.push(`${k.keyword}: ${e instanceof Error ? e.message : "hata"}`);
        }
      })
    );
  }
  return NextResponse.json({ checked, errors: errors.slice(0, 5) });
}
