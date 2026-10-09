import { PROVIDERS, isDemoMode, runFast } from "@/lib/geo-providers";
import { extractJsonObject } from "@/lib/llm-json";
import { cosineSimilarity, getEmbeddings, isEmbeddingAvailable } from "@/lib/embeddings";

/**
 * Topic generation+selection — Kart 11 of the methodology. Per the card's core principle,
 * the LLM only proposes and SCORES candidates; every selection decision (dedup, ranking,
 * the top-5 auto-pick) is deterministic code (see A3/A4 of the card). Step B (slot planning,
 * lib/slot-planner.ts) and step C (LLM fills each slot's sentence,
 * lib/prompt-suggestions.ts) build on whichever topics the wizard ends up keeping.
 */

export type TopicSource = "product" | "problem" | "category" | "sector";

export interface TopicCandidate {
  name: string;
  description: string;
  source: TopicSource;
  linkedProducts: string[];
  businessImportance: number;
  brandFit: number;
  demand: number;
  /** 0.40×business_importance + 0.30×brand_fit + 0.30×demand, on the same 1-5 scale as the
   * three inputs — A3 of the methodology. */
  score: number;
}

export interface TopicGenerationResult {
  /** Up to 10 candidates, post-dedup, ranked by score descending. */
  candidates: TopicCandidate[];
  /** Names of the top 5, auto-selected respecting A4's constraints (≥1 "category" source,
   * ≤2 sharing a linked product). */
  autoSelected: string[];
  /** True only when embedding-based near-duplicate removal (A4.2) actually ran — it's
   * skipped (not failed) when no OPENAI_API_KEY is configured, see lib/embeddings.ts. */
  dedupApplied: boolean;
  demoMode: boolean;
  model: string;
}

interface BrandProfileInput {
  name: string;
  domain: string;
  description: string;
  industry: string;
  identityAdjectives: string[];
  productTags: string[];
}

const PREFERRED_ORDER = ["anthropic", "openai", "google", "perplexity", "deepseek", "xai"] as const;

function pickProvider() {
  for (const id of PREFERRED_ORDER) {
    const p = PROVIDERS[id];
    if (p.isConfigured()) return p;
  }
  return null;
}

function demoCandidates(brand: BrandProfileInput): TopicCandidate[] {
  const raw: Array<[string, TopicSource, string[]]> = [
    ["Fiyat ve Paketler", "product", brand.productTags.slice(0, 1)],
    ["Güvenilirlik ve Referanslar", "problem", []],
    [`${brand.industry || "Kategori"} Sağlayıcıları`, "category", []],
    ["Kurulum ve Entegrasyon", "problem", []],
    ["Destek ve Hizmet Kalitesi", "problem", []],
  ];
  return raw.map(([name, source, linkedProducts], i) => {
    const businessImportance = 5 - (i % 3);
    const brandFit = 4;
    const demand = 4 - (i % 2);
    return {
      name: `[DEMO DATA] ${name}`,
      description: "[DEMO DATA] gerçek bir aday için bir model API anahtarı bağlanmalı.",
      source,
      linkedProducts,
      businessImportance,
      brandFit,
      demand,
      score: 0.4 * businessImportance + 0.3 * brandFit + 0.3 * demand,
    };
  });
}

function buildPrompt(brand: BrandProfileInput, country: string, language: "tr" | "en", sectorSeeds: string[]): string {
  const lang = language === "en" ? "English" : "Turkish";
  const system = [
    `You are a GEO (Generative Engine Optimization) strategist. You design the topic`,
    `structure used to track how often a brand is recommended in AI assistant answers.`,
    `A topic is a category-level area where a potential customer would ask an AI assistant`,
    `for help, recommendations or comparisons. Rules:`,
    `- Write topic names in ${lang}. 2-5 words. Prefer plural category nouns or "X and Y".`,
    `- NEVER include the brand name, its aliases, or any competitor name.`,
    `- Not too broad ("Marketing"), not too narrow ("Instagram Reels budget").`,
    `- Topics must be clearly distinct from each other.`,
    `- Generate candidates from 4 sources:`,
    `  product  = one per product/service`,
    `  problem  = customer problems / needs implied by the description`,
    `  category = choosing/comparing providers in this category (at least 2)`,
    `  sector   = from the provided sector seeds (only if relevant)`,
    `- Score each candidate 1-5 on business_importance, brand_fit, demand.`,
    `Return ONLY JSON matching the schema.`,
  ].join("\n");

  const user = [
    `Brand profile: ${JSON.stringify({
      name: brand.name,
      domain: brand.domain,
      description: brand.description,
      industry: brand.industry,
      identity: brand.identityAdjectives,
      products: brand.productTags,
    })}`,
    `Market: ${country}, Language: ${lang}`,
    `Sector seeds: ${JSON.stringify(sectorSeeds)}`,
    `Generate up to 14 topic candidates.`,
    ``,
    `Respond with ONLY a JSON object, no markdown fences, no commentary, matching exactly:`,
    `{"topics": [{"name": "string", "description": "string", "source": "product|problem|category|sector", "linked_products": ["string"], "business_importance": 1, "brand_fit": 1, "demand": 1}]}`,
  ].join("\n");

  return `${system}\n\n---\n\n${user}`;
}

function clamp1to5(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 3;
  return Math.max(1, Math.min(5, v));
}

/** A4: dedup near-identical candidates by name+description embedding similarity (>0.80 →
 * drop the lower-scored one), rank by score, return the top 10. Dedup is skipped (not
 * failed) when no embeddings provider is configured. */
