import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { campaignDraftStats, createCampaign, deleteCampaign, getCmsConnectionSecret, getFeed, listCampaigns, listCmsConnections, listFeeds, listUsedContentUrls, setCampaignStatus, updateCampaign } from "@/lib/db";
import { keywordKey } from "@/lib/campaign";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const [campaigns, stats, used, feeds, connections] = await Promise.all([
    listCampaigns(user.id),
    campaignDraftStats(user.id),
    listUsedContentUrls(user.id),
    listFeeds(user.id),
    listCmsConnections(user.id),
  ]);
  const feedById = new Map(feeds.map((f) => [f.id, f]));
  return NextResponse.json({
    campaigns: campaigns.map((c) => {
      const kws = c.config.keywords ?? [];
      const feed = c.source === "feed" && c.config.feedId ? feedById.get(c.config.feedId) : undefined;
      const conn = c.options.connectionId ? connections.find((x) => x.id === c.options.connectionId) : undefined;
      return {
        ...c,
        drafts: stats[c.id]?.count ?? 0,
        lastDraft: stats[c.id]?.last ?? null,
        feed: feed ? { id: feed.id, name: feed.name, kind: feed.kind } : null,
        connection: conn ? { id: conn.id, label: conn.label, platform: conn.platform } : null,
        queue:
          c.source === "keywords"
            ? { total: kws.length, done: kws.filter((k) => used.has(keywordKey(k))).length }
            : feed
              ? { total: feed.items.length, done: feed.items.filter((i) => used.has(i.key)).length }
              : null,
      };
    }),
    feeds: feeds.map((f) => ({ id: f.id, name: f.name, kind: f.kind, items: f.items.length })),
    connections: connections.map((x) => ({ id: x.id, label: x.label, platform: x.platform, siteUrl: x.siteUrl })),
  });
}

const createSchema = z
  .object({
    brandName: z.string().trim().min(1, "Marka adı gerekli"),
    brandDomain: z
      .string()
      .trim()
      .min(1, "Domain gerekli")
      .transform((d) => d.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase()),
    frequency: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
    source: z.enum(["gap", "rss", "keywords", "feed"]).default("gap"),
    mode: z.enum(["review", "cms-draft", "publish"]).default("review"),
    options: z
      .object({
        connectionId: z.number().int().nullable().optional(),
        randomMinutes: z.number().int().min(0).max(1440).optional(),
        language: z.string().trim().max(8).optional(),
        cover: z.enum(["none", "branded", "ai"]).optional(),
        toc: z.boolean().optional(),
        takeaways: z.boolean().optional(),
      })
      .default({}),
    postsPerRun: z.number().int().min(1).max(3).default(1),
    format: z.enum(["article", "listicle"]).default("article"),
    config: z
      .object({
        rssUrl: z.string().trim().max(500).optional(),
        rssFilter: z.array(z.string().trim().max(60)).max(20).optional(),
        keywords: z.array(z.string().trim().min(1).max(160)).max(200).optional(),
        feedId: z.number().int().optional(),
      })
      .default({}),
  })
  .superRefine((v, ctx) => {
    if (v.source === "rss" && !v.config.rssUrl) ctx.addIssue({ code: "custom", message: "RSS kaynağı için besleme adresi gerekli" });
    if (v.source === "keywords" && !(v.config.keywords ?? []).length) ctx.addIssue({ code: "custom", message: "En az bir anahtar kelime girin" });
    if (v.source === "feed" && !v.config.feedId) ctx.addIssue({ code: "custom", message: "Bir besleme seçin" });
    if (v.mode !== "review" && !v.options.connectionId) ctx.addIssue({ code: "custom", message: "Siteye göndermek için bir entegrasyon seçin" });
  });

/** Besleme ve entegrasyonun bu kullanıcıya ait olduğunu doğrular. */
async function ownershipError(userId: number, v: z.infer<typeof createSchema>): Promise<string | null> {
  if (v.source === "feed" && v.config.feedId && !(await getFeed(userId, v.config.feedId))) return "Besleme bulunamadı";
  if (v.mode !== "review" && v.options.connectionId && !(await getCmsConnectionSecret(userId, v.options.connectionId))) return "Entegrasyon bulunamadı";
  return null;
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  let parsed;
  try {
    parsed = createSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }
  const owned = await ownershipError(user.id, parsed);
  if (owned) return NextResponse.json({ error: owned }, { status: 400 });
  const campaign = await createCampaign(user.id, parsed);
  return NextResponse.json({ campaign });
}

/** Kampanya ayarlarını düzenle (kaynak, sıklık, anahtar kelimeler…). */
export async function PUT(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  let body: any;
  let parsed;
  try {
    body = await req.json();
    parsed = createSchema.parse(body);
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }
  const id = Number(body?.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Geçersiz kampanya" }, { status: 400 });
  const owned = await ownershipError(user.id, parsed);
  if (owned) return NextResponse.json({ error: owned }, { status: 400 });
  await updateCampaign(user.id, id, parsed);
  return NextResponse.json({ ok: true });
}

const statusSchema = z.object({ id: z.number(), status: z.enum(["active", "paused"]) });

export async function PATCH(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  let parsed;
  try {
    parsed = statusSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }
  await setCampaignStatus(user.id, parsed.id, parsed.status);
  return NextResponse.json({ ok: true });
}

const deleteSchema = z.object({ id: z.number() });

export async function DELETE(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  let parsed;
  try {
    parsed = deleteSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }
  await deleteCampaign(user.id, parsed.id);
  return NextResponse.json({ ok: true });
}
