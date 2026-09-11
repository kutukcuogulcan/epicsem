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

export interface PageSummary {
  url: string;
  title: string | null;
  metaDescription: string | null;
  bodyText: string;
}

export function normalizeUrl(input: string): string {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
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
