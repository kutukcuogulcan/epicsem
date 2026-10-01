import { fetchPageSummary, normalizeUrl } from "@/lib/content-fetch";
import { PROVIDERS, isDemoMode } from "@/lib/geo-providers";
import { extractJsonObject } from "@/lib/llm-json";

/**
 * Step 1 of the URL-first onboarding wizard (mirrors Peec AI's "enter a URL, we build the
 * rest" flow — see HANDOFF.md / the onboarding-principle card the user shared): a real page
 * fetch (lib/content-fetch.ts — same fetch-then-extract discipline as lib/article-audit.ts)
 * grounds the brand name/description in what the site ACTUALLY says, never invented. The
 * suggested competitors are the one place this necessarily goes beyond "only what's on the
 * page" — the model is drawing on its own general knowledge of the industry, same as any
 * human brainstorming a competitor list. That's why they come back editable/removable in the
 * wizard rather than presented as a verified fact, and their domains are frequently left
 * blank ([NEEDS: domain] convention) rather than guessed.
 */

export interface DiscoveredCompetitor {
  name: string;
  /** Best-guess domain, or "" when the model isn't confident — the wizard leaves this
   * editable rather than ever inventing a domain that might be wrong. */
  domain: string;
}

export interface DiscoveredBrand {
  brand: { name: string; domain: string };
  /** 1-2 sentence description grounded in the real fetched page content. */
  description: string;
  /** Short industry/category label, used to prompt the topic-generation step. */
  industry: string;
  competitors: DiscoveredCompetitor[];
  demoMode: boolean;
  model: string;
}

const PREFERRED_ORDER = ["anthropic", "openai", "google", "perplexity", "deepseek", "xai"] as const;

function pickProvider() {
  for (const id of PREFERRED_ORDER) {
    const p = PROVIDERS[id];
    if (p.isConfigured()) return p;
  }
  return null;
}

function domainFromUrl(url: string): string {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

function guessNameFromDomain(domain: string): string {
  const base = domain.split(".")[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function demoResult(domain: string): DiscoveredBrand {
  const name = guessNameFromDomain(domain);
  return {
    brand: { name, domain },
    description: `[DEMO DATA] ${name} için gerçek bir marka özeti çıkarmak üzere bir model API anahtarı bağlanmalı — bu alan sayfa gerçekten taranıp analiz edildiğinde gerçek içerikle doldurulur.`,
    industry: "[DEMO DATA — genel kategori]",
    competitors: [{ name: "[DEMO DATA]", domain: "" }],
    demoMode: true,
    model: "demo (no API key configured)",
  };
}

function buildPrompt(page: { url: string; title: string | null; metaDescription: string | null; bodyText: string }): string {
  return [
    `You are analyzing a real, just-fetched web page to bootstrap AI-visibility (GEO) tracking setup — the same first step a tool like Peec AI performs when a user pastes their homepage URL.`,
    ``,
    `URL: ${page.url}`,
    `Page <title>: ${page.title ?? "(none found)"}`,
    `Meta description: ${page.metaDescription ?? "(none found)"}`,
    `Visible body text (truncated): ${page.bodyText.slice(0, 4000)}`,
    ``,
    `From ONLY the real content above, extract:`,
    `- "brandName": the brand/company name as it actually appears on the page (never invent one).`,
    `- "description": a 1-2 sentence Turkish summary of what this brand/site actually does, grounded only in the text above — if the content is too thin to tell, say so plainly instead of guessing.`,
    `- "industry": a short Turkish category label for what market/industry this brand competes in (e.g. "dijital pazarlama ajansı", "e-ticaret - kadın giyim").`,
    `- "competitors": an array of 2-4 real, well-known companies that compete in the same industry/category (this is general market knowledge, not something read off the page — pick companies you're genuinely confident exist and are relevant; for each, include "domain" only if you're confident of it, otherwise use an empty string).`,
    ``,
    `Respond with ONLY a JSON object, no markdown fences, no commentary, matching exactly:`,
    `{"brandName": "...", "description": "...", "industry": "...", "competitors": [{"name": "...", "domain": "..."}]}`,
  ].join("\n");
}

export async function discoverBrandFromUrl(rawUrl: string): Promise<DiscoveredBrand> {
  const url = normalizeUrl(rawUrl);
  const domain = domainFromUrl(url);

  const provider = isDemoMode() ? null : pickProvider();
  if (!provider) {
    return demoResult(domain);
  }

  // A fetch failure (dead site, blocked bot, timeout) shouldn't hard-fail the wizard — fall
  // back to a domain-only profile the user can still edit by hand in step 2.
  let page;
  try {
    page = await fetchPageSummary(url);
  } catch {
    return {
      brand: { name: guessNameFromDomain(domain), domain },
      description: "[NEEDS: sayfa taranamadı — marka açıklamasını elle girin]",
      industry: "[NEEDS: kategori — sayfa taranamadığı için belirlenemedi]",
      competitors: [],
      demoMode: false,
      model: provider.defaultModel,
    };
  }

  const prompt = buildPrompt(page);
  const { text, model } = await provider.run(prompt);
  const parsed = extractJsonObject(text);

  const competitors: DiscoveredCompetitor[] = Array.isArray(parsed.competitors)
    ? parsed.competitors
        .filter((c: any) => c && typeof c.name === "string" && c.name.trim())
        .slice(0, 4)
        .map((c: any) => ({ name: String(c.name).trim(), domain: typeof c.domain === "string" ? c.domain.trim() : "" }))
    : [];

  return {
    brand: {
      name: typeof parsed.brandName === "string" && parsed.brandName.trim() ? parsed.brandName.trim() : guessNameFromDomain(domain),
      domain,
    },
    description: typeof parsed.description === "string" && parsed.description.trim() ? parsed.description.trim() : "[NEEDS: açıklama]",
    industry: typeof parsed.industry === "string" && parsed.industry.trim() ? parsed.industry.trim() : "[NEEDS: kategori]",
    competitors,
    demoMode: false,
    model,
  };
}
