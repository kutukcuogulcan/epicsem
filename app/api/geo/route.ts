import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { EngineId } from "@/types";
import { ALL_ENGINES, computeShareOfVoice, computeSourceDistribution, runPromptAcrossEngines, summarizeVisibility } from "@/lib/geo-engine";
import { isDemoMode } from "@/lib/geo-providers";
import { getPreviousGeoRun, saveGeoRun } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { checkQuota, consumeQuota, quotaExceededMessage } from "@/lib/usage-guard";

const brandSchema = z.object({ name: z.string().min(1), domain: z.string().min(1) });

const bodySchema = z.object({
  brand: brandSchema,
  competitors: z.array(brandSchema).max(6).default([]),
  prompts: z.array(z.string().min(3)).min(1).max(10),
  engines: z.array(z.enum(["openai", "anthropic", "google", "perplexity", "deepseek", "xai", "meta", "microsoft"])).default(ALL_ENGINES),
});

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  // GEO runs fan out to N prompts × M engines — each real (non-demo) run costs LLM
  // API spend, so this gets a tighter cap than a plain audit.
  const limitResult = rateLimit(`geo:${user.id}`, 15, 60 * 60 * 1000);
  if (!limitResult.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached — up to 15 GEO tests per hour. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limitResult.resetAt)) } }
    );
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }

  const { brand, competitors, prompts, engines } = parsed;
  const demoMode = isDemoMode();

  // Only gate/count when a real (billable) call is about to happen — demo mode costs
  // nothing, so it isn't metered. See lib/plans.ts for why there's no payment step here.
  const plannedQueries = prompts.length * engines.length;
  if (!demoMode) {
    const quota = checkQuota(user.id, "engineQueries", plannedQueries);
    if (!quota.allowed) {
      return NextResponse.json({ error: quotaExceededMessage("engineQueries", quota, plannedQueries) }, { status: 402 });
    }
  }

  const allRuns = (
    await Promise.all(
      prompts.map((p) => runPromptAcrossEngines(p, brand, competitors, engines as EngineId[]))
    )
  ).flat();
  if (!demoMode) consumeQuota(user.id, "engineQueries", plannedQueries);

  const allBrands = [brand, ...competitors];
  const summaries = computeShareOfVoice(summarizeVisibility(allRuns, allBrands))
    .sort((a, b) => b.visibility - a.visibility)
    .map((s, i) => ({ ...s, rank: i + 1 }));
  const sourceDistribution = computeSourceDistribution(allRuns, brand, competitors);

  let previousRun = null;
  try {
    // Save first, then look up the previous run — getPreviousGeoRun always skips the
    // most recent row, so it must run after the current run is already in the table.
    saveGeoRun(user.id, { brandName: brand.name, brandDomain: brand.domain, demoMode, summaries, sourceDistribution });
    previousRun = getPreviousGeoRun(user.id, brand.domain);
  } catch (dbErr) {
    console.error("geo history write failed:", dbErr);
  }

  return NextResponse.json({
    demoMode,
    runs: allRuns,
    summaries,
    sourceDistribution,
    previousRun,
  });
}
