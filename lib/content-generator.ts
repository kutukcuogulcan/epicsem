import { knowledgeBlock } from "@/lib/knowledge-prompt";
import type { EngineId, GeneratedArticle } from "@/types";
import type { ContentBrief } from "@/lib/content-brief";
import { PROVIDERS, isDemoMode } from "@/lib/geo-providers";
import { fetchPageSummary, type PageSummary } from "@/lib/content-fetch";

/**
 * AI content generation grounded in a real ContentBrief — a page's actual gap-analysis
 * findings (lost prompts, missing headings, concrete content gaps), never a bare topic
 * string. This is the deliberate difference from Arvow's "thin, auto-generated content"
 * pattern documented in user complaints: the model is instructed to only use facts
 * already present in the brief and to leave an explicit [NEEDS: ...] placeholder for
 * anything it can't ground, rather than invent statistics, pricing, or claims.
 */

interface BrandRef {
  name: string;
  domain: string;
}

// Preference order: general-purpose long-form writers first: Anthropic/OpenAI generally
// produce the most reliably-structured long-form JSON; DeepSeek/xAI/Google as fallbacks.
const PREFERRED_ORDER: EngineId[] = ["anthropic", "openai", "google", "perplexity", "deepseek", "xai"];

function pickProvider() {
  for (const id of PREFERRED_ORDER) {
    const p = PROVIDERS[id];
    if (p.isConfigured()) return p;
  }
  return null;
}

function buildGenerationPrompt(brief: ContentBrief, brand: BrandRef, format: "article" | "listicle" = "article"): string {
  const lines: string[] = [];
  if (format === "listicle") {
    lines.push(
      `You are writing a LISTICLE (a numbered/bulleted list-format article, e.g. "7 things to check before...") for ${brand.name} (${brand.domain}) to close a real content gap found by an SEO/GEO (generative engine optimization) audit on ${brief.url}. Structure the body as a numbered list of items (## headings per item is fine), not prose paragraphs.`
    );
  } else {
    lines.push(
      `You are writing a page/article for ${brand.name} (${brand.domain}) to close a real content gap found by an SEO/GEO (generative engine optimization) audit on ${brief.url}.`
    );
  }
  lines.push(`Gap analysis verdict: "${brief.verdict}" — ${brief.reason}`);

  if (brief.targetQuestions.length > 0) {
    lines.push("");
    lines.push("Real questions AI answer engines are being asked where this brand currently loses to a competitor or isn't mentioned at all — answer each one directly, answer-first (the direct answer in the opening sentence, not buried):");
    for (const q of brief.targetQuestions) lines.push(`- ${q}`);
  }

  if (brief.suggestedHeadings.length > 0) {
    lines.push("");
    lines.push("Suggested headings/sections to cover:");
    for (const h of brief.suggestedHeadings) lines.push(`- ${h}`);
  }

  if (brief.contentGaps.length > 0) {
    lines.push("");
    lines.push("Specific content gaps this audit found on the page:");
    for (const g of brief.contentGaps) lines.push(`- ${g}`);
  }

  lines.push("");
  lines.push(
    "CRITICAL constraint: do not invent facts, statistics, pricing, dates, customer counts, awards, or any claim about the brand that isn't general, safely-known information. Where the article needs a specific fact you don't have (a price, a stat, a proof point), write a placeholder in the exact form [NEEDS: short description of the missing fact] instead of making one up. This placeholder convention is required, not optional."
  );
  lines.push("");
  lines.push(
    `Respond with ONLY a single JSON object, no markdown fences, no commentary, matching exactly this shape:
{
  "title": "50-60 character SEO title",
  "metaDescription": "140-160 character meta description",
  "bodyMarkdown": "the full article in markdown, using ## / ### headings, answer-first paragraphs, and bullet lists where useful — 500-900 words",
  "openPlaceholders": ["each distinct [NEEDS: ...] placeholder used in bodyMarkdown, verbatim, as its own array entry — empty array if none were needed"]
}`
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
        // fall through to the throw below
      }
    }
    throw new Error("Model response wasn't valid JSON — try generating again.");
  }
}

