import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

/** GET /api/indexing/sitemap?url= — site haritasındaki URL'leri okur (sitemap index'leri bir seviye açılır). */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const rl = rateLimit(`sitemap:${user.id}`, 30, 60 * 60 * 1000);
  if (!rl.allowed) return NextResponse.json({ error: "Saatlik sınıra ulaşıldı." }, { status: 429 });
  let raw = (req.nextUrl.searchParams.get("url") ?? "").trim();
  if (!raw) return NextResponse.json({ error: "Site ya da site haritası adresi yaz." }, { status: 400 });
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Geçersiz adres." }, { status: 400 });
  }
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname) || !u.hostname.includes(".")) return NextResponse.json({ error: "Geçersiz adres." }, { status: 400 });
  const start = /\.xml(\.gz)?$/i.test(u.pathname) ? u.toString() : `${u.origin}/sitemap.xml`;

  const get = async (url: string) => {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; EpicsemIndexer/1.0)" }, signal: AbortSignal.timeout(15_000), redirect: "follow" });
    if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
    return r.text();
  };
  const locs = (xml: string) => [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, "&"));
  try {
    const xml = await get(start);
    let urls: string[] = [];
    if (/<sitemapindex/i.test(xml)) {
      for (const sm of locs(xml).slice(0, 10)) {
        try {
          urls.push(...locs(await get(sm)));
        } catch {
          /* tek alt harita atlanır */
        }
        if (urls.length >= 5000) break;
      }
    } else urls = locs(xml);
    urls = [...new Set(urls.filter((x) => /^https?:\/\//.test(x)))].slice(0, 5000);
    if (!urls.length) return NextResponse.json({ error: "Site haritasında URL bulunamadı." }, { status: 404 });
    return NextResponse.json({ sitemap: start, urls });
  } catch (e) {
    return NextResponse.json({ error: `Site haritası okunamadı: ${e instanceof Error ? e.message : "hata"}` }, { status: 502 });
  }
}
