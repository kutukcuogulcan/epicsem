import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getFeed, listUsedContentUrls } from "@/lib/db";
import { refreshFeed } from "@/lib/feeds";
import { rateLimit } from "@/lib/rate-limit";

async function load(params: Promise<{ id: string }>) {
  const user = await requireUser();
  if (!user) return { error: NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 }) } as const;
  const { id } = await params;
  const feed = await getFeed(user.id, Number(id));
  if (!feed) return { error: NextResponse.json({ error: "Besleme bulunamadı" }, { status: 404 }) } as const;
  return { user, feed } as const;
}

async function payload(userId: number, feed: Awaited<ReturnType<typeof refreshFeed>>) {
  const used = await listUsedContentUrls(userId);
  return {
    id: feed.id,
    kind: feed.kind,
    name: feed.name,
    config: feed.config,
    lastError: feed.lastError,
    refreshedAt: feed.refreshedAt,
    items: feed.items.map((i) => ({ ...i, used: used.has(i.key) })),
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await load(params);
  if ("error" in r) return r.error;
  return NextResponse.json({ feed: await payload(r.user.id, r.feed) });
}

/** Şimdi yenile — AI kullanmaz. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await load(params);
  if ("error" in r) return r.error;
  const rl = rateLimit(`feed-refresh:${r.user.id}`, 20, 60 * 60 * 1000);
  if (!rl.allowed) return NextResponse.json({ error: "Çok fazla yenileme — biraz sonra tekrar dene." }, { status: 429 });
  const feed = await refreshFeed(r.feed);
  return NextResponse.json({ feed: await payload(r.user.id, feed) });
}
