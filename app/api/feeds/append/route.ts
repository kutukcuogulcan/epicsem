import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";
import { createFeed, getFeed, listFeeds, saveFeedItems, updateFeedConfig } from "@/lib/db";

const schema = z.object({
  keywords: z.array(z.string().trim().min(2).max(160)).min(1).max(50),
  feedId: z.number().int().optional(),
  siteUrl: z.string().trim().max(300).optional(),
});

/**
 * POST /api/feeds/append — GEO "Fırsatlar"dan seçilen soruları bir anahtar kelime beslemesine ekler.
 * feedId yoksa bu site için "GEO fırsatları" beslemesini bulur ya da oluşturur. AI kullanmaz.
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  let p;
  try {
    p = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }
  let feed = p.feedId ? await getFeed(user.id, p.feedId) : null;
  if (!feed) {
    const host = (p.siteUrl ?? "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    feed = (await listFeeds(user.id)).find((f) => f.kind === "keyword" && f.name === `GEO fırsatları · ${host}`) ?? null;
    if (!feed) feed = await createFeed(user.id, { kind: "keyword", name: `GEO fırsatları · ${host || "site"}`, config: { siteUrl: host, seeds: [], competitors: [], country: "TR", language: "tr" } });
  }
  if (feed.kind !== "keyword") return NextResponse.json({ error: "Sadece anahtar kelime beslemesine eklenebilir" }, { status: 400 });
  const now = new Date().toISOString();
  const items = [...feed.items];
  const keys = new Set(items.map((i) => i.key));
  let added = 0;
  for (const kw of p.keywords) {
    const key = `keyword:${kw.toLocaleLowerCase("tr")}`;
    if (keys.has(key)) continue;
    keys.add(key);
    items.unshift({ key, title: kw, source: "GEO fırsatı", addedAt: now });
    added++;
  }
  const seeds = Array.from(new Set([...(feed.config.seeds ?? []), ...p.keywords])).slice(0, 30);
  await updateFeedConfig(user.id, feed.id, { name: feed.name, config: { ...feed.config, seeds } });
  await saveFeedItems(feed.id, items, null);
  return NextResponse.json({ feedId: feed.id, feedName: feed.name, added });
}
