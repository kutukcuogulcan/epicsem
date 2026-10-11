import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { campaignKeywordIdeas, listUsedContentUrls } from "@/lib/db";
import { fetchFeed, matchesFilter } from "@/lib/rss";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Autoblog kurulumu için önizleme — AI kullanmaz, kota harcamaz.
 *  POST { rssUrl, rssFilter? }  → beslemeyi bulur, son öğeleri ve hangilerinin yeni olduğunu döner
 *  GET  ?domain=site.com        → kullanıcının kendi verisinden anahtar kelime fikirleri
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const rl = rateLimit(`rss-preview:${user.id}`, 30, 60 * 60 * 1000);
  if (!rl.allowed) return NextResponse.json({ error: "Çok fazla önizleme isteği — biraz sonra tekrar dene." }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const rssUrl = String(body?.rssUrl ?? "").trim();
  if (!rssUrl) return NextResponse.json({ error: "Besleme ya da site adresi girin" }, { status: 400 });
  const filter: string[] = Array.isArray(body?.rssFilter) ? body.rssFilter.map(String) : [];
  try {
    const [feed, used] = await Promise.all([fetchFeed(rssUrl), listUsedContentUrls(user.id)]);
    return NextResponse.json({
      feedUrl: feed.feedUrl,
      title: feed.title,
      total: feed.items.length,
      items: feed.items.slice(0, 12).map((it) => ({ ...it, used: used.has(it.link), matches: matchesFilter(it, filter) })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    const friendly =
      !msg || /fetch failed|aborted|ENOTFOUND|ECONNREFUSED/i.test(msg) || (err as Error)?.name === "AbortError"
        ? "Adrese ulaşılamadı — adresi kontrol et ya da beslemenin tam adresini gir (ör. site.com/feed)."
        : msg;
    return NextResponse.json({ error: friendly }, { status: 422 });
  }
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const domain = (req.nextUrl.searchParams.get("domain") ?? "").replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
  if (!domain) return NextResponse.json({ ideas: [] });
  return NextResponse.json({ ideas: await campaignKeywordIdeas(user.id, domain) });
}
