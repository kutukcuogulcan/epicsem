import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";
import { createFeed, deleteFeed, getFeed, listCampaigns, listFeeds, listUsedContentUrls, updateFeedConfig } from "@/lib/db";
import { refreshFeed } from "@/lib/feeds";
import { rateLimit } from "@/lib/rate-limit";

/** Beslemeler — AI kullanmaz, kredi harcamaz. */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const [feeds, campaigns, used] = await Promise.all([listFeeds(user.id), listCampaigns(user.id), listUsedContentUrls(user.id)]);
  return NextResponse.json({
    feeds: feeds.map((f) => ({
      id: f.id,
      kind: f.kind,
      name: f.name,
      config: f.config,
      total: f.items.length,
      done: f.items.filter((i) => used.has(i.key)).length,
      lastError: f.lastError,
      refreshedAt: f.refreshedAt,
      createdAt: f.createdAt,
      usedBy: campaigns.filter((c) => c.source === "feed" && c.config.feedId === f.id).map((c) => ({ id: c.id, name: c.brandName, status: c.status })),
    })),
  });
}

const list = z.array(z.string().trim().min(1).max(160)).max(30).default([]);
const feedSchema = z
  .object({
    kind: z.enum(["keyword", "news", "rss", "youtube"]),
    name: z.string().trim().min(1, "Besleme adı gerekli").max(80),
    config: z.object({
      siteUrl: z.string().trim().max(300).optional(),
      seeds: list.optional(),
      competitors: z.array(z.string().trim().min(1).max(300)).max(5).optional(),
      country: z.string().trim().max(4).optional(),
      language: z.string().trim().max(8).optional(),
      query: z.string().trim().max(200).optional(),
      url: z.string().trim().max(500).optional(),
      filter: list.optional(),
    }),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "keyword" && !(v.config.seeds ?? []).length) ctx.addIssue({ code: "custom", message: "En az bir başlangıç kelimesi girin" });
    if (v.kind === "news" && !v.config.query) ctx.addIssue({ code: "custom", message: "Haber konusu girin" });
    if ((v.kind === "rss" || v.kind === "youtube") && !v.config.url) ctx.addIssue({ code: "custom", message: v.kind === "youtube" ? "YouTube kanal adresini girin" : "Besleme ya da site adresini girin" });
  });

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const rl = rateLimit(`feed-create:${user.id}`, 30, 60 * 60 * 1000);
  if (!rl.allowed) return NextResponse.json({ error: "Çok fazla istek — biraz sonra tekrar dene." }, { status: 429 });
  let parsed;
  try {
    parsed = feedSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }
  const feed = await refreshFeed(await createFeed(user.id, parsed));
  return NextResponse.json({ feed: { id: feed.id, total: feed.items.length, lastError: feed.lastError } });
}

export async function PUT(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  let body: any;
  let parsed;
  try {
    body = await req.json();
    parsed = feedSchema.parse(body);
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }
  const id = Number(body?.id);
  const existing = Number.isInteger(id) ? await getFeed(user.id, id) : null;
  if (!existing) return NextResponse.json({ error: "Besleme bulunamadı" }, { status: 404 });
  await updateFeedConfig(user.id, id, { name: parsed.name, config: parsed.config });
  const feed = await refreshFeed({ ...existing, name: parsed.name, config: parsed.config });
  return NextResponse.json({ feed: { id: feed.id, total: feed.items.length, lastError: feed.lastError } });
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Geçersiz besleme" }, { status: 400 });
  const inUse = (await listCampaigns(user.id)).filter((c) => c.source === "feed" && c.config.feedId === id);
  if (inUse.length) return NextResponse.json({ error: `Bu besleme ${inUse.length} autoblog tarafından kullanılıyor — önce onları değiştir ya da sil.` }, { status: 409 });
  await deleteFeed(user.id, id);
  return NextResponse.json({ ok: true });
}
