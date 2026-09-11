import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createContentInput,
  deleteContentInput,
  getLatestGapRunBriefs,
  listContentInputs,
  listUsedContentUrls,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";

/** GET /api/content-inputs?brandDomain=... — this brand's Content Hub queue. */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  const brandDomain = req.nextUrl.searchParams.get("brandDomain");
  if (!brandDomain) return NextResponse.json({ error: "brandDomain query param is required" }, { status: 400 });

  const inputs = await listContentInputs(user.id, brandDomain);
  return NextResponse.json({ inputs });
}

const brandSchema = z.object({ name: z.string().min(1), domain: z.string().min(1) });

const urlInputSchema = z.object({
  brand: brandSchema,
  type: z.enum(["news", "comparison", "alternatives"]),
  sourceUrl: z.string().min(4),
  language: z.string().min(2).max(10).default("tr"),
});

const briefInputSchema = z.object({
  brand: brandSchema,
  type: z.enum(["seo-gap", "listicle"]),
  language: z.string().min(2).max(10).default("tr"),
});

const createSchema = z.union([urlInputSchema, briefInputSchema]);

/** POST — adds one input to the queue. URL-based types (news/comparison/alternatives)
 * are grounded in whatever URL the caller supplies; brief-based types (seo-gap/listicle)
 * are grounded server-side in the brand's most recent real Gap Analysis findings — the
 * caller never picks the topic, same "never invent a topic" rule Campaign mode follows. */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  let parsed;
  try {
    parsed = createSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }

  if (parsed.type === "news" || parsed.type === "comparison" || parsed.type === "alternatives") {
    const input = await createContentInput(user.id, {
      brandName: parsed.brand.name,
      brandDomain: parsed.brand.domain,
      type: parsed.type,
      topic: parsed.sourceUrl,
      label: parsed.sourceUrl,
      language: parsed.language,
    });
    return NextResponse.json({ input });
  }

  // seo-gap / listicle — pick the next real, not-yet-queued content gap from the most
  // recent Gap Analysis run for this domain (mirrors lib/campaign.ts's own selection).
  const latest = await getLatestGapRunBriefs(user.id, parsed.brand.domain);
  if (!latest || latest.contentBriefs.length === 0) {
    return NextResponse.json(
      { error: "Önce bu marka için bir Gap Analysis çalıştırın — bu tip, gerçek bulgulara dayanır." },
      { status: 400 }
    );
  }
  const usedDraftUrls = await listUsedContentUrls(user.id);
  const existingInputs = await listContentInputs(user.id, parsed.brand.domain);
  const queuedUrls = new Set(existingInputs.map((i) => i.topic));
  const brief = latest.contentBriefs.find((b) => !usedDraftUrls.has(b.url) && !queuedUrls.has(b.url));
  if (!brief) {
    return NextResponse.json(
      { error: "Son Gap Analysis'teki tüm bulgular zaten kuyrukta veya taslağa dönüştürülmüş." },
      { status: 400 }
    );
  }

  const input = await createContentInput(user.id, {
    brandName: parsed.brand.name,
    brandDomain: parsed.brand.domain,
    type: parsed.type,
    topic: brief.url,
    label: brief.suggestedHeadings[0] ?? brief.targetQuestions[0] ?? brief.url,
    brief,
    language: parsed.language,
  });
  return NextResponse.json({ input });
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
  await deleteContentInput(user.id, parsed.id);
  return NextResponse.json({ ok: true });
}
