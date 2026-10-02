import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateTopicsForBrand } from "@/lib/topic-generator";
import { matchSectorPack, renderTopicSeeds } from "@/lib/sector-packs";
import { isDemoMode } from "@/lib/geo-providers";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { checkQuota, consumeQuota, quotaExceededMessage } from "@/lib/usage-guard";

const brandSchema = z.object({
  name: z.string().min(1),
  domain: z.string().min(1),
  description: z.string().default(""),
  industry: z.string().default(""),
  identityAdjectives: z.array(z.string()).default([]),
  productTags: z.array(z.string()).default([]),
});

const bodySchema = z.object({
  brand: brandSchema,
  country: z.string().min(1).default("Türkiye"),
  language: z.enum(["tr", "en"]).default("tr"),
  /** Optional — omit to let matchSectorPack() derive seeds from brand.industry/description
   * (Kart 13's E3 keyword match) instead of the caller supplying its own list. */
  sectorSeeds: z.array(z.string()).max(20).optional(),
});

/** POST /api/geo/discover-topics — step 2 of the onboarding wizard: the wizard fires this
 * in the background the moment step 1 resolves, while the user is still reading the brand
 * profile screen. See lib/topic-generator.ts — the LLM only proposes+scores candidates,
 * dedup/ranking/the top-5 auto-select are deterministic code (Kart 11 of the methodology). */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  const limitResult = rateLimit(`geo-discover-topics:${user.id}`, 20, 60 * 60 * 1000);
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
    const sectorSeeds =
      parsed.sectorSeeds ?? renderTopicSeeds(matchSectorPack(parsed.brand.industry, parsed.brand.description), parsed.brand.industry);
    const result = await generateTopicsForBrand(parsed.brand, parsed.country, parsed.language, sectorSeeds);
    if (!demoMode) await consumeQuota(user.id, "onboardingSetup", 1);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Topic generation failed" }, { status: 500 });
  }
}
