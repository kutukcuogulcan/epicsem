import * as cheerio from "cheerio";

/**
 * Small shared "fetch a real page, extract just enough text to ground a prompt" helper
 * for the Content Hub's URL-based input types (news / comparison / alternatives) — same
 * fetch-then-extract discipline as lib/seo-audit.ts and lib/article-audit.ts: the model
 * never fetches anything itself, so it can never hallucinate a page it hasn't seen.
 * Deliberately lighter than article-audit's full extraction (no links/JSON-LD) since
 * these callers only need a grounded text summary to write from, not an audit.
 */

const FETCH_TIMEOUT_MS = 15000;
const MAX_BODY_CHARS = 6000;
// Kart: LLM'siz otomatik doldurma — Step 1's brand name/country/language guess only ever
// reads cheap HTML metadata (no LLM call, no body-text extraction), so it gets its own much
// shorter timeout than the full crawl step: a slow/unreachable site should fail fast and fall
// back to the domain/TLD-only guess (lib/onboarding-engine.ts never blocks on this) rather
// than holding Step 1 hostage to the same 15s budget the real crawl step tolerates.
const PREFILL_TIMEOUT_MS = 6000;

export interface PageSummary {
  url: string;
  title: string | null;
  metaDescription: string | null;
  bodyText: string;
}

/** Kart: LLM'siz otomatik doldurma — just the handful of HTML signals that drive Step 1's
 * non-AI field guesses. Deliberately NOT reusing PageSummary/fetchPageSummary's body-text
 * extraction (nothing here needs it, and skipping it keeps this fetch lighter/faster). */
export interface PagePrefillMeta {
  /** The URL actually served after following redirects — e.g. http://brand.com →
   * https://www.brand.com — surfaced so Step 1 can show/normalize to the real final address. */
  finalUrl: string;
  title: string | null;
  ogSiteName: string | null;
  /** The <html lang="…"> attribute, lowercased, exactly as found (e.g. "tr", "en-us") —
   * callers normalize to this app's tr|en pair themselves. */
  htmlLang: string | null;
  /** Lowercase 2-letter region codes pulled from <link rel="alternate" hreflang="…">, e.g.
   * ["tr", "de"] from hreflang="tr-TR"/"de-DE" — "x-default" and region-less values (bare
   * "tr") are skipped since they don't name a specific market. */
  hreflangRegions: string[];
}

export function normalizeUrl(input: string): string {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

async function fetchWithTimeout(url: string, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GeoSeoContentHubBot/0.1; +https://example.com/bot)" },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Fetches a real URL and extracts title/meta/visible body text — throws on network or
 * non-2xx failure so callers can fall back to a demo article instead of silently
 * grounding a prompt in nothing. */
export async function fetchPageSummary(rawUrl: string): Promise<PageSummary> {
  const url = normalizeUrl(rawUrl);
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  $("script, style, nav, footer, noscript").remove();
  const bodyText = $("body").text().replace(/\s+/g, " ").trim().slice(0, MAX_BODY_CHARS);

  return {
    url,
    title: $("title").first().text().trim() || null,
    metaDescription: $('meta[name="description"]').attr("content")?.trim() || null,
    bodyText,
  };
}

/** Kart: LLM'siz otomatik doldurma — fetches the real page (redirects followed, short
 * timeout) and extracts ONLY cheap, deterministic HTML metadata — no LLM call, no content
 * summarization, no body text. Throws on network/timeout/non-2xx failure, same discipline as
 * fetchPageSummary — the caller (app/api/onboarding/prefill/route.ts) falls back to a
 * domain/TLD-only guess instead of silently fabricating page content it never actually saw. */
export async function fetchPagePrefillMeta(rawUrl: string): Promise<PagePrefillMeta> {
  const url = normalizeUrl(rawUrl);
  const res = await fetchWithTimeout(url, PREFILL_TIMEOUT_MS);
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const hreflangRegions = new Set<string>();
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const val = $(el).attr("hreflang")?.trim().toLowerCase();
    if (!val || val === "x-default") return;
    const region = val.split("-")[1]; // "tr-TR" -> "tr"; a bare "tr" has no region part
    if (region && /^[a-z]{2}$/.test(region)) hreflangRegions.add(region);
  });

  return {
    finalUrl: res.url || url,
    title: $("title").first().text().trim() || null,
    ogSiteName: $('meta[property="og:site_name"]').attr("content")?.trim() || null,
    htmlLang: $("html").attr("lang")?.trim().toLowerCase() || null,
    hreflangRegions: Array.from(hreflangRegions),
  };
}
