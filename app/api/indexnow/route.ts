import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { submitIndexNow } from "@/lib/indexnow";
import { hostOf, indexNowKeyFor as keyFor } from "@/lib/indexnow-keys";

/**
 * POST /api/indexnow { urls: string[] } — URL'leri IndexNow ile Bing/Yandex/Seznam/Naver'a bildirir.
 * GET  /api/indexnow?site= → bu site için IndexNow hazır mı?
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const rl = rateLimit(`indexnow:${user.id}`, 30, 60 * 60 * 1000);
  if (!rl.allowed) return NextResponse.json({ error: "Saatlik IndexNow gönderim sınırına ulaştın." }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  const urls: string[] = Array.isArray(b.urls) ? b.urls.filter((u: unknown) => typeof u === "string" && /^https?:\/\//.test(u)).slice(0, 10_000) : [];
  if (!urls.length) return NextResponse.json({ error: "Gönderilecek URL yok." }, { status: 400 });
  const byHost = new Map<string, string[]>();
  for (const u of urls) {
    const h = hostOf(u);
    if (h) byHost.set(h, [...(byHost.get(h) ?? []), u]);
  }
  const results: { host: string; ok: boolean; count: number; detail: string; via?: string }[] = [];
  for (const [host, list] of byHost) {
    const k = await keyFor(user.id, host);
    if (!k) {
      results.push({ host, ok: false, count: 0, detail: "IndexNow bu site için kurulu değil — Entegrasyonlar'dan ekle ya da Epicsem Connector 1.2 kur." });
      continue;
    }
    // Gönderim, anahtarın kayıtlı olduğu adresin protokol ve host'uyla yapılır.
    const base = new URL(k.siteUrl);
    const fixed = list.map((u) => {
      const x = new URL(u);
      x.protocol = base.protocol;
      x.host = base.host;
      return x.toString();
    });
    const r = await submitIndexNow(k.siteUrl, k.key, fixed);
    results.push({ host, ok: r.ok, count: r.count, detail: r.detail, via: k.via });
  }
  return NextResponse.json({ results });
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const site = req.nextUrl.searchParams.get("site") ?? "";
  const host = hostOf(/^https?:/.test(site) ? site : `https://${site}`);
  const k = host ? await keyFor(user.id, host) : null;
  return NextResponse.json({ ready: !!k, via: k?.via ?? null });
}
