import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getLatestCrawlPages } from "@/lib/db";
import { sitePagesForLinks } from "@/lib/article-enrich";

/** GET /api/editor/links?domain= → sitenin sayfaları: son Site Taraması, yoksa sitemap.xml (iç link önerisi için, AI yok). */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const d = (req.nextUrl.searchParams.get("domain") ?? "").replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").trim();
  if (!d) return NextResponse.json({ pages: [] });
  const crawl = await getLatestCrawlPages(user.id, d);
  if (crawl.length >= 5) return NextResponse.json({ pages: crawl });
  const sm = await sitePagesForLinks(user.id, d, 200).catch(() => []);
  return NextResponse.json({ pages: sm.map((p) => ({ url: p.url, title: p.title, h1: null })) });
}