async function dedupAndRank(candidates: TopicCandidate[]): Promise<{ ranked: TopicCandidate[]; dedupApplied: boolean }> {
  if (candidates.length === 0) return { ranked: [], dedupApplied: false };
  if (!isEmbeddingAvailable()) {
    const ranked = [...candidates].sort((a, b) => b.score - a.score).slice(0, 10);
    return { ranked, dedupApplied: false };
  }

  try {
    const vectors = await getEmbeddings(candidates.map((c) => `${c.name}. ${c.description}`));
    const dropped = new Set<number>();
    for (let i = 0; i < candidates.length; i++) {
      if (dropped.has(i)) continue;
      for (let j = i + 1; j < candidates.length; j++) {
        if (dropped.has(j)) continue;
        if (cosineSimilarity(vectors[i], vectors[j]) > 0.8) {
          // drop whichever of the pair scores lower
          if (candidates[i].score >= candidates[j].score) dropped.add(j);
          else dropped.add(i);
        }
      }
    }
    const survivors = candidates.filter((_, i) => !dropped.has(i));
    const ranked = survivors.sort((a, b) => b.score - a.score).slice(0, 10);
    return { ranked, dedupApplied: true };
  } catch {
    // Embedding call failed (network/quota) — degrade to no-dedup rather than fail the
    // whole wizard step over a non-essential refinement.
    const ranked = [...candidates].sort((a, b) => b.score - a.score).slice(0, 10);
    return { ranked, dedupApplied: false };
  }
}

/** A4.3/A4.4: top 5 by score, with ≥1 "category" source and ≤2 topics sharing a linked
 * product among the selected 5 — pure code, no LLM. */
function autoSelectTop5(ranked: TopicCandidate[]): string[] {
  const selected: TopicCandidate[] = [];
  const productCount = new Map<string, number>();

  const canAdd = (c: TopicCandidate) => c.linkedProducts.every((p) => (productCount.get(p) ?? 0) < 2);
  const addCand = (c: TopicCandidate) => {
    selected.push(c);
    c.linkedProducts.forEach((p) => productCount.set(p, (productCount.get(p) ?? 0) + 1));
  };

  for (const c of ranked) {
    if (selected.length >= 5) break;
    if (canAdd(c)) addCand(c);
  }
  // Safety fallback: if the product cap left us short of 5, fill remaining slots ignoring it.
  if (selected.length < 5) {
    for (const c of ranked) {
      if (selected.length >= 5) break;
      if (!selected.includes(c)) addCand(c);
    }
  }

  if (!selected.some((c) => c.source === "category")) {
    const bestCategory = ranked.find((c) => c.source === "category" && !selected.includes(c));
    if (bestCategory) {
      let worstIdx = -1;
      let worstScore = Infinity;
      selected.forEach((c, i) => {
        if (c.source !== "category" && c.score < worstScore) {
          worstScore = c.score;
          worstIdx = i;
        }
      });
      if (worstIdx >= 0) selected[worstIdx] = bestCategory;
    }
  }

  return selected.map((c) => c.name);
}

export async function generateTopicsForBrand(
  brand: BrandProfileInput,
  country: string,
  language: "tr" | "en" = "tr",
  sectorSeeds: string[] = []
): Promise<TopicGenerationResult> {
  const provider = isDemoMode() ? null : pickProvider();
  if (!provider) {
    const candidates = demoCandidates(brand);
    return {
      candidates,
      autoSelected: candidates.slice(0, 5).map((c) => c.name),
      dedupApplied: false,
      demoMode: true,
      model: "demo (no API key configured)",
    };
  }

  const prompt = buildPrompt(brand, country, language, sectorSeeds);
  // Kart: Topic üretimi (≤15 sn) — kullanıcı Adım 2'deyken bitmesi gerekiyor, o yüzden
  // hızlı model (Haiku / Gemini Flash / GPT-mini) ile; hızlı katman yoksa normal sağlayıcı.
  const fast = await runFast(prompt, 0.4).catch(() => null);
  const { text, model } = fast ?? (await provider.run(prompt));
  const parsed = extractJsonObject(text);

  const rawTopics: any[] = Array.isArray(parsed.topics) ? parsed.topics : [];
  const scored: TopicCandidate[] = rawTopics
    .filter((t) => t && typeof t.name === "string" && t.name.trim())
    .slice(0, 14)
    .map((t) => {
      const businessImportance = clamp1to5(t.business_importance);
      const brandFit = clamp1to5(t.brand_fit);
      const demand = clamp1to5(t.demand);
      const source: TopicSource = ["product", "problem", "category", "sector"].includes(t.source) ? t.source : "problem";
      return {
        name: String(t.name).trim(),
        description: typeof t.description === "string" ? t.description.trim() : "",
        source,
        linkedProducts: Array.isArray(t.linked_products) ? t.linked_products.filter((p: any) => typeof p === "string") : [],
        businessImportance,
        brandFit,
        demand,
        score: 0.4 * businessImportance + 0.3 * brandFit + 0.3 * demand,
      };
    });

  if (scored.length === 0) {
    throw new Error("Model didn't return any usable topic candidates — try again.");
  }

  const { ranked, dedupApplied } = await dedupAndRank(scored);
  const autoSelected = autoSelectTop5(ranked);

  return { candidates: ranked, autoSelected, dedupApplied, demoMode: false, model };
}
