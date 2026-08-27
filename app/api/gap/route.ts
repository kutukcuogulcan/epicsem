import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { EngineId } from "@/types";
import { ALL_ENGINES, computeShareOfVoice, computeSourceDistribution, runPromptAcrossEngines, summarizeVisibility } from "@/lib/geo-engine";
import { isDemoMode } from "@/lib/geo-providers";
import { auditPagesForGap, buildGapMatrix } from "@/lib/gap-analysis";
import { saveGapRun } from "@/lib/db";
import { buildContentBriefs } from "@/lib/content-brief";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";

const brandSchema = z.object({ name: z.string().min(1), domain: z.string().min(1) });

const bodySchema = z.object({
  brand: brandSchema,
  competitors: z.array(brandSchema).max(6).default([]),
  prompts: z.array(z.string().min(3)).min(1).max(10),
  engines: z.array(z.enum(["openai", "anthropic", "google", "perplexity"])).default(ALL_ENGINES),
  pageUrls: z.array(z.string().min(3)).min(1).max(10),
});

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  // Gap analysis runs both a GEO fan-out AND a per-page audit crawl — most
  // expensive single action in the app, so it gets the tightest cap.
  const limitResult = rateLimit(`gap:${user.id}`, 10, 60 * 60 * 1000);
  if (!limitResult.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached — up to 10 gap analyses per hour. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limitResult.resetAt)) } }
    );
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }

  const { brand, competitors, prompts, engines, pageUrls } = parsed;

  const [allRunsNested, audits] = await Promise.all([
    Promise.all(prompts.map((p) => runPromptAcrossEngines(p, brand, competitors, engines as EngineId[]))),
    auditPagesForGap(pageUrls),
  ]);
  const allRuns = allRunsNested.flat();

  const allBrands = [brand, ...competitors];
  const summaries = computeShareOfVoice(summarizeVisibility(allRuns, allBrands))
    .sort((a, b) => b.visibility - a.visibility)
    .map((s, i) => ({ ...s, rank: i + 1 }));
  const sourceDistribution = computeSourceDistribution(allRuns, brand, competitors);
  const gapMatrix = buildGapMatrix(audits, allRuns);
  const demoMode = isDemoMode();
  const contentBriefs = buildContentBriefs(audits, gapMatrix, allRuns, brand, competitors);

  try {
    saveGapRun(user.id, { brandName: brand.name, brandDomain: brand.domain, demoMode, gapMatrix, summaries });
  } catch (dbErr) {
    console.error("gap history write failed:", dbErr);
  }

  return NextResponse.json({
    demoMode,
    summaries,
    sourceDistribution,
    gapMatrix,
    contentBriefs,
  });
}