function demoArticle(brief: ContentBrief, brand: BrandRef): GeneratedArticle {
  const heading = brief.suggestedHeadings[0] ?? `${brand.name}: ${brief.url}`;
  const title = heading.length > 60 ? heading.slice(0, 57) + "..." : heading;
  const sections = (brief.suggestedHeadings.length > 0 ? brief.suggestedHeadings : brief.targetQuestions)
    .slice(0, 4)
    .map(
      (h) =>
        `## ${h}\n\n[DEMO DATA — connect OPENAI_API_KEY or ANTHROPIC_API_KEY in .env to generate a real, grounded draft here instead of this placeholder.] ${brand.name} would answer this directly in the opening sentence, then expand with specifics. [NEEDS: real supporting detail from ${brand.domain}]`
    )
    .join("\n\n");
  const gapsNote = brief.contentGaps.length > 0 ? `\n\n## Gaps this closes\n\n${brief.contentGaps.map((g) => `- ${g}`).join("\n")}` : "";

  return {
    title,
    metaDescription: `[DEMO DATA] A ${brand.name} answer to: ${brief.targetQuestions[0] ?? heading}`.slice(0, 160),
    bodyMarkdown: `${sections}${gapsNote}\n\n*[DEMO DATA — this entire draft is simulated. No API key is configured, so nothing was actually generated by a model.]*`,
    openPlaceholders: sections.match(/\[NEEDS:[^\]]*\]/g) ?? [],
    demoMode: true,
    model: "demo (no API key configured)",
  };
}

const LANG_NAMES: Record<string, string> = { tr: "Turkish", en: "English", de: "German", fr: "French", es: "Spanish", it: "Italian", nl: "Dutch", ar: "Arabic", ru: "Russian", pt: "Portuguese" };

/** Autoblog stil seçenekleri — dil ve "Öne çıkanlar" bölümü. */
export function styleInstructions(opts: { language?: string; takeaways?: boolean } = {}): string {
  const lines: string[] = [];
  if (opts.language) lines.push(`Write the entire article (title, meta description, body) in ${LANG_NAMES[opts.language] ?? opts.language}.`);
  if (opts.takeaways)
    lines.push(
      `Right after the opening answer paragraph, add a "## ${opts.language && opts.language !== "tr" ? "Key takeaways" : "Öne çıkanlar"}" section with 3-5 short bullet points summarizing the article.`
    );
  return lines.length ? "\n\n" + lines.join("\n") : "";
}

export async function generateArticleFromBrief(
  brief: ContentBrief,
  brand: BrandRef,
  format: "article" | "listicle" = "article",
  knowledge?: string,
  extra?: string
): Promise<GeneratedArticle> {
  // Respect the global DEMO_MODE override the same way lib/geo-engine.ts does — a key
  // being present shouldn't force a real (billable) call if DEMO_MODE=true was set
  // deliberately. Route callers use this same check to decide whether to enforce quota.
  const provider = isDemoMode() ? null : pickProvider();
  if (!provider) return demoArticle(brief, brand);

  const prompt = buildGenerationPrompt(brief, brand, format) + (extra ?? "") + knowledgeBlock(knowledge);
  const { text, model } = await provider.run(prompt);
  return parseArticleResponse(text, model);
}

function parseArticleResponse(text: string, model: string): GeneratedArticle {
  const parsed = extractJson(text);
  if (!parsed.title || !parsed.bodyMarkdown) {
    throw new Error("Model response was missing required fields (title/bodyMarkdown).");
  }
  return {
    title: String(parsed.title),
    metaDescription: String(parsed.metaDescription ?? ""),
    bodyMarkdown: String(parsed.bodyMarkdown),
    openPlaceholders: Array.isArray(parsed.openPlaceholders) ? parsed.openPlaceholders.map(String) : [],
    demoMode: false,
    model,
  };
}

