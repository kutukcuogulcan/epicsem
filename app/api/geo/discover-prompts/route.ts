import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fillAllSlots, generateBrandedTopicPrompts } from "@/lib/prompt-suggestions";
import { planSlotsForTopics } from "@/lib/slot-planner";
import { getSectorPack, matchSectorPack, PERSONA_ORDER } from "@/lib/sector-packs";
import { isDemoMode } from "@/lib/geo-providers";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { checkQuota, consumeQuota, quotaExceededMessage } from "@/lib/usage-guard";

const brandSchema = z.object({ name: z.string().min(1), domain: z.string().min(1) });

const topicSchema = z.union([
  z.string().min(1).transform((name) => ({ name, description: "" })),
  z.object({ name: z.string().min(1), description: z.string().default("") }),
]);

const bodySchema = z.object({
  brand: z.object({
    name: z.string().min(1),
    domain: z.string().min(1),
    description: z.string().default(""),
    industry: z.string().default(""),
    productTags: z.array(z.string()).default([]),
  }),
  competitors: z.array(brandSchema).max(6).default([]),
  topics: z.array(topicSchema).min(1).max(10),
  /** Share (0-100) of each of the 3 fixed audience archetypes — as returned by
   * lib/brand-discovery.ts's discoverBrandFromUrl, or edited by the user in the wizard's
   * audience step. Re-normalized below regardless of what it sums to. */
  audience: z.object({ simple: z.number(), informed: z.number(), researcher: z.number() }).optional(),
  /** Explicit override — omit to let matchSectorPack() pick from brand.industry/description
   * (Kart 13's E3 keyword match, falling back to the Genel pack). */
  sectorPackId: z.string().optional(),
  country: z.string().min(1).default("Türkiye"),
  includeBrandedTopic: z.boolean().default(false),
  /** D5's package-limit crop — omit to keep every planned slot's prompt. */
  limit: z.number().int().positive().max(200).optional(),
  language: z.enum(["tr", "en"]).default("tr"),
});

/** POST /api/geo/discover-prompts — step 3 of the onboarding wizard: fired the moment the
 * topics screen renders (before the user finishes selecting), covering ALL candidate
 * topics so the prompts step has no wait regardless of which ones the user keeps.
 *
 * Per the methodology's "Metodoloji 2/2" (Kart 14): this route no longer asks an LLM to
 * freely invent prompts. lib/slot-planner.ts (pure code) first decides EXACTLY what each of
 * the 8 prompts per topic must be — its intent/persona/form/modifiers — then
 * lib/prompt-suggestions.ts's fillAllSlots asks the LLM only to write the sentence for each
 * already-fully-specified slot, in parallel across topics. */
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
    const raw = parsed.audience ?? { simple: 34, informed: 33, researcher: 33 };
    const rawTotal = PERSONA_ORDER.reduce((sum, k) => sum + Math.max(0, raw[k] || 0), 0);
    const audience =
      rawTotal > 0
        ? Object.fromEntries(PERSONA_ORDER.map((k) => [k, Math.max(0, raw[k] || 0) / rawTotal])) as Record<(typeof PERSONA_ORDER)[number], number>
        : { simple: 1 / 3, informed: 1 / 3, researcher: 1 / 3 };

    const pack = parsed.sectorPackId ? getSectorPack(parsed.sectorPackId) : matchSectorPack(parsed.brand.industry, parsed.brand.description);
    const topicNames = parsed.topics.map((t) => t.name);
    const topicDescriptions = new Map(parsed.topics.map((t) => [t.name, t.description]));
    const slots = planSlotsForTopics(topicNames, pack, audience, 8, parsed.brand.productTags);

    const slotsByTopic = new Map<string, typeof slots>();
    for (const slot of slots) {
      const list = slotsByTopic.get(slot.topic) ?? [];
      list.push(slot);
      slotsByTopic.set(slot.topic, list);
    }

    const competitors = parsed.competitors.filter((c) => c.name && c.domain);
    const {
      prompts,
      demoMode: fillDemoMode,
      model,
    } = await fillAllSlots({
      brand: parsed.brand,
      competitors,
      slotsByTopic,
      topicDescriptions,
      pack,
      language: parsed.language,
      country: parsed.country,
      limit: parsed.limit,
    });

    const brandedPrompts = parsed.includeBrandedTopic ? generateBrandedTopicPrompts(parsed.brand, competitors) : [];

    if (!demoMode) await consumeQuota(user.id, "onboardingSetup", 1);
    return NextResponse.json({
      prompts: [...prompts, ...brandedPrompts],
      demoMode: fillDemoMode,
      model,
      sectorPackId: pack.id,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Prompt generation failed" }, { status: 500 });
  }
}
