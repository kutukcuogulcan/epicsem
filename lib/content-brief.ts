import type { GapRow, GapVerdict, GeoRunResult, SeoAuditResult } from "@/types";

/**
 * Closes the loop from "here's the gap" to "here's what to write". Built entirely
 * from this run's own data — the prompts the brand actually lost in the GEO test,
 * and the concrete content gaps the audit already found. Nothing here is invented;
 * a brief with no real signal to work from is simply not produced.
 */

export interface ContentBrief {
  url: string;
  verdict: GapVerdict;
  reason: string;
  targetQuestions: string[];
  suggestedHeadings: string[];
  contentGaps: string[];
}

interface BrandRef {
  name: string;
  domain: string;
}

function normalizeDomain(d: string): string {
  return d
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function toHeading(prompt: string): string {
  const trimmed = prompt.trim();
  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return capitalized.endsWith("?") ? capitalized : `${capitalized}?`;
}

export function buildContentBriefs(
  audits: SeoAuditResult[],
  gapMatrix: GapRow[],
  runs: GeoRunResult[],
  brand: BrandRef,
  competitors: BrandRef[]
): ContentBrief[] {
  const brandDomain = normalizeDomain(brand.domain);
  const competitorDomains = new Set(competitors.map((c) => normalizeDomain(c.domain)));

  // Prompts where the brand lost — not mentioned/cited, or a tracked competitor was cited instead.
  const missedPrompts = new Set<string>();
  for (const run of runs) {
    const brandCited = run.citations.some((c) => c.domain === brandDomain);
    const competitorCited = run.citations.some((c) => competitorDomains.has(c.domain));
    if (!run.mentioned || (!brandCited && competitorCited)) {
      missedPrompts.add(run.promptText);
    }
  }
  const targetQuestions = Array.from(missedPrompts).slice(0, 6);
  const suggestedHeadings = targetQuestions.map(toHeading);

  const briefs: ContentBrief[] = [];
  for (const row of gapMatrix) {
    if (row.verdict !== "invisible" && row.verdict !== "needs-work" && row.verdict !== "blocked") continue;
    const audit = audits.find((a) => a.url === row.url);
    if (!audit) continue;

    const contentGaps: string[] = [];
    if (!audit.meta.hasSchema || !audit.meta.schemaTypes.includes("FAQPage")) {
      contentGaps.push("No FAQPage schema — add direct Q&A blocks AI engines can lift verbatim.");
    }
    if (audit.meta.wordCount < 300) {
      contentGaps.push(
        `Thin content (~${audit.meta.wordCount} words) — generative engines favor pages that fully answer a question in self-contained text.`
      );
    }
    if (!audit.meta.description) {
      contentGaps.push("No meta description — see the Fixes section on the audit for a generated draft.");
    }

    let reason: string;
    if (row.verdict === "blocked") {
      reason = `${row.blockedBots} AI crawler(s) blocked in robots.txt — fix access before content changes will matter.`;
    } else if (row.verdict === "invisible") {
      reason = "Technically sound and open to AI crawlers, but not cited in this run — likely a content-shape problem, not a technical one.";
    } else {
      reason = "Below the SEO/AXO bar — the technical fixes on the audit's Fixes section should come before a content push here.";
    }

    // Only worth a brief if there's real signal to act on — lost prompts or a concrete content gap.
    if (targetQuestions.length === 0 && contentGaps.length === 0) continue;

    briefs.push({
      url: row.url,
      verdict: row.verdict,
      reason,
      targetQuestions,
      suggestedHeadings,
      contentGaps,
    });
  }
  return briefs;
}
