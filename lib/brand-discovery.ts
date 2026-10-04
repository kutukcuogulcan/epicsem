import { fetchPageSummary, normalizeUrl } from "@/lib/content-fetch";
import { PROVIDERS, isDemoMode } from "@/lib/geo-providers";
import { extractJsonObject } from "@/lib/llm-json";
import { PERSONA_ORDER, type PersonaKey } from "@/lib/sector-packs";

/**
 * Step 1-2 of the URL-first onboarding wizard (mirrors Peec AI's "enter a URL, we build the
 * rest" flow — tested by the user directly against pnc.com.tr, see the numbered screenshot
 * table they shared): a real page fetch (lib/content-fetch.ts — same fetch-then-extract
 * discipline as lib/article-audit.ts) grounds the brand name/description/identity/products in
 * what the site ACTUALLY says, never invented. One LLM call covers everything the wizard's
 * step-2 sub-screens (profile / products+market / audience) show, since all of it is grounded
 * in the same single page fetch — no reason to split it into separate round-trips.
 *
 * The suggested competitors are the one field that necessarily goes beyond "only what's on
 * the page" — the model is drawing on its own general industry knowledge, same as any human
 * brainstorming a competitor list. The user's own test against pnc.com.tr (a digital
 * marketing consultancy) showed Peec AI itself getting this wrong — it suggested ERP
 * software vendors (Logo, Mikro, Nebim, Uyumsoft) instead of marketing-agency competitors.
 * That's exactly why these come back editable/removable with an explicit caution note in the
 * wizard, never presented as verified fact, and why domains are left blank
 * ([NEEDS: domain] convention) rather than guessed when the model isn't confident.
 *
 * Personas are NOT freeform — they're the 3 fixed archetypes the slot-planning engine's
 * compat matrix is keyed on (lib/sector-packs.ts's PersonaKey). The model's only job here is
 * estimating what share of this brand's audience each archetype represents; it never invents
 * persona names/descriptions, so lib/slot-planner.ts's formulas always apply cleanly.
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
  /** 3-5 short Turkish adjectives describing the brand's own voice/positioning, as the
   * page itself conveys it (e.g. "güvenilir", "yenilikçi") — grounded in real copy/tone,
   * not invented traits. */
  identityAdjectives: string[];
  /** 3-6 short Turkish product/service tags the brand actually offers, per the page. */
  productTags: string[];
  /** Share (0-100, summing to 100) of each of the 3 fixed audience archetypes for this
   * brand — feeds lib/slot-planner.ts's persona-assignment formula directly. */
  personas: Record<PersonaKey, number>;
  competitors: DiscoveredCompetitor[];
  demoMode: boolean;
  model: string;
}

const PREFERRED_ORDER = ["anthropic", "openai", "google", "perplexity", "deepseek", "xai"] as const;

const EVEN_PERSONAS: Record<PersonaKey, number> = { simple: 34, informed: 33, researcher: 33 };

function pickProvider() {
  for (const id of PREFERRED_ORDER) {
    const p = PROVIDERS[id];
    if (p.isConfigured()) return p;
  }
  return null;
}

