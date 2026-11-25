import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getBacklinkCache, setBacklinkCache } from "@/lib/db";
import { getActiveProject } from "@/lib/project-context";
import { discoverSiteUrls } from "@/lib/site-urls";
import { matchUrls, tokens } from "@/lib/fanout";

export const maxDuration = 60;

/** POST {queries} — AI'ın aramalarına sitede karşılık gelen adres (sitemap, 7 gün önbellek). AI yok. */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const parsed = z.object({ queries: z.array(z.string().max(300)).max(500) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  const p = await getActiveProject(user.id).catch(() => null);
  if (!p) return NextResponse.json({ error: "Önce bir proje seç." }, { status: 400 });
  const host = p.domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const key = `urls1:${host}`;
  let site = (await getBacklinkCache<{ urls: string[]; blocked: string | null }>(user.id, key, 24 * 7))?.data;
  if (!site) {
    if (!rateLimit(`fanout:${user.id}`, 10, 60 * 60 * 1000).allowed) return NextResponse.json({ error: "Saatlik sınıra ulaştın." }, { status: 429 });
    const r = await discoverSiteUrls(host);
    site = { urls: r.urls.slice(0, 50_000), blocked: r.blocked };
    if (r.urls.length) await setBacklinkCache(user.id, key, site).catch(() => {});
  }
  return NextResponse.json({ urlCount: site.urls.length, blocked: site.blocked, matches: matchUrls(parsed.data.queries, site.urls, tokens(p.name)) });
}
