import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { discoverSiteUrls } from "@/lib/site-urls";
import { sectionsFromUrls } from "@/lib/site-sections";

export const maxDuration = 60;

/** GET /api/site/urls?site=&format=csv — sitenin bütün adresleri (robots.txt → sitemap'ler); bölümler ya da CSV. */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  if (!rateLimit(`site-urls:${user.id}`, 20, 60 * 60 * 1000).allowed) return NextResponse.json({ error: "Saatlik sınıra ulaştın." }, { status: 429 });
  const site = (req.nextUrl.searchParams.get("site") ?? "").trim();
  if (!/\w+\.\w+/.test(site)) return NextResponse.json({ error: "Geçerli bir site adresi gir." }, { status: 400 });
  const r = await discoverSiteUrls(site);
  if (req.nextUrl.searchParams.get("format") === "csv") {
    const host = new URL(r.origin).hostname.replace(/^www\./, "");
    return new NextResponse(["url", ...r.urls.map((u) => `"${u.replace(/"/g, '""')}"`)].join("\n"), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${host}-tum-adresler.csv"` },
    });
  }
  const { total, sections } = sectionsFromUrls(r.urls, new URL(r.origin).hostname);
  return NextResponse.json({ origin: r.origin, blocked: r.blocked, sitemapFiles: r.sitemapFiles, truncated: r.truncated, total, sections });
}