export function domainFromUrl(url: string): string {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

/** Exported for app/api/onboarding/prefill/route.ts (Kart: LLM'siz otomatik doldurma) — the
 * same last-resort "no page metadata available" brand-name guess the full AI profile step
 * already falls back to here, reused as-is so the fast Step-1 guess and the slower Step-2 AI
 * guess never silently disagree on what a bare domain's name should default to. */
export function guessNameFromDomain(domain: string): string {
  const base = domain.split(".")[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function demoResult(domain: string): DiscoveredBrand {
  const name = guessNameFromDomain(domain);
  return {
    brand: { name, domain },
    description: `[DEMO DATA] ${name} için gerçek bir marka özeti çıkarmak üzere bir model API anahtarı bağlanmalı — bu alan sayfa gerçekten taranıp analiz edildiğinde gerçek içerikle doldurulur.`,
    industry: "[DEMO DATA — genel kategori]",
    identityAdjectives: ["[DEMO DATA]"],
    productTags: ["[DEMO DATA]"],
    personas: EVEN_PERSONAS,
    competitors: [{ name: "[DEMO DATA]", domain: "" }],
    demoMode: true,
    model: "demo (no API key configured)",
  };
}

function buildPrompt(
  page: { url: string; title: string | null; metaDescription: string | null; bodyText: string },
  language: "tr" | "en"
): string {
  const lang = language === "en" ? "English" : "Turkish";
  return [
    `You are analyzing a real, just-fetched web page to bootstrap AI-visibility (GEO) tracking setup — the same first step a tool like Peec AI performs when a user pastes their homepage URL.`,
    ``,
    `URL: ${page.url}`,
    `Page <title>: ${page.title ?? "(none found)"}`,
    `Meta description: ${page.metaDescription ?? "(none found)"}`,
    `Visible body text (truncated): ${page.bodyText.slice(0, 4000)}`,
    ``,
    `From ONLY the real content above, extract (write every text field in ${lang}):`,
    `- "brandName": the brand/company name as it actually appears on the page (never invent one).`,
    `- "description": a 1-2 sentence ${lang} summary of what this brand/site actually does, grounded only in the text above — if the content is too thin to tell, say so plainly instead of guessing.`,
    `- "industry": a short ${lang} category label for what market/industry this brand competes in (e.g. "dijital pazarlama ajansı", "e-ticaret - kadın giyim"). Be specific and literal about what the business actually does — do not default to a generic or adjacent category.`,
    `- "identityAdjectives": 3-5 short ${lang} adjectives describing the brand's own voice/positioning as the page itself conveys it (e.g. "güvenilir", "yenilikçi", "yerel").`,
    `- "productTags": 3-6 short ${lang} tags for the specific products/services this brand actually offers per the page.`,
    `- "personaShares": estimate, for THIS brand's likely customers, what percentage falls into each of these 3 FIXED archetypes (they must sum to 100): "simple" = wants a quick recommendation, no detail; "informed" = has a specific need/feature in mind, compares options; "researcher" = compares criteria/pros-cons in depth before deciding. Respond as {"simple": 0, "informed": 0, "researcher": 0}.`,
    `- "competitors": an array of 2-4 real, well-known companies that compete in the SAME specific industry/category you identified above (this is general market knowledge, not something read off the page) — double-check each one actually operates in the same business, not just a loosely related one (e.g. an ERP software vendor is NOT a competitor to a marketing agency); for each, include "domain" only if you're confident of it, otherwise use an empty string.`,
    ``,
    `Respond with ONLY a JSON object, no markdown fences, no commentary, matching exactly:`,
    `{"brandName": "...", "description": "...", "industry": "...", "identityAdjectives": ["..."], "productTags": ["..."], "personaShares": {"simple": 0, "informed": 0, "researcher": 0}, "competitors": [{"name": "...", "domain": "..."}]}`,
  ].join("\n");
}

function normalizePersonaShares(raw: any): Record<PersonaKey, number> {
  const out: Record<PersonaKey, number> = { simple: 0, informed: 0, researcher: 0 };
  if (!raw || typeof raw !== "object") return EVEN_PERSONAS;
  for (const key of PERSONA_ORDER) {
    const v = Number(raw[key]);
    out[key] = Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
  }
  const total = PERSONA_ORDER.reduce((sum, k) => sum + out[k], 0);
  if (total <= 0) return EVEN_PERSONAS;
  if (total !== 100) {
    // Re-normalize proportionally rather than trust the model's arithmetic.
    let running = 0;
    PERSONA_ORDER.forEach((k, i) => {
      if (i === PERSONA_ORDER.length - 1) {
        out[k] = 100 - running;
      } else {
        out[k] = Math.round((out[k] / total) * 100);
        running += out[k];
      }
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// Split step functions — Kart: Otomatik onboarding zinciri. The combined discoverBrandFromUrl
// below (used by the manual /api/geo/discover route) still does crawl+profile+competitors in
// one pass. The automatic background chain (lib/onboarding-engine.ts) needs these as separate,
// independently-failable, genuinely-parallel steps instead — "Tarama" (page fetch) once, then
// "Marka profili" and "Rakipler" as two separate LLM calls that both only need the same crawled
// page, so they can run with Promise.all rather than one being nested inside the other.
// ---------------------------------------------------------------------------------------

export interface BrandProfileResult {
  brand: { name: string; domain: string };
  description: string;
  industry: string;
  identityAdjectives: string[];
  productTags: string[];
  personas: Record<PersonaKey, number>;
  demoMode: boolean;
  model: string;
}

export interface CompetitorsResult {
  competitors: DiscoveredCompetitor[];
  demoMode: boolean;
  model: string;
}

/** Kart step "Tarama" — just the real page fetch, split out of discoverBrandFromUrl so it can
 * be its own tracked job. Throws on fetch failure (dead site, blocked bot, timeout); the caller
 * (lib/onboarding-engine.ts) is responsible for marking the step 'error' and short-circuiting
 * the rest of the chain, since nothing downstream can run without a real page to ground on. */
export async function runCrawlStep(rawUrl: string): Promise<{ page: Awaited<ReturnType<typeof fetchPageSummary>>; domain: string }> {
  const url = normalizeUrl(rawUrl);
  const domain = domainFromUrl(url);
  const page = await fetchPageSummary(url);
  return { page, domain };
}

function buildProfilePrompt(page: { url: string; title: string | null; metaDescription: string | null; bodyText: string }, language: "tr" | "en"): string {
  const lang = language === "en" ? "English" : "Turkish";
  return [
    `You are analyzing a real, just-fetched web page to bootstrap AI-visibility (GEO) tracking setup — the same first step a tool like Peec AI performs when a user pastes their homepage URL.`,
    ``,
    `URL: ${page.url}`,
    `Page <title>: ${page.title ?? "(none found)"}`,
    `Meta description: ${page.metaDescription ?? "(none found)"}`,
    `Visible body text (truncated): ${page.bodyText.slice(0, 4000)}`,
    ``,
    `From ONLY the real content above, extract (write every text field in ${lang}):`,
    `- "brandName": the brand/company name as it actually appears on the page (never invent one).`,
    `- "description": a 1-2 sentence ${lang} summary of what this brand/site actually does, grounded only in the text above — if the content is too thin to tell, say so plainly instead of guessing.`,
    `- "industry": a short ${lang} category label for what market/industry this brand competes in (e.g. "dijital pazarlama ajansı", "e-ticaret - kadın giyim"). Be specific and literal about what the business actually does — do not default to a generic or adjacent category.`,
    `- "identityAdjectives": 3-5 short ${lang} adjectives describing the brand's own voice/positioning as the page itself conveys it (e.g. "güvenilir", "yenilikçi", "yerel").`,
    `- "productTags": 3-6 short ${lang} tags for the specific products/services this brand actually offers per the page.`,
    `- "personaShares": estimate, for THIS brand's likely customers, what percentage falls into each of these 3 FIXED archetypes (they must sum to 100): "simple" = wants a quick recommendation, no detail; "informed" = has a specific need/feature in mind, compares options; "researcher" = compares criteria/pros-cons in depth before deciding. Respond as {"simple": 0, "informed": 0, "researcher": 0}.`,
    ``,
    `Respond with ONLY a JSON object, no markdown fences, no commentary, matching exactly:`,
    `{"brandName": "...", "description": "...", "industry": "...", "identityAdjectives": ["..."], "productTags": ["..."], "personaShares": {"simple": 0, "informed": 0, "researcher": 0}}`,
  ].join("\n");
}

function buildCompetitorsPrompt(page: { url: string; title: string | null; metaDescription: string | null; bodyText: string }, language: "tr" | "en"): string {
  const lang = language === "en" ? "English" : "Turkish";
  return [
    `You are looking at a real, just-fetched web page to suggest competitors for AI-visibility (GEO) tracking setup.`,
    ``,
    `URL: ${page.url}`,
    `Page <title>: ${page.title ?? "(none found)"}`,
    `Meta description: ${page.metaDescription ?? "(none found)"}`,
    `Visible body text (truncated): ${page.bodyText.slice(0, 4000)}`,
    ``,
    `First silently work out what specific market/industry this brand competes in from the real content above (be literal — e.g. "digital marketing agency", not a generic adjacent category). Then suggest 2-4 real, well-known companies that compete in that SAME specific industry — this is general market knowledge, not something read off the page, so double-check each one actually operates in the same business (e.g. an ERP software vendor is NOT a competitor to a marketing agency). Write any text in ${lang}; for each, include "domain" only if you're confident of it, otherwise use an empty string.`,
    ``,
    `Respond with ONLY a JSON object, no markdown fences, no commentary, matching exactly:`,
    `{"competitors": [{"name": "...", "domain": "..."}]}`,
  ].join("\n");
}

function demoProfileResult(domain: string): BrandProfileResult {
  const name = guessNameFromDomain(domain);
  return {
    brand: { name, domain },
    description: `[DEMO DATA] ${name} için gerçek bir marka özeti çıkarmak üzere bir model API anahtarı bağlanmalı — bu alan sayfa gerçekten taranıp analiz edildiğinde gerçek içerikle doldurulur.`,
    industry: "[DEMO DATA — genel kategori]",
    identityAdjectives: ["[DEMO DATA]"],
    productTags: ["[DEMO DATA]"],
    personas: EVEN_PERSONAS,
    demoMode: true,
    model: "demo (no API key configured)",
  };
}

/** Kart step "Marka profili" — name/description/industry/identity/products/personas only, no
 * competitors (those are the separate, parallel "Rakipler" step below). */
export async function runProfileStep(
  page: { url: string; title: string | null; metaDescription: string | null; bodyText: string },
  domain: string,
  language: "tr" | "en" = "tr"
): Promise<BrandProfileResult> {
  const provider = isDemoMode() ? null : pickProvider();
  if (!provider) return demoProfileResult(domain);

  const { text, model } = await provider.run(buildProfilePrompt(page, language));
  const parsed = extractJsonObject(text);

  const identityAdjectives: string[] = Array.isArray(parsed.identityAdjectives)
    ? parsed.identityAdjectives.filter((a: any) => typeof a === "string" && a.trim()).slice(0, 5).map((a: string) => a.trim())
    : [];
  const productTags: string[] = Array.isArray(parsed.productTags)
    ? parsed.productTags.filter((a: any) => typeof a === "string" && a.trim()).slice(0, 6).map((a: string) => a.trim())
    : [];

  return {
    brand: {
      name: typeof parsed.brandName === "string" && parsed.brandName.trim() ? parsed.brandName.trim() : guessNameFromDomain(domain),
      domain,
    },
    description: typeof parsed.description === "string" && parsed.description.trim() ? parsed.description.trim() : "[NEEDS: açıklama]",
    industry: typeof parsed.industry === "string" && parsed.industry.trim() ? parsed.industry.trim() : "[NEEDS: kategori]",
    identityAdjectives,
    productTags,
    personas: normalizePersonaShares(parsed.personaShares),
    demoMode: false,
    model,
  };
}

/** Kart step "Rakipler" — runs in parallel with "Marka profili" (both only need the same
 * crawled page), not nested inside it. Same known limitation as before: these are the model's
 * general market knowledge, not read off the page — always presented as editable/removable. */
export async function runCompetitorsStep(
  page: { url: string; title: string | null; metaDescription: string | null; bodyText: string },
  domain: string,
  language: "tr" | "en" = "tr"
): Promise<CompetitorsResult> {
  const provider = isDemoMode() ? null : pickProvider();
  if (!provider) return { competitors: [{ name: "[DEMO DATA]", domain: "" }], demoMode: true, model: "demo (no API key configured)" };

  const { text, model } = await provider.run(buildCompetitorsPrompt(page, language));
  const parsed = extractJsonObject(text);

  const competitors: DiscoveredCompetitor[] = Array.isArray(parsed.competitors)
    ? parsed.competitors
        .filter((c: any) => c && typeof c.name === "string" && c.name.trim())
        .slice(0, 4)
        .map((c: any) => ({ name: String(c.name).trim(), domain: typeof c.domain === "string" ? c.domain.trim() : "" }))
    : [];

  return { competitors, demoMode: false, model };
}

export async function discoverBrandFromUrl(rawUrl: string, language: "tr" | "en" = "tr"): Promise<DiscoveredBrand> {
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
      identityAdjectives: [],
      productTags: [],
      personas: EVEN_PERSONAS,
      competitors: [],
      demoMode: false,
      model: provider.defaultModel,
    };
  }

  const prompt = buildPrompt(page, language);
  const { text, model } = await provider.run(prompt);
  const parsed = extractJsonObject(text);

  const competitors: DiscoveredCompetitor[] = Array.isArray(parsed.competitors)
    ? parsed.competitors
        .filter((c: any) => c && typeof c.name === "string" && c.name.trim())
        .slice(0, 4)
        .map((c: any) => ({ name: String(c.name).trim(), domain: typeof c.domain === "string" ? c.domain.trim() : "" }))
    : [];

  const identityAdjectives: string[] = Array.isArray(parsed.identityAdjectives)
    ? parsed.identityAdjectives.filter((a: any) => typeof a === "string" && a.trim()).slice(0, 5).map((a: string) => a.trim())
    : [];

  const productTags: string[] = Array.isArray(parsed.productTags)
    ? parsed.productTags.filter((a: any) => typeof a === "string" && a.trim()).slice(0, 6).map((a: string) => a.trim())
    : [];

  return {
    brand: {
      name: typeof parsed.brandName === "string" && parsed.brandName.trim() ? parsed.brandName.trim() : guessNameFromDomain(domain),
      domain,
    },
    description: typeof parsed.description === "string" && parsed.description.trim() ? parsed.description.trim() : "[NEEDS: açıklama]",
    industry: typeof parsed.industry === "string" && parsed.industry.trim() ? parsed.industry.trim() : "[NEEDS: kategori]",
    identityAdjectives,
    productTags,
    personas: normalizePersonaShares(parsed.personaShares),
    competitors,
    demoMode: false,
    model,
  };
}
