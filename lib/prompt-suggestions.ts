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
