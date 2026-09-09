import * as cheerio from "cheerio";
import type { ArticleAuditResult } from "@/types";
import { PROVIDERS, isDemoMode } from "@/lib/geo-providers";

/**
 * Article Writer's engine. Two strict steps, never mixed:
 * 1. Fetch the real page and extract everything the analysis needs (title, meta,
 *    canonical, images+alt, internal links, existing JSON-LD, visible body text) —
 *    the exact same "ground truth first" approach as lib/seo-audit.ts.
 * 2. Hand ONLY that extracted, real content to the model and ask it to apply a fixed
 *    rulebook (character-count caps, answer-first checks, schema validation) and
 *    propose article ideas — the model never fetches anything itself, so it can never
 *    hallucinate a page it hasn't seen. Same [NEEDS: ...] no-invented-facts discipline
 *    as lib/content-generator.ts governs the article recommendations.
 */

const FETCH_TIMEOUT_MS = 15000;
const PREFERRED_ORDER = ["anthropic", "openai", "google", "perplexity", "deepseek", "xai"] as const;

function pickProvider() {
  for (const id of PREFERRED_ORDER) {
    const p = PROVIDERS[id];
    if (p.isConfigured()) return p;
  }
  return null;
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GeoSeoArticleWriterBot/0.1; +https://example.com/bot)" },
    });
  } finally {
    clearTimeout(timer);
  }
}

function normalizeUrl(input: string): string {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

interface ExtractedImage {
  src: string;
  alt: string | null;
}

interface ExtractedLink {
  text: string;
  href: string;
}

interface ExtractedPage {
  url: string;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  h1s: string[];
  images: ExtractedImage[];
  imagesTotalCount: number;
  internalLinks: ExtractedLink[];
  existingSchemaTypes: string[];
  existingSchemaRaw: string;
  bodyText: string;
  bodyHtmlExcerpt: string;
}

async function extractPage(rawUrl: string): Promise<ExtractedPage> {
  const url = normalizeUrl(rawUrl);
  const parsed = new URL(url);
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Sayfa alınamadı: HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const title = $("title").first().text().trim() || null;
  const metaDescription = $('meta[name="description"]').attr("content")?.trim() || null;
  const canonicalHref = $('link[rel="canonical"]').attr("href") || null;
  const canonical = canonicalHref ? new URL(canonicalHref, url).toString() : null;
  const h1s = $("h1").map((_, el) => $(el).text().trim()).get().filter(Boolean);

  const allImages = $("img")
    .map((_, el) => {
      const src = $(el).attr("src");
      if (!src) return null;
      let resolved: string;
      try {
        resolved = new URL(src, url).toString();
      } catch {
        resolved = src;
      }
      return { src: resolved, alt: $(el).attr("alt") ?? null };
    })
    .get()
    .filter((x): x is ExtractedImage => x !== null);
  // Prioritize images missing alt text — those are the ones worth spending the model's attention on.
  const missingAltFirst = [...allImages].sort((a, b) => (a.alt ? 1 : 0) - (b.alt ? 1 : 0));
  const images = missingAltFirst.slice(0, 20);

  const internalLinks: ExtractedLink[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
    let resolved: URL;
    try {
      resolved = new URL(href, url);
    } catch {
      return;
    }
    if (resolved.hostname !== parsed.hostname) return;
    const text = $(el).text().trim().replace(/\s+/g, " ");
    if (!text) return;
    internalLinks.push({ text, href: resolved.toString() });
  });

  const schemaScripts = $('script[type="application/ld+json"]');
  const schemaTypes = new Set<string>();
  const schemaRawBlocks: string[] = [];
  schemaScripts.each((_, el) => {
    const raw = $(el).contents().text();
    try {
      const json = JSON.parse(raw);
      const items = Array.isArray(json) ? json : [json];
      for (const item of items) {
        const graph = item["@graph"] ? item["@graph"] : [item];
        for (const g of graph) {
          if (g && g["@type"]) {
            const t = Array.isArray(g["@type"]) ? g["@type"].join(", ") : g["@type"];
            schemaTypes.add(String(t));
          }
        }
      }
      schemaRawBlocks.push(raw.slice(0, 1500));
    } catch {
      // ignore malformed JSON-LD block
    }
  });

  const bodyText = $("body").text().replace(/\s+/g, " ").trim().slice(0, 8000);
  // A light structural excerpt (headings + first paragraphs) gives the model the actual
  // surrounding wording it needs to quote ~10 words of context for missing-link suggestions.
  const bodyHtmlExcerpt = $("body")
    .find("h1, h2, h3, p")
    .slice(0, 60)
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean)
    .join("\n")
    .slice(0, 6000);

  return {
    url,
    title,
    metaDescription,
    canonical,
    h1s,
    images,
    imagesTotalCount: allImages.length,
    internalLinks: internalLinks.slice(0, 60),
    existingSchemaTypes: Array.from(schemaTypes),
    existingSchemaRaw: schemaRawBlocks.join("\n---\n").slice(0, 3000),
    bodyText,
    bodyHtmlExcerpt,
  };
}

