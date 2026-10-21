import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getIntegration } from "@/lib/db";
import { bingQueries, bingSites, bingSubmitUrls, bingTraffic, bingUrlQuota } from "@/lib/bing";

async function keyOf(userId: number) {
  return (await getIntegration(userId, "bing").catch(() => null))?.secrets.apiKey ?? null;
}

/**
 * GET  /api/bing            → bağlı mı + siteler
 * GET  /api/bing?site=URL   → günlük tıklama/gösterim, sorgular, URL gönderme kotası
 * POST /api/bing { site, urls[] } → URL'leri Bing'e gönder (SubmitUrlBatch)
 */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const key = await keyOf(user.id);
  if (!key) return NextResponse.json({ connected: false });
  const rl = rateLimit(`bing:${user.id}`, 60, 60 * 60 * 1000);
  if (!rl.allowed) return NextResponse.json({ error: "Saatlik Bing sorgu sınırına ulaştın." }, { status: 429 });
  const site = req.nextUrl.searchParams.get("site");
  try {
    if (!site) return NextResponse.json({ connected: true, sites: await bingSites(key) });
    const [traffic, queries, quota] = await Promise.all([bingTraffic(key, site), bingQueries(key, site), bingUrlQuota(key, site).catch(() => null)]);
    return NextResponse.json({ connected: true, traffic, queries, quota });
  } catch (e) {
    return NextResponse.json({ connected: true, error: e instanceof Error ? e.message : "Bing hatası" }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const key = await keyOf(user.id);
  if (!key) return NextResponse.json({ error: "Bing Webmaster bağlı değil." }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const site = String(b.site ?? "");
  const urls: string[] = Array.isArray(b.urls) ? b.urls.filter((u: unknown) => typeof u === "string" && /^https?:\/\//.test(u)) : [];
  if (!site || !urls.length) return NextResponse.json({ error: "Site ve URL gerekli." }, { status: 400 });
  try {
    return NextResponse.json({ submitted: await bingSubmitUrls(key, site, urls) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gönderilemedi" }, { status: 502 });
  }
}
