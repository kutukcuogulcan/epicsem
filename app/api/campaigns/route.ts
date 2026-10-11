import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { campaignDraftStats, createCampaign, deleteCampaign, listCampaigns, listUsedContentUrls, setCampaignStatus, updateCampaign } from "@/lib/db";
import { keywordKey } from "@/lib/campaign";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const [campaigns, stats, used] = await Promise.all([listCampaigns(user.id), campaignDraftStats(user.id), listUsedContentUrls(user.id)]);
  return NextResponse.json({
    campaigns: campaigns.map((c) => {
      const kws = c.config.keywords ?? [];
      return {
        ...c,
        drafts: stats[c.id]?.count ?? 0,
        lastDraft: stats[c.id]?.last ?? null,
        queue: c.source === "keywords" ? { total: kws.length, done: kws.filter((k) => used.has(keywordKey(k))).length } : null,
      };
    }),
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
    source: z.enum(["gap", "rss", "keywords"]).default("gap"),
    postsPerRun: z.number().int().min(1).max(3).default(1),
    format: z.enum(["article", "listicle"]).default("article"),
    config: z
      .object({
        rssUrl: z.string().trim().max(500).optional(),
        rssFilter: z.array(z.string().trim().max(60)).max(20).optional(),
        keywords: z.array(z.string().trim().min(1).max(160)).max(200).optional(),
      })
      .default({}),
  })
  .superRefine((v, ctx) => {
    if (v.source === "rss" && !v.config.rssUrl) ctx.addIssue({ code: "custom", message: "RSS kaynağı için besleme adresi gerekli" });
    if (v.source === "keywords" && !(v.config.keywords ?? []).length) ctx.addIssue({ code: "custom", message: "En az bir anahtar kelime girin" });
  });

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  let parsed;
  try {
    parsed = createSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }
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
