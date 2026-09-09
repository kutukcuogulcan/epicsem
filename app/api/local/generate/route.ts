import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { generateGbpPost, generateReviewReply } from "@/lib/local-content";
import { isDemoMode } from "@/lib/geo-providers";
import { checkQuota, consumeQuota, quotaExceededMessage } from "@/lib/usage-guard";

// Reuses the same "contentGenerations" quota as /api/content/generate — a GBP post or a
// review reply is the same kind of AI content generation, just a different destination.
const bodySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("gbp-post"),
    brandName: z.string().min(1).max(200),
    brandDomain: z.string().min(1).max(200),
    topic: z.string().min(1).max(300),
  }),
  z.object({
    kind: z.literal("review-reply"),
    brandName: z.string().min(1).max(200),
    brandDomain: z.string().min(1).max(200),
    reviewText: z.string().min(1).max(2000),
    rating: z.number().min(1).max(5).optional(),
  }),
]);

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  const limitResult = rateLimit(`local-gen:${user.id}`, 30, 60 * 60 * 1000);
  if (!limitResult.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limitResult.resetAt)) } }
    );
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }

  const demoMode = isDemoMode();
  if (!demoMode) {
    const quota = await checkQuota(user.id, "contentGenerations", 1);
    if (!quota.allowed) {
      return NextResponse.json({ error: quotaExceededMessage("contentGenerations", quota, 1) }, { status: 402 });
    }
  }

  try {
    const brand = { name: parsed.brandName, domain: parsed.brandDomain };
    const result =
      parsed.kind === "gbp-post"
        ? await generateGbpPost(brand, parsed.topic)
        : await generateReviewReply(brand, parsed.reviewText, parsed.rating);

    if (!demoMode) await consumeQuota(user.id, "contentGenerations", 1);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}
