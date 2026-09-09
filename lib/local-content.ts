import type { EngineId } from "@/types";
import { PROVIDERS, isDemoMode } from "@/lib/geo-providers";

/**
 * Draft generation for local-business Google visibility — a Google Business Profile
 * "What's new" post, and a reply to a Google review. Deliberately mirrors the
 * WordPress/Shopify publish flow's central decision: this NEVER pushes anything to
 * Google itself. Google's Business Profile API is access-gated (requires a Google
 * approval process we cannot obtain or guarantee on demand), so instead of building a
 * fake "automatic" version, this generates the text and a human copies it into Google
 * Business Profile themselves — same "draft only, human decides" shape as the CMS
 * integrations, just one step more manual because the platform requires it.
 */

interface BrandRef {
  name: string;
  domain: string;
}

const PREFERRED_ORDER: EngineId[] = ["anthropic", "openai", "google", "perplexity", "deepseek", "xai"];

function pickProvider() {
  for (const id of PREFERRED_ORDER) {
    const p = PROVIDERS[id];
    if (p.isConfigured()) return p;
  }
  return null;
}

export interface LocalDraftResult {
  text: string;
  demoMode: boolean;
  model: string;
}

export async function generateGbpPost(brand: BrandRef, topic: string): Promise<LocalDraftResult> {
  const provider = isDemoMode() ? null : pickProvider();
  if (!provider) {
    return {
      text: `[DEMO — API anahtarı bağlı değil] ${brand.name}'den güncelleme: ${topic}. Detaylar ve iletişim için ${brand.domain} adresini ziyaret edin.`,
      demoMode: true,
      model: "demo (no API key configured)",
    };
  }

  const prompt = `You are writing a short Google Business Profile "What's new" update post for the local business "${brand.name}" (${brand.domain}). Topic/occasion: "${topic}".
Constraints: write in Turkish, maximum 1500 characters (Google Business Profile's post limit), do not invent facts (no fake prices, fake awards, fake customer counts, fake dates, fake promotions) — if the post would naturally need a specific detail you weren't given, phrase it generically instead of making one up. End with a short, natural call to action.
Respond with ONLY the post text — no quotes, no markdown formatting, no commentary before or after it.`;

  const { text, model } = await provider.run(prompt);
  return { text: text.trim(), demoMode: false, model };
}

export async function generateReviewReply(brand: BrandRef, reviewText: string, rating?: number): Promise<LocalDraftResult> {
  const provider = isDemoMode() ? null : pickProvider();
  if (!provider) {
    return {
      text: `[DEMO — API anahtarı bağlı değil] Merhaba, değerlendirmeniz için teşekkür ederiz. Geri bildiriminiz bizim için değerli — ${brand.name} olarak sizi tekrar ağırlamak isteriz.`,
      demoMode: true,
      model: "demo (no API key configured)",
    };
  }

  const prompt = `You are writing a reply, as the business owner, to a Google review left for the local business "${brand.name}" (${brand.domain}).${
    rating ? ` The review's star rating: ${rating}/5.` : ""
  }
Review text: """${reviewText}"""
Constraints: write in Turkish, warm and professional tone, 2-4 sentences, do not invent facts about the business (no fake promises, fake discounts, fake staff names, fake policies), do not admit legal liability. If the review is negative or critical, acknowledge the specific concern without being defensive and invite the reviewer to continue the conversation privately (phone/email) rather than arguing in public.
Respond with ONLY the reply text — no quotes, no markdown formatting, no commentary before or after it.`;

  const { text, model } = await provider.run(prompt);
  return { text: text.trim(), demoMode: false, model };
}