const RESPONSE_SHAPE_INSTRUCTIONS = `Respond with ONLY a single JSON object, no markdown fences, no commentary, matching exactly this shape:
{
  "title": "50-60 character SEO title",
  "metaDescription": "140-160 character meta description",
  "bodyMarkdown": "the full article in markdown, using ## / ### headings, answer-first paragraphs, and bullet lists where useful — 500-900 words",
  "openPlaceholders": ["each distinct [NEEDS: ...] placeholder used in bodyMarkdown, verbatim, as its own array entry — empty array if none were needed"]
}`;

const NO_FABRICATION_RULE =
  "CRITICAL constraint: do not invent facts, statistics, pricing, dates, customer counts, awards, or any claim that isn't either general safely-known information or literally present in the real page content quoted above. Where the article needs a specific fact you don't have, write a placeholder in the exact form [NEEDS: short description of the missing fact] instead of making one up. This placeholder convention is required, not optional.";

function summarizeForPrompt(label: string, page: PageSummary): string {
  return [
    `${label} (${page.url}):`,
    page.title ? `Title: ${page.title}` : null,
    page.metaDescription ? `Meta description: ${page.metaDescription}` : null,
    `Visible page text (truncated): ${page.bodyText || "(page returned no readable text)"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * URL-grounded Content Hub input types — news reaction, competitor comparison, and
 * "alternatives to X" pages. Same two-step discipline as lib/article-audit.ts: fetch the
 * real page(s) first (lib/content-fetch.ts), then hand ONLY that extracted text to the
 * model. Comparison/alternatives also fetch the brand's own domain so the model has real
 * material for "us" too, instead of inventing what the brand offers.
 */
export async function generateArticleFromUrlInput(
  kind: "news" | "comparison" | "alternatives",
  sourceUrl: string,
  brand: BrandRef,
  knowledge?: string
): Promise<GeneratedArticle> {
  const sourcePage = await fetchPageSummary(sourceUrl);
  const ownPage = kind === "news" ? null : await fetchPageSummary(brand.domain).catch(() => null);

  const lines: string[] = [];
  if (kind === "news") {
    lines.push(
      `You are writing a brand-perspective article for ${brand.name} (${brand.domain}) reacting to / summarizing the real news article below, adding the brand's relevant angle where genuinely applicable.`
    );
  } else if (kind === "comparison") {
    lines.push(
      `You are writing a comparison article: "${brand.name} vs the competitor at ${sourcePage.url}" — based ONLY on the real page content extracted below for each side.`
    );
  } else {
    lines.push(
      `You are writing an "alternatives to ${sourcePage.title ?? sourcePage.url}" article for ${brand.name} (${brand.domain}), positioning ${brand.name} as one real alternative — based ONLY on the real page content extracted below.`
    );
  }

  lines.push("");
  lines.push(summarizeForPrompt(kind === "news" ? "Source article" : "Competitor page", sourcePage));
  if (ownPage) {
    lines.push("");
    lines.push(summarizeForPrompt(`${brand.name}'s own page`, ownPage));
  } else if (kind !== "news") {
    lines.push("");
    lines.push(`(Could not fetch ${brand.domain} — write about ${brand.name} only in general terms and use [NEEDS: ...] for anything specific.)`);
  }

  lines.push("");
  lines.push(NO_FABRICATION_RULE);
  lines.push("");
  lines.push(RESPONSE_SHAPE_INSTRUCTIONS);

  const provider = isDemoMode() ? null : pickProvider();
  if (!provider) {
    return {
      title: `[DEMO] ${kind === "news" ? "Haber temelli yazı" : kind === "comparison" ? "Karşılaştırma" : "Alternatifler"}: ${sourcePage.title ?? sourcePage.url}`,
      metaDescription: `[DEMO DATA] Gerçek bir API anahtarı tanımlanmadığı için bu taslak simüle edildi.`,
      bodyMarkdown: `[DEMO DATA — connect OPENAI_API_KEY or ANTHROPIC_API_KEY in .env to generate a real, grounded draft here instead of this placeholder.]\n\nKaynak: ${sourcePage.url}\n\n[NEEDS: gerçek model çağrısı olmadan bu bölüm doldurulamaz]`,
      openPlaceholders: ["[NEEDS: gerçek model çağrısı olmadan bu bölüm doldurulamaz]"],
      demoMode: true,
      model: "demo (no API key configured)",
    };
  }

  const { text, model } = await provider.run(lines.join("\n") + knowledgeBlock(knowledge));
  return parseArticleResponse(text, model);
}