function buildPrompt(page: ExtractedPage): string {
  const lines: string[] = [];
  lines.push(
    "You are a senior technical SEO auditor and article strategist. You will be given the REAL, already-fetched content of a single page below — do not assume anything about the page beyond what's provided here."
  );
  lines.push(`Target URL: ${page.url}`);
  lines.push("---");
  lines.push("## Extracted page data");
  lines.push(`Current <title>: ${page.title ?? "(missing)"}`);
  lines.push(`Current meta description: ${page.metaDescription ?? "(missing)"}`);
  lines.push(`Current canonical: ${page.canonical ?? "(missing)"}`);
  lines.push(`H1(s): ${page.h1s.length ? page.h1s.join(" | ") : "(none found)"}`);
  lines.push(
    `Images (${page.images.length} of ${page.imagesTotalCount} total, missing-alt ones prioritized): ${JSON.stringify(page.images)}`
  );
  lines.push(`Internal links found (up to 60): ${JSON.stringify(page.internalLinks)}`);
  lines.push(
    `Existing JSON-LD schema types: ${page.existingSchemaTypes.length ? page.existingSchemaTypes.join(", ") : "(none)"}`
  );
  if (page.existingSchemaRaw) lines.push(`Existing JSON-LD raw (truncated): ${page.existingSchemaRaw}`);
  lines.push(`Visible body text (truncated): ${page.bodyText}`);
  lines.push(`Structural excerpt (headings + paragraphs, truncated): ${page.bodyHtmlExcerpt}`);
  lines.push("---");
  lines.push("## Process");
  lines.push(
    "1. Identify the page's primary search intent (informational / commercial / transactional / navigational), the page type, and the most likely target keyword based on the existing title, H1, URL slug, and body copy."
  );
  lines.push("2. Run each of the analyses below, using ONLY the extracted data above — never invent content that wasn't given to you.");
  lines.push("3. Be specific and opinionated. If a category is already fine, say so in one line — do not invent problems.");
  lines.push("---");
  lines.push("## 1. Page Title — rules");
  lines.push("- 50-60 characters (hard cap 65)");
  lines.push("- Primary keyword in the first ~30 characters");
  lines.push("- Brand name at the end, separated by | or –");
  lines.push("- Matches search intent (informational → \"What is…\"/\"How to…\", commercial → \"Best…\"/\"Top…\", product → product name + USP)");
  lines.push("- Click-worthy: a number, year, benefit, or differentiator where natural");
  lines.push("## 2. Meta Description — rules");
  lines.push("- 150-160 characters (hard cap 160)");
  lines.push("- Includes the primary keyword once, naturally");
  lines.push("- Contains an explicit benefit and a soft CTA");
  lines.push("- If missing entirely, flag it as high priority");
  lines.push("## 3. Canonical URL — rules");
  lines.push("- Every indexable page should have a self-referencing canonical matching the actual rendered URL (protocol, host, trailing slash, no tracking params)");
  lines.push("- Flag if canonical points elsewhere, or is missing entirely");
  lines.push("## 4. Image Alt Text — rules");
  lines.push("- Descriptive of what the image actually shows, not generic (\"image\", \"photo\", \"screenshot\")");
  lines.push("- Under 125 characters, includes the primary keyword ONLY when genuinely relevant, never stuffed");
  lines.push("- A missing alt on a non-decorative image is a violation (accessibility + SEO)");
  lines.push("## 5. Internal Links — two parts");
  lines.push(
    "5a. Existing links: flag only problem anchors — generic (\"click here\", \"read more\"), exact-match keyword stuffing, or a raw URL used as anchor text."
  );
  lines.push(
    "5b. Missing opportunities: from the body content, identify 3-7 phrases that should link to another relevant page on the same domain but currently don't. If you cannot determine an actual target URL, suggest a plausible URL slug pattern (e.g. /blog/[topic])."
  );
  lines.push("## 6. FAQ Schema");
  lines.push(
    "Only add FAQPage schema if the page actually has visible Q&A content a user can read. If it has visible FAQ content but no schema, generate the full ready-to-paste JSON-LD block. If it already has FAQ schema, validate it against the visible content and flag any mismatch. If there's no FAQ content on the page, status is not-applicable."
  );
  lines.push("## 7. Article Schema");
  lines.push(
    "Only applicable to article/blog/news-style pages — not applicable for product, category, or homepage URLs. Required properties: headline (≤110 chars), image, datePublished, author. Recommended: dateModified, publisher, description. If the page is an article and missing schema, generate the full JSON-LD, filling in what you can detect and marking anything you can't determine as \"TODO: …\". If it already has schema, validate it. If the page isn't an article, status is not-applicable."
  );
  lines.push("## 8. Article Recommendations");
  lines.push(
    "Based ONLY on the gaps and missed internal-link opportunities you found above, propose 2-4 new article/content ideas this site should write to close them — each with a working title, a target keyword, a one-sentence angle, and a 4-6 bullet outline. These must be grounded in real gaps you identified above, not generic content-marketing ideas unrelated to this page."
  );
  lines.push("## 9. Priority Action List");
  lines.push("The top 5 fixes ranked by SEO impact, one line each, most impactful first.");
  lines.push("---");
  lines.push(
    `Respond with ONLY a single JSON object, no markdown fences, no commentary, matching EXACTLY this shape:
{
  "pageType": "string, e.g. 'blog article', 'product page', 'category page', 'homepage'",
  "searchIntent": "string, e.g. 'informational'",
  "targetKeyword": "string",
  "title": { "current": "string", "currentLength": 0, "suggested": "string", "suggestedLength": 0, "why": "string" },
  "metaDescription": { "current": "string", "suggested": "string", "why": "string" },
  "canonical": { "current": "string or empty", "suggested": "string", "why": "string" },
  "imageAlts": [ { "src": "string", "currentAlt": "string (empty if missing)", "suggestedAlt": "string", "why": "string" } ],
  "linkIssues": [ { "anchorText": "string", "targetUrl": "string", "issue": "string", "suggestedAnchor": "string" } ],
  "missingLinks": [ { "suggestedAnchor": "string", "context": "~10 words of surrounding text quoted from the body", "suggestedTargetUrlPattern": "string", "why": "string" } ],
  "faqSchema": { "status": "present-valid | present-mismatch | missing | not-applicable", "note": "string", "jsonLd": "full JSON-LD as a string, or null" },
  "articleSchema": { "status": "present-valid | present-mismatch | missing | not-applicable", "note": "string", "jsonLd": "full JSON-LD as a string, or null" },
  "articleRecommendations": [ { "title": "string", "targetKeyword": "string", "angle": "string", "outline": ["string", "string"] } ],
  "priorityActions": ["string", "string", "string", "string", "string"]
}
Only include real problems — if imageAlts, linkIssues, or missingLinks have nothing to flag, return an empty array rather than inventing one.`
  );

  return lines.join("\n");
}

