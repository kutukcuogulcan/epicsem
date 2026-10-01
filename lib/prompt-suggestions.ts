import type { EngineId } from "@/types";
import { PROVIDERS, isDemoMode } from "@/lib/geo-providers";

/**
 * Auto-generated GEO test prompts from just a brand name + domain (+ competitors) —
 * closes the "blank page" problem of /geo: a new user with nothing to test yet.
 * Mirrors Peec AI's profile-driven prompt-suggestion engine (their real dashboard
 * generates tracking prompts from a brand profile the same way), grounded in this
 * session's own comparison against arvow.com and Peec's actual project data.
 */

interface BrandRef {
  name: string;
  domain: string;
}

export interface PromptSuggestion {
  topic: string;
  text: string;
  branded: boolean;
}

const PREFERRED_ORDER: EngineId[] = ["anthropic", "openai", "google", "perplexity", "deepseek", "xai"];

function pickProvider() {
  for (const id of PREFERRED_ORDER) {
    const p = PROVIDERS[id];
    if (p.isConfigured()) return p;
  }
  return null;
}

function buildSuggestionPrompt(brand: BrandRef, competitors: BrandRef[]): string {
  const lines: string[] = [];
  lines.push(
    `You are helping set up AI-visibility (GEO) tracking for the brand "${brand.name}" (${brand.domain}).`
  );
  if (competitors.length > 0) {
    lines.push(`Known competitors: ${competitors.map((c) => `${c.name} (${c.domain})`).join(", ")}.`);
  }
  lines.push("");
  lines.push(
    "Generate 8 realistic questions a potential customer might ask an AI assistant (ChatGPT, Claude, Gemini, Perplexity) while researching this category — the kind of prompts a real GEO-tracking tool (like Peec AI) would suggest from a brand profile."
  );
  lines.push(
    "Mix branded prompts (naming the brand directly, e.g. comparisons or trust questions) with non-branded discovery prompts (someone who has never heard of the brand, just researching the category/problem) — aim for roughly 2-3 branded and 5-6 non-branded."
  );
  lines.push("Write every prompt in Turkish, natural phrasing a real person would type.");
  lines.push("");
  lines.push(
    `Respond with ONLY a JSON array, no markdown fences, no commentary, of exactly 8 objects matching this shape:
[{"topic": "short Turkish category label (e.g. Fiyat, Karşılaştırma, Güvenilirlik, Nasıl kullanılır, Alternatifler, Genel)", "text": "the prompt itself", "branded": true or false}]`
  );
  return lines.join("\n");
}

function extractJsonArray(text: string): any[] {
  let cleaned = text.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) cleaned = fence[1].trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    throw new Error("not an array");
  } catch {
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        const parsed = JSON.parse(cleaned.slice(start, end + 1));
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // fall through to the throw below
      }
    }
    throw new Error("Model response wasn't a valid JSON array — try again.");
  }
}

function demoSuggestions(brand: BrandRef, competitors: BrandRef[]): PromptSuggestion[] {
  const competitor = competitors[0]?.name;
  const suggestions: PromptSuggestion[] = [
    { topic: "Genel", text: `${brand.name} nedir, ne işe yarar?`, branded: true },
    { topic: "Güvenilirlik", text: `${brand.name} güvenilir mi?`, branded: true },
    { topic: "Fiyat", text: `${brand.name} ücretsiz mi, fiyatlandırması nasıl?`, branded: true },
    {
      topic: "Karşılaştırma",
      text: competitor ? `${brand.name} ile ${competitor} arasındaki fark ne?` : `${brand.name}'e alternatif olarak ne önerirsiniz?`,
      branded: true,
    },
    { topic: "Nasıl kullanılır", text: `${brand.name} nasıl kullanılır, kuruluma ihtiyaç var mı?`, branded: true },
    { topic: "Keşif", text: "Bu alanda en iyi araçlar/markalar hangileri?", branded: false },
    { topic: "Keşif", text: "Bu konuda araştırma yaparken nelere dikkat etmeliyim?", branded: false },
    { topic: "Yorumlar", text: `${brand.name} hakkında kullanıcı yorumları nasıl?`, branded: true },
  ];
  return suggestions;
}

/** One generated prompt, grouped under the topic it was generated for — the onboarding
 * wizard's step 3→4 prefetch (lib/topic-generator.ts's output feeds in as `topics`). */
export interface TopicPromptSuggestion extends PromptSuggestion {
  topic: string;
}

const PROMPTS_PER_TOPIC = 8;