/**
 * Autoblog: bir anahtar kelimeden (ya da metni okunamayan bir RSS öğesinden) makale.
 * Yine "uydurma yok" kuralı geçerli — markanın kendi ana sayfası ve varsa kaynak özeti
 * modele verilir, bilinmeyen her şey [NEEDS: ...] olarak bırakılır.
 */
export async function generateArticleFromTopic(
  topic: string,
  brand: BrandRef,
  opts: { format?: "article" | "listicle"; context?: string | null; sourceUrl?: string | null; knowledge?: string; language?: string; takeaways?: boolean } = {}
): Promise<GeneratedArticle> {
  const format = opts.format ?? "article";
  const provider = isDemoMode() ? null : pickProvider();
  if (!provider) {
    const body = [
      `## ${topic}`,
      `[DEMO DATA — gerçek bir API anahtarı tanımlı olmadığı için bu taslak simüle edildi.] ${brand.name}, "${topic}" sorusunu ilk cümlede doğrudan cevaplar, sonra ayrıntılara iner. [NEEDS: ${brand.domain} için gerçek bir örnek ya da veri]`,
      `## Sık sorulan sorular`,
      `### ${topic} neden önemli?`,
      `[NEEDS: markaya özgü gerçek cevap]`,
    ].join("\n\n");
    return {
      title: `[DEMO] ${topic}`.slice(0, 60),
      metaDescription: `[DEMO DATA] ${brand.name}: ${topic}`.slice(0, 160),
      bodyMarkdown: body,
      openPlaceholders: body.match(/\[NEEDS:[^\]]*\]/g) ?? [],
      demoMode: true,
      model: "demo (no API key configured)",
    };
  }

  const own = await fetchPageSummary(brand.domain).catch(() => null);
  const lines: string[] = [];
  lines.push(
    format === "listicle"
      ? `You are writing a LISTICLE (numbered list-format article, ## heading per item) for ${brand.name} (${brand.domain}) targeting the search topic / keyword: "${topic}".`
      : `You are writing an SEO + GEO (generative engine optimization) optimized article for ${brand.name} (${brand.domain}) targeting the search topic / keyword: "${topic}".`
  );
  lines.push(
    (opts.language ? "" : "Write in the same language as the topic (default: Turkish). ") + "Open with a 2-3 sentence direct answer to the topic (answer-first, quotable by AI answer engines). Use ## / ### headings phrased the way people actually ask, short paragraphs, bullet lists or a table where useful, and end with a '## Sık sorulan sorular' section of 3-5 real questions with concise answers. Mention the brand naturally where it is genuinely relevant — never as an advert in every paragraph."
  );
  if (opts.context) {
    lines.push("");
    lines.push(`Source material${opts.sourceUrl ? ` (${opts.sourceUrl})` : ""} — use it as the factual basis, rewrite in your own words, never copy sentences:`);
    lines.push(opts.context.slice(0, 4000));
  }
  if (own) {
    lines.push("");
    lines.push(summarizeForPrompt(`${brand.name}'s own page`, own));
  }
  lines.push("");
  lines.push(NO_FABRICATION_RULE);
  lines.push("");
  lines.push(RESPONSE_SHAPE_INSTRUCTIONS);

  const { text, model } = await provider.run(lines.join("\n") + styleInstructions(opts) + knowledgeBlock(opts.knowledge));
  return parseArticleResponse(text, model);
}