function extractJson(text: string): any {
  let cleaned = text.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) cleaned = fence[1].trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
    throw new Error("Model yanıtı geçerli JSON değildi — tekrar deneyin.");
  }
}

function demoResult(page: ExtractedPage): ArticleAuditResult {
  const title = page.title ?? "";
  const description = page.metaDescription ?? "";
  return {
    url: page.url,
    fetchedAt: new Date().toISOString(),
    pageType: "[DEMO DATA]",
    searchIntent: "[DEMO DATA]",
    targetKeyword: "[DEMO DATA — ANTHROPIC_API_KEY veya OPENAI_API_KEY bağlayın]",
    title: {
      current: title,
      currentLength: title.length,
      suggested: "[DEMO DATA — gerçek öneri için bir model API anahtarı bağlanmalı]",
      suggestedLength: 0,
      why: "Demo modu: gerçek bir model çağrısı yapılmadı.",
    },
    metaDescription: {
      current: description,
      suggested: "[DEMO DATA]",
      why: "Demo modu: gerçek bir model çağrısı yapılmadı.",
    },
    canonical: { current: page.canonical, suggested: page.canonical ?? "[DEMO DATA]", why: "Demo modu." },
    imageAlts: page.images.filter((i) => !i.alt).slice(0, 5).map((i) => ({
      src: i.src,
      currentAlt: "",
      suggestedAlt: "[DEMO DATA]",
      why: "Demo modu: gerçek bir model çağrısı yapılmadı.",
    })),
    imagesTotal: page.imagesTotalCount,
    imagesSkipped: Math.max(0, page.imagesTotalCount - page.images.length),
    linkIssues: [],
    missingLinks: [],
    faqSchema: { status: "not-applicable", note: "Demo modu.", jsonLd: null },
    articleSchema: { status: "not-applicable", note: "Demo modu.", jsonLd: null },
    articleRecommendations: [],
    priorityActions: [
      "[DEMO DATA] Gerçek öneriler için .env'e ANTHROPIC_API_KEY veya OPENAI_API_KEY ekleyin.",
    ],
    demoMode: true,
    model: "demo (no API key configured)",
  };
}

