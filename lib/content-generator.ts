import type { EngineId, GeneratedArticle } from "@/types";
import type { ContentBrief } from "@/lib/content-brief";
import { PROVIDERS, isDemoMode } from "@/lib/geo-providers";

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

function buildGenerationPrompt(brief: ContentBrief, brand: BrandRef): string {
  const lines: string[] = [];
  lines.push(
    `You are writing a page/article for ${brand.name} (${brand.domain}) to close a real content gap found by an SEO/GEO (generative engine optimization) audit on ${brief.url}.`
  );
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

export async function generateArticleFromBrief(brief: ContentBrief, brand: BrandRef): Promise<GeneratedArticle> {
  // Respect the global DEMO_MODE override the same way lib/geo-engine.ts does — a key
  // being present shouldn't force a real (billable) call if DEMO_MODE=true was set
  // deliberately. Route callers use this same check to decide whether to enforce quota.
  const provider = isDemoMode() ? null : pickProvider();
  if (!provider) return demoArticle(brief, brand);

  const prompt = buildGenerationPrompt(brief, brand);
  const { text, model } = await provider.run(prompt);
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
