import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listAllRankKeywords, listRankKeywords, saveRankCheck, type RankKeyword } from "@/lib/db";
import { rankOf } from "@/lib/serp";
import { serpKeyFor } from "@/lib/integrations";
import { syncSerpBear } from "@/lib/rank-sync";
import { usersWithIntegration } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Sıralama kontrolü. İki çağıran: GitHub Actions cron (x-cron-secret; günde bir, son
 * kontrolü 20 saatten eski kelimeler) ve kullanıcının "Şimdi kontrol et" düğmesi (kendi kelimeleri).
 * Her kelime 1 SerpApi araması harcar.
 */
export async function POST(req: NextRequest) {
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
    if (!(await serpKeyFor(user.id))) return NextResponse.json({ error: "Sıralama kontrolü için SerpApi bağlantısı gerekli — Entegrasyonlar sayfasından ekle.", needsKey: true }, { status: 400 });
    list = (await listRankKeywords(user.id)).filter((k) => !only || only.includes(k.id)).slice(0, 50);
  }
  // SerpBear'dan gelen kelimeler SerpBear'da taranır; burada SerpApi harcanmaz.
  list = list.filter((k) => k.source !== "serpbear");
  const keys = new Map<number, string | null>();
  for (const uid of new Set(list.map((k) => k.userId))) keys.set(uid, await serpKeyFor(uid));
  list = list.filter((k) => keys.get(k.userId));
  let synced = 0;
  if (isCron) {
    // SerpBear bağlı kullanıcıların güncel sıralamalarını da çek.
    for (const uid of await usersWithIntegration("serpbear")) {
      try {
        synced += (await syncSerpBear(uid)).keywords;
      } catch (e) {
        console.error("serpbear sync failed", uid, e);
      }
    }
    if (!list.length) return NextResponse.json({ checked: 0, synced });
  }
  let checked = 0;
  const errors: string[] = [];
  for (let i = 0; i < list.length; i += 4) {
    await Promise.all(
      list.slice(i, i + 4).map(async (k) => {
        try {
          const r = await rankOf(k.keyword, k.domain, { gl: k.gl, hl: k.gl === "tr" ? "tr" : "en", apiKey: keys.get(k.userId) });
          await saveRankCheck(k.id, r.position, r.url);
          checked++;
        } catch (e) {
          errors.push(`${k.keyword}: ${e instanceof Error ? e.message : "hata"}`);
        }
      })
    );
  }
  return NextResponse.json({ checked, synced, errors: errors.slice(0, 5) });
}
