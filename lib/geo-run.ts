import type { EngineId } from "@/types";
import { computeShareOfVoice, computeSourceDistribution, computeUrlStats, runPromptAcrossEngines, summarizeByTopic, summarizeVisibility } from "@/lib/geo-engine";
import { isDemoMode } from "@/lib/geo-providers";
import { saveGeoRun } from "@/lib/db";
import { checkQuota, consumeQuota, quotaExceededMessage } from "@/lib/usage-guard";

export interface GeoRunInput {
  brand: { name: string; domain: string };
  competitors: { name: string; domain: string }[];
  prompts: { text: string; topic: string }[];
  engines: EngineId[];
}

/**
 * Tek bir GEO testini çalıştırır ve kaydeder (kota kontrolü dahil). /api/geo ve zamanlanmış
 * Marka Monitörü çalıştırmaları aynı fonksiyonu kullanır.
 */
export async function executeGeoRun(userId: number, input: GeoRunInput) {
  const { brand, competitors, prompts, engines } = input;
  const demoMode = isDemoMode();
  const planned = prompts.length * engines.length;
  if (!demoMode) {
    const quota = await checkQuota(userId, "engineQueries", planned);
    if (!quota.allowed) {
      const err = new Error(quotaExceededMessage("engineQueries", quota, planned)) as Error & { status?: number };
      err.status = 402;
      throw err;
    }
  }
  const allRuns = (await Promise.all(prompts.map((p) => runPromptAcrossEngines(p.text, brand, competitors, engines, p.topic)))).flat();
  if (!demoMode) await consumeQuota(userId, "engineQueries", planned);

  const allBrands = [brand, ...competitors];
  const summaries = computeShareOfVoice(summarizeVisibility(allRuns, allBrands))
    .sort((a, b) => b.visibility - a.visibility)
    .map((s, i) => ({ ...s, rank: i + 1 }));
  const sourceDistribution = computeSourceDistribution(allRuns, brand, competitors);
  const urlStats = computeUrlStats(allRuns, brand, competitors);
  const topicBreakdown = summarizeByTopic(allRuns);
  await saveGeoRun(userId, { brandName: brand.name, brandDomain: brand.domain, demoMode, summaries, sourceDistribution, topicBreakdown, runs: allRuns, competitors });
  return { demoMode, allRuns, summaries, sourceDistribution, urlStats, topicBreakdown };
}
