import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateTopicGroundedPrompts } from "@/lib/prompt-suggestions";
import { isDemoMode } from "@/lib/geo-providers";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { checkQuota, consumeQuota, quotaExceededMessage } from "@/lib/usage-guard";

const brandSchema = z.object({ name: z.string().min(1), domain: z.string().min(1) });

const bodySchema = z.object({
  brand: brandSchema,
  competitors: z.array(brandSchema).max(6).default([]),
  topics: z.array(z.string().min(1)).min(1).max(10),
});

/** POST /api/geo/discover-prompts — step 3 of the onboarding wizard: fired the moment the
 * topics screen renders (before the user finishes selecting), covering ALL candidate
 * topics so the prompts step has no wait regardless of which ones the user keeps. See
 * lib/prompt-suggestions.ts's generateTopicGroundedPrompts. */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  const limitResult = rateLimit(`geo-discover-prompts:${user.id}`, 20, 60 * 60 * 1000);
  if (!limitResult.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached — up to 20 calls per hour. Try again shortly." },
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
    const quota = await checkQuota(user.id, "onboardingSetup", 1);
    if (!quota.allowed) {
      return NextResponse.json({ error: quotaExceededMessage("onboardingSetup", quota, 1) }, { status: 402 });
    }
  }

  try {
    const result = await generateTopicGroundedPrompts(
      parsed.brand,
      parsed.competitors.filter((c) => c.name && c.domain),
      parsed.topics
    );
    if (!demoMode) await consumeQuota(user.id, "onboardingSetup", 1);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Prompt generation failed" }, { status: 500 });
  }
}
