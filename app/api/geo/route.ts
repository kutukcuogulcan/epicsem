import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { EngineId } from "@/types";
import { ALL_ENGINES, computeShareOfVoice, computeSourceDistribution, runPromptAcrossEngines, summarizeVisibility } from "@/lib/geo-engine";
import { isDemoMode } from "@/lib/geo-providers";
import { getPreviousGeoRun, saveGeoRun } from "@/lib/db";
import { requireUser } from "@/lib/auth";

const brandSchema = z.object({ name: z.string().min(1), domain: z.string().min(1) });

const bodySchema = z.object({
  brand: brandSchema,
  competitors: z.array(brandSchema).max(6).default([]),
  prompts: z.array(z.string().min(3)).min(1).max(10),
  engines: z.array(z.enum(["openai", "anthropic", "google", "perplexity"])).default(ALL_ENGINES),
});

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request body" },
      { status: 400 }
    );
  }

  const { brand, competitors, prompts, engines } = parsed;

  const allRuns = (
    await Promise.all(
      prompts.map((p) => runPromptAcrossEngines(p, brand, competitors, engines as EngineId[]))
    )
  ).flat();

  const allBrands = [brand, ...competitors];
  const summaries = computeShareOfVoice(summarizeVisibility(allRuns, allBrands))
    .sort((a, b) => b.visibility - a.visibility)
    .map((s, i) => ({ ...s, rank: i + 1 }));
  const sourceDistribution = computeSourceDistribution(allRuns, brand, competitors);
  const demoMode = isDemoMode();

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
