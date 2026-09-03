import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generatePromptSuggestions } from "@/lib/prompt-suggestions";
import { isDemoMode } from "@/lib/geo-providers";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { checkQuota, consumeQuota, quotaExceededMessage } from "@/lib/usage-guard";

const brandSchema = z.object({ name: z.string().min(1), domain: z.string().min(1) });

const bodySchema = z.object({
  brand: brandSchema,
  competitors: z.array(brandSchema).max(6).default([]),
});

/** POST /api/geo/suggest-prompts — generate GEO test prompts from just a brand + domain, so a new user has something to run on their first visit instead of a blank textarea. */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  const limitResult = rateLimit(`geo-suggest:${user.id}`, 20, 60 * 60 * 1000);
  if (!limitResult.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached — up to 20 prompt-suggestion calls per hour. Try again shortly." },
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
    const quota = await checkQuota(user.id, "promptSuggestions", 1);
    if (!quota.allowed) {
      return NextResponse.json({ error: quotaExceededMessage("promptSuggestions", quota, 1) }, { status: 402 });
    }
  }

  try {
    const result = await generatePromptSuggestions(parsed.brand, parsed.competitors);
    if (!demoMode) await consumeQuota(user.id, "promptSuggestions", 1);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Prompt suggestion failed" },
      { status: 500 }
    );
  }
}
