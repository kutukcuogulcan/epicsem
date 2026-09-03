import type { EngineId, GeoRunResult, GeoVisibilitySummary, SourceDomainStat, SourceDomainType, TopicVisibility } from "@/types";
import { PROVIDERS, isDemoMode } from "./geo-providers";
import { simulateResponse } from "./geo-demo";
import { analyzeResponse } from "./geo-analyze";

export interface BrandInput {
  name: string;
  domain: string;
}

const ALL_ENGINES: EngineId[] = ["openai", "anthropic", "google", "perplexity", "deepseek", "xai", "meta", "microsoft"];

/** A prompt "names" the brand when its own text contains the brand name — vs. a discovery-style
 * prompt ("en iyi ... markaları") someone who's never heard of the brand would plausibly ask. */
export function isBrandedPrompt(promptText: string, brandName: string): boolean {
  return promptText.toLowerCase().includes(brandName.toLowerCase());
}

/** Runs one prompt across every configured engine (or the demo simulator) and analyzes each response. */
export async function runPromptAcrossEngines(
  promptText: string,
  brand: BrandInput,
  competitors: BrandInput[],
  engines: EngineId[] = ALL_ENGINES,
  topic: string = "Genel"
): Promise<GeoRunResult[]> {
  const demo = isDemoMode();
  const branded = isBrandedPrompt(promptText, brand.name);

  const results = await Promise.all(
    engines.map(async (engineId): Promise<GeoRunResult> => {
      const provider = PROVIDERS[engineId];
      let text: string;
      let model: string;

      if (demo || !provider.isConfigured()) {
        const sim = simulateResponse(promptText, engineId, brand.name, brand.domain, competitors);
        text = sim.text;
        model = sim.model;
      } else {
        try {
          const res = await provider.run(promptText);
          text = res.text;
          model = res.model;
        } catch (err) {
          const sim = simulateResponse(promptText, engineId, brand.name, brand.domain, competitors);
          text = `[Live call failed, showing simulated fallback: ${err instanceof Error ? err.message : "unknown error"}]\n\n${sim.text}`;
          model = sim.model;
        }
      }

      const analyzed = analyzeResponse(text, brand.name, brand.domain);

      return {
        engine: engineId,
        model,
        promptText,
        topic,
        branded,
        mentioned: analyzed.mentioned,
        position: analyzed.position,
        sentiment: analyzed.sentiment,
        responseText: text,
        citations: analyzed.citations,
      };
    })
  );

  return results;
}

/** Own-brand visibility broken down by prompt topic — mentioned is always computed against the
 * primary brand (see analyzeResponse call above), so it can be rolled up directly per topic. */
export function summarizeByTopic(runs: GeoRunResult[]): TopicVisibility[] {
  const byTopic = new Map<string, GeoRunResult[]>();
  for (const run of runs) {
    const key = run.topic || "Genel";
    if (!byTopic.has(key)) byTopic.set(key, []);
    byTopic.get(key)!.push(run);
  }

  return Array.from(byTopic.entries())
    .map(([topic, topicRuns]) => {
      const mentionedCount = topicRuns.filter((r) => r.mentioned).length;
      return {
        topic,
        visibility: topicRuns.length ? mentionedCount / topicRuns.length : 0,
        mentionedCount,
        totalCount: topicRuns.length,
      };
    })
    .sort((a, b) => b.totalCount - a.totalCount);
}

/** Aggregates a set of GeoRunResults (across prompts/engines) into per-brand visibility metrics. */
export function summarizeVisibility(
  runs: GeoRunResult[],
  brands: BrandInput[]
): GeoVisibilitySummary[] {
  const totalRuns = runs.length || 1;

  return brands.map((brand) => {
    const brandRuns = runs.filter((r) =>
      r.responseText.toLowerCase().includes(brand.name.toLowerCase())
    );
    const mentionedRuns = brandRuns.filter((r) => r.mentioned);
    const positions = mentionedRuns.map((r) => r.position).filter((p): p is number => p != null);
    const sentiments = mentionedRuns.map((r) => r.sentiment).filter((s): s is number => s != null);
    const citationCount = runs.reduce(
      (sum, r) => sum + r.citations.filter((c) => c.domain === brand.domain.replace(/^www\./, "")).length,
      0
    );

    return {
      brand: brand.name,
      domain: brand.domain,
      visibility: mentionedRuns.length / totalRuns,
      shareOfVoice: 0, // filled in by computeShareOfVoice once all brands are known
      avgPosition: positions.length ? positions.reduce((a, b) => a + b, 0) / positions.length : null,
      avgSentiment: sentiments.length ? Math.round(sentiments.reduce((a, b) => a + b, 0) / sentiments.length) : null,
      citationCount,
    };
  });
}

export function computeShareOfVoice(summaries: GeoVisibilitySummary[]): GeoVisibilitySummary[] {
  const totalMentions = summaries.reduce((sum, s) => sum + s.visibility, 0);
  if (totalMentions === 0) return summaries;
  return summaries.map((s) => ({ ...s, shareOfVoice: s.visibility / totalMentions }));
}

// Domains that are almost always user-generated content platforms rather than
// brand-owned or editorial sources — mirrors the "UGC" bucket in Peec-style dashboards.
const UGC_DOMAINS = ["reddit.com", "youtube.com", "quora.com", "medium.com", "x.com", "twitter.com", "facebook.com", "instagram.com", "tiktok.com"];
// High-authority reference sources — encyclopedic / official, not competitor or UGC.
const REFERENCE_HINTS = ["wikipedia.org", ".gov", ".edu"];

function classifyDomain(domain: string, brandDomain: string, competitorDomains: string[]): SourceDomainType {
  const clean = domain.replace(/^www\./, "");
  const own = brandDomain.replace(/^www\./, "");
  if (clean === own) return "You";
  if (competitorDomains.some((c) => clean === c.replace(/^www\./, ""))) return "Competitor";
  if (UGC_DOMAINS.some((u) => clean.endsWith(u))) return "UGC";
  if (REFERENCE_HINTS.some((r) => clean.endsWith(r))) return "Reference";
  return "Other";
}

/** Aggregates every citation across all runs into a per-domain "who gets cited" breakdown (Peec-style Source distribution). */
export function computeSourceDistribution(
  runs: GeoRunResult[],
  brand: BrandInput,
  competitors: BrandInput[]
): SourceDomainStat[] {
  const competitorDomains = competitors.map((c) => c.domain);
  const counts = new Map<string, number>();

  for (const run of runs) {
    for (const citation of run.citations) {
      counts.set(citation.domain, (counts.get(citation.domain) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([domain, count]) => ({
      domain,
      count,
      type: classifyDomain(domain, brand.domain, competitorDomains),
    }))
    .sort((a, b) => b.count - a.count);
}

export { ALL_ENGINES };