export async function runArticleAudit(rawUrl: string): Promise<ArticleAuditResult> {
  const page = await extractPage(rawUrl);

  const provider = isDemoMode() ? null : pickProvider();
  if (!provider) return demoResult(page);

  const prompt = buildPrompt(page);
  const { text, model } = await provider.run(prompt);
  const parsed = extractJson(text);

  return {
    url: page.url,
    fetchedAt: new Date().toISOString(),
    pageType: String(parsed.pageType ?? ""),
    searchIntent: String(parsed.searchIntent ?? ""),
    targetKeyword: String(parsed.targetKeyword ?? ""),
    title: {
      current: String(parsed.title?.current ?? page.title ?? ""),
      currentLength: Number(parsed.title?.currentLength ?? (page.title?.length ?? 0)),
      suggested: String(parsed.title?.suggested ?? ""),
      suggestedLength: Number(parsed.title?.suggestedLength ?? 0),
      why: String(parsed.title?.why ?? ""),
    },
    metaDescription: {
      current: String(parsed.metaDescription?.current ?? page.metaDescription ?? ""),
      suggested: String(parsed.metaDescription?.suggested ?? ""),
      why: String(parsed.metaDescription?.why ?? ""),
    },
    canonical: {
      current: page.canonical,
      suggested: String(parsed.canonical?.suggested ?? ""),
      why: String(parsed.canonical?.why ?? ""),
    },
    imageAlts: Array.isArray(parsed.imageAlts) ? parsed.imageAlts.slice(0, 20) : [],
    imagesTotal: page.imagesTotalCount,
    imagesSkipped: Math.max(0, page.imagesTotalCount - page.images.length),
    linkIssues: Array.isArray(parsed.linkIssues) ? parsed.linkIssues.slice(0, 20) : [],
    missingLinks: Array.isArray(parsed.missingLinks) ? parsed.missingLinks.slice(0, 10) : [],
    faqSchema: {
      status: parsed.faqSchema?.status ?? "not-applicable",
      note: String(parsed.faqSchema?.note ?? ""),
      jsonLd: parsed.faqSchema?.jsonLd ?? null,
    },
    articleSchema: {
      status: parsed.articleSchema?.status ?? "not-applicable",
      note: String(parsed.articleSchema?.note ?? ""),
      jsonLd: parsed.articleSchema?.jsonLd ?? null,
    },
    articleRecommendations: Array.isArray(parsed.articleRecommendations) ? parsed.articleRecommendations.slice(0, 4) : [],
    priorityActions: Array.isArray(parsed.priorityActions) ? parsed.priorityActions.slice(0, 5) : [],
    demoMode: false,
    model,
  };
}
