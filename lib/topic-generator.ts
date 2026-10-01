import { PROVIDERS, isDemoMode } from "@/lib/geo-providers";
import { extractJsonArray } from "@/lib/llm-json";

/**
 * Step 2 of the URL-first onboarding wizard — generates the 10 topic categories a GEO
 * tracking setup for this brand should cover (Peec AI's "10 topic" step), from the brand
 * profile discovered in step 1 (lib/brand-discovery.ts). The wizard kicks this off the
 * moment step 1's result lands, while the user is still reading the brand-profile screen —
 * so by the time they click through to the topics step, this has usually already resolved.
 */

export interface GeneratedTopic {
  topic: string;
  /** One short Turkish sentence explaining why this topic matters for AI-visibility tracking. */
  why: string;
}

const PREFERRED_ORDER = ["anthropic", "openai", "google", "perplexity", "deepseek", "xai"] as const;

function pickProvider() {
  for (const id of PREFERRED_ORDER) {
    const p = PROVIDERS[id];
    if (p.isConfigured()) return p;
  }
  return null;
}

function demoTopics(): GeneratedTopic[] {
  return [
    { topic: "Genel", why: "Markanın adıyla doğrudan sorulan temel tanıma soruları." },
    { topic: "Fiyat", why: "Fiyatlandırma ve ücretlendirme ile ilgili sorular." },
    { topic: "Karşılaştırma", why: "Rakiplerle doğrudan karşılaştırma soruları." },
    { topic: "Güvenilirlik", why: "Güven, referans ve itibar soruları." },
    { topic: "Nasıl kullanılır", why: "Kurulum/kullanım süreciyle ilgili sorular." },
    { topic: "Alternatifler", why: "Markayı hiç duymamış birinin kategori-genel soruları." },
    { topic: "Müşteri yorumları", why: "Deneyim ve memnuniyet soruları." },
    { topic: "Destek", why: "Müşteri desteği ve sonrası hizmet soruları." },
    { topic: "Entegrasyon", why: "Diğer araç/sistemlerle uyumluluk soruları." },
    { topic: "Güvenlik", why: "Veri güvenliği ve uyumluluk soruları." },
  ];
}

function buildPrompt(brandName: string, industry: string, description: string, language: "tr" | "en"): string {
  const lang = language === "en" ? "English" : "Turkish";
  return [
    `You are setting up AI-visibility (GEO) tracking for the brand "${brandName}", industry: ${industry}.`,
    `What it does: ${description}`,
    ``,
    `Generate exactly 10 topic categories that together cover the realistic range of questions a potential customer would ask an AI assistant (ChatGPT, Claude, Gemini, Perplexity) while researching this brand or its category — mix brand-known questions (pricing, trust, how-it-works) with pure category-discovery questions (someone who's never heard of this brand).`,
    `Each topic needs a short ${lang} label (1-3 words, e.g. "Fiyat", "Karşılaştırma") and a one-sentence ${lang} reason it matters for this specific brand/industry.`,
    ``,
    `Respond with ONLY a JSON array, no markdown fences, no commentary, of exactly 10 objects:`,
    `[{"topic": "...", "why": "..."}]`,
  ].join("\n");
}

export async function generateTopicsForBrand(
  brandName: string,
  industry: string,
  description: string,
  language: "tr" | "en" = "tr"
): Promise<{ topics: GeneratedTopic[]; demoMode: boolean; model: string }> {
  const provider = isDemoMode() ? null : pickProvider();
  if (!provider) {
    return { topics: demoTopics(), demoMode: true, model: "demo (no API key configured)" };
  }

  const prompt = buildPrompt(brandName, industry, description, language);
  const { text, model } = await provider.run(prompt);
  const parsed = extractJsonArray(text);

  const topics = parsed
    .filter((item) => item && typeof item.topic === "string" && item.topic.trim())
    .slice(0, 10)
    .map((item) => ({
      topic: String(item.topic).trim(),
      why: typeof item.why === "string" && item.why.trim() ? item.why.trim() : "",
    }));

  if (topics.length === 0) {
    throw new Error("Model didn't return any usable topics — try again.");
  }

  return { topics, demoMode: false, model };
}