function buildTopicGroundedPrompt(
  brand: BrandRef,
  competitors: BrandRef[],
  topics: string[],
  audienceNote: string | undefined,
  language: "tr" | "en"
): string {
  const lang = language === "en" ? "English" : "Turkish";
  const lines: string[] = [];
  lines.push(
    `You are generating AI-visibility (GEO) tracking prompts for the brand "${brand.name}" (${brand.domain}).`
  );
  if (competitors.length > 0) {
    lines.push(`Known competitors: ${competitors.map((c) => `${c.name} (${c.domain})`).join(", ")}.`);
  }
  if (audienceNote) {
    lines.push(`Target audience (weight the phrasing/tone toward these, proportional to their share): ${audienceNote}.`);
  }
  lines.push("");
  lines.push(`For EACH of these ${topics.length} topic categories, write exactly ${PROMPTS_PER_TOPIC} realistic ${lang} prompts a real person would type into an AI assistant (ChatGPT, Claude, Gemini, Perplexity) that fall under that topic:`);
  lines.push(topics.map((t) => `- ${t}`).join("\n"));
  lines.push("");
  lines.push(`Within each topic, mix branded prompts (naming the brand directly) with non-branded discovery prompts where the topic allows it. Write natural ${lang} phrasing.`);
  lines.push("");
  lines.push(
    `Respond with ONLY a JSON array, no markdown fences, no commentary, of exactly ${topics.length * PROMPTS_PER_TOPIC} objects matching this shape:
[{"topic": "must be exactly one of the topic labels given above", "text": "the prompt itself", "branded": true or false}]`
  );
  return lines.join("\n");
}

function demoTopicPrompts(brand: BrandRef, topics: string[]): TopicPromptSuggestion[] {
  const variants = [
    (t: string) => ({ text: `${brand.name} ${t.toLowerCase()} konusunda nasıl, anlatır mısın?`, branded: true }),
    (t: string) => ({ text: `Bu kategoride ${t.toLowerCase()} açısından en iyi seçenekler neler?`, branded: false }),
    (t: string) => ({ text: `${brand.name}'in ${t.toLowerCase()} konusundaki yaklaşımı rakiplerinden farklı mı?`, branded: true }),
    (t: string) => ({ text: `${t} konusunda araştırma yaparken nelere dikkat etmeliyim?`, branded: false }),
  ];
  return topics.flatMap((topic) =>
    Array.from({ length: PROMPTS_PER_TOPIC }, (_, i) => ({ topic, ...variants[i % variants.length](topic) }))
  );
}

/** Step 3→4 of the onboarding wizard: given the topics the user kept from step 2
 * (lib/topic-generator.ts), generate concrete prompts for all of them in one call — fired
 * the moment the topics step renders so it's usually already resolved by the time the user
 * finishes reviewing/deselecting topics and clicks through. `audienceNote` optionally carries
 * the wizard's persona mix (lib/brand-discovery.ts's DiscoveredPersona[]) so prompt phrasing
 * leans toward the brand's actual target customers instead of a generic voice. */
export async function generateTopicGroundedPrompts(
  brand: BrandRef,
  competitors: BrandRef[],
  topics: string[],
  audienceNote?: string,
  language: "tr" | "en" = "tr"
): Promise<{ prompts: TopicPromptSuggestion[]; demoMode: boolean; model: string }> {
  const provider = isDemoMode() ? null : pickProvider();
  if (!provider) {
    return { prompts: demoTopicPrompts(brand, topics), demoMode: true, model: "demo (no API key configured)" };
  }

  const prompt = buildTopicGroundedPrompt(brand, competitors, topics, audienceNote, language);
  const { text, model } = await provider.run(prompt);
  const parsed = extractJsonArray(text);

  const topicSet = new Set(topics);
  const prompts = parsed
    .filter((item) => item && typeof item.text === "string" && item.text.trim().length >= 3)
    .map((item) => ({
      topic: typeof item.topic === "string" && topicSet.has(item.topic.trim()) ? item.topic.trim() : topics[0],
      text: String(item.text).trim(),
      branded: Boolean(item.branded),
    }));

  if (prompts.length === 0) {
    throw new Error("Model didn't return any usable prompts — try again.");
  }

  return { prompts, demoMode: false, model };
}

export async function generatePromptSuggestions(
  brand: BrandRef,
  competitors: BrandRef[]
): Promise<{ suggestions: PromptSuggestion[]; demoMode: boolean; model: string }> {
  const provider = isDemoMode() ? null : pickProvider();
  if (!provider) {
    return { suggestions: demoSuggestions(brand, competitors), demoMode: true, model: "demo (no API key configured)" };
  }

  const prompt = buildSuggestionPrompt(brand, competitors);
  const { text, model } = await provider.run(prompt);
  const parsed = extractJsonArray(text);

  const suggestions = parsed
    .filter((item) => item && typeof item.text === "string" && item.text.trim().length >= 3)
    .map((item) => ({
      topic: typeof item.topic === "string" && item.topic.trim() ? item.topic.trim() : "Genel",
      text: String(item.text).trim(),
      branded: Boolean(item.branded),
    }));

  if (suggestions.length === 0) {
    throw new Error("Model didn't return any usable prompt suggestions — try again.");
  }

  return { suggestions, demoMode: false, model };
}
