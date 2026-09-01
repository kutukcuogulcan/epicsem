import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { EngineId } from "@/types";
import { ALL_ENGINES, computeShareOfVoice, computeSourceDistribution, runPromptAcrossEngines, summarizeVisibility } from "@/lib/geo-engine";
import { isDemoMode } from "@/lib/geo-providers";
import { getPreviousGeoRun, listGeoRunHistory, saveGeoRun } from "@/lib/db";
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
    const quota = await checkQuota(user.id, "engineQueries", plannedQueries);
    if (!quota.allowed) {
      return NextResponse.json({ error: quotaExceededMessage("engineQueries", quota, plannedQueries) }, { status: 402 });
    }
  }

  const allRuns = (
    await Promise.all(
      prompts.map((p) => runPromptAcrossEngines(p, brand, competitors, engines as EngineId[]))
    )
  ).flat();
  if (!demoMode) await consumeQuota(user.id, "engineQueries", plannedQueries);

  const allBrands = [brand, ...competitors];
  const summaries = computeShareOfVoice(summarizeVisibility(allRuns, allBrands))
    .sort((a, b) => b.visibility - a.visibility)
    .map((s, i) => ({ ...s, rank: i + 1 }));
  const sourceDistribution = computeSourceDistribution(allRuns, brand, competitors);

  let previousRun = null;
  let history: Awaited<ReturnType<typeof listGeoRunHistory>> = [];
  try {
    // Save first, then look up history — getPreviousGeoRun/listGeoRunHistory both read
    // from the table this just wrote to, so they must run after the insert.
    await saveGeoRun(user.id, { brandName: brand.name, brandDomain: brand.domain, demoMode, summaries, sourceDistribution });
    previousRun = await getPreviousGeoRun(user.id, brand.domain);
    history = await listGeoRunHistory(user.id, brand.domain, 20);
  } catch (dbErr) {
    console.error("geo history write failed:", dbErr);
  }

  return NextResponse.json({
    demoMode,
    runs: allRuns,
    summaries,
    sourceDistribution,
    previousRun,
    history,
  });
}

/** GET /api/geo?domain=brand-domain.com — trend history for the /geo chart, without re-running a test. */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  const domain = req.nextUrl.searchParams.get("domain");
  if (!domain) return NextResponse.json({ error: "domain query param is required" }, { status: 400 });

  const history = await listGeoRunHistory(user.id, domain, 20);
  return NextResponse.json({ history });
}
