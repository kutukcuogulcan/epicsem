import type { BulkImportResult, SeoAuditResult } from "@/types";
import type { ContentBrief } from "@/lib/content-brief";

/**
 * Generates a ready-to-paste Claude Code prompt from a REAL Epicsem audit result —
 * grounded in the actual issues found, not a generic "fix my SEO" prompt. This is the
 * personalized counterpart to the static templates in lib/prompt-library.ts: same
 * "agent works directly in your codebase" pattern, but pre-filled with this specific
 * page's actual findings so nothing has to be re-discovered or re-typed.
 */
export function buildAuditFixPrompt(result: SeoAuditResult): string {
  const critical = result.issues.filter((i) => i.severity === "critical");
  const warnings = result.issues.filter((i) => i.severity === "warning");
  const blockedBots = result.meta.aiBotAccess.filter((b) => !b.allowed);

  const lines: string[] = [];
  lines.push(`I ran an Epicsem SEO + AXO audit on ${result.url} (SEO score ${result.score}/100, AI-crawlability score ${result.aiCrawlScore}/100). Here are the exact findings — fix what's safe to fix directly in this codebase, and flag the rest for me to decide.`);
  lines.push("");
  lines.push(`Page facts (don't re-derive these, they're already confirmed): title = ${JSON.stringify(result.meta.title ?? "(missing)")}, meta description = ${JSON.stringify(result.meta.description ?? "(missing)")}, H1 count = ${result.meta.h1Count}, word count ≈ ${result.meta.wordCount}, structured data = ${result.meta.hasSchema ? result.meta.schemaTypes.join(", ") : "none found"}, canonical = ${result.meta.canonical ?? "(missing)"}, robots.txt found = ${result.meta.robotsTxtFound}, sitemap found = ${result.meta.sitemapFound}.`);

  if (blockedBots.length > 0) {
    lines.push("");
    lines.push(`AI crawlers currently BLOCKED from this page: ${blockedBots.map((b) => `${b.bot} (${b.engine})`).join(", ")}. Find where this block comes from (robots.txt, a meta robots tag, or a CDN/WAF rule in this repo) and show me the minimal diff to allow them — don't apply it without me confirming, since blocking AI crawlers is sometimes deliberate.`);
  }

  if (critical.length > 0) {
    lines.push("");
    lines.push("Critical issues to fix directly in the code:");
    for (const issue of critical) {
      lines.push(`- [${issue.category}] ${issue.title}: ${issue.detail} — ${issue.recommendation}`);
    }
  }

  if (warnings.length > 0) {
    lines.push("");
    lines.push("Warnings — fix if it's a safe, mechanical change; otherwise list in a report for me:");
    for (const issue of warnings) {
      lines.push(`- [${issue.category}] ${issue.title}: ${issue.detail} — ${issue.recommendation}`);
    }
  }

  if (result.fixes.length > 0) {
    lines.push("");
    lines.push("Epicsem already generated draft code for some of these fixes, from this page's own content (nothing invented) — review each one against the current source before applying, then wire it in following this codebase's existing conventions:");
    for (const fix of result.fixes) {
      lines.push("");
      lines.push(`--- ${fix.label} (${fix.note}) ---`);
      lines.push(fix.code);
    }
  }

  lines.push("");
  lines.push("Do not invent content, statistics, or metadata not already present on the page or elsewhere in this repo. After making changes, run this project's existing build/lint commands to confirm nothing broke.");

  return lines.join("\n");
}

/**
 * Same idea, from one Epicsem gap-analysis Content Brief — turns "here's what's
 * missing and why the page isn't winning citations" into an instruction the agent
 * can act on directly, grounded in the brief's own data.
 */
export function buildContentBriefPrompt(brief: ContentBrief, brandName?: string): string {
  const lines: string[] = [];
  lines.push(`I ran an Epicsem gap analysis on ${brief.url}${brandName ? ` for ${brandName}` : ""} — verdict: "${brief.verdict}". ${brief.reason}`);
  lines.push("");
  lines.push("Using ONLY this page's own existing content and other real content already in this codebase/site — never invented facts or statistics — do the following:");

  if (brief.targetQuestions.length > 0) {
    lines.push("");
    lines.push("Prompts/questions AI engines are being asked where this brand isn't winning yet:");
    for (const q of brief.targetQuestions) lines.push(`- ${q}`);
  }

  if (brief.suggestedHeadings.length > 0) {
    lines.push("");
    lines.push("Turn these into real headings/FAQ entries on the page, each answered directly and completely (answer-first, not buried in the third paragraph):");
    for (const h of brief.suggestedHeadings) lines.push(`- ${h}`);
  }

  if (brief.contentGaps.length > 0) {
    lines.push("");
    lines.push("Specific content gaps the audit found — close each one with real content, or leave a [NEEDS: fact] placeholder if this repo doesn't have the underlying fact:");
    for (const g of brief.contentGaps) lines.push(`- ${g}`);
  }

  lines.push("");
  lines.push("Read the current page first so you don't duplicate what's already there. Output the revised page content as markdown for me to review — don't publish anywhere automatically.");

  return lines.join("\n");
}

/**
 * From a bulk Screaming Frog CSV import — a full-site technical sweep instead of one
 * page. Row counts can run into the thousands, so this deliberately summarizes (counts
 * + a capped sample of URLs per issue) rather than dumping every row — an agent working
 * in the actual repo/CMS can re-derive the rest from the codebase itself.
 */
const SAMPLE_CAP = 15;

function sampleUrls(rows: BulkImportResult["rows"], issueCode: string): string[] {
  return rows.filter((r) => r.issues.includes(issueCode)).slice(0, SAMPLE_CAP).map((r) => r.url);
}

export function buildBulkImportFixPrompt(result: BulkImportResult): string {
  const s = result.summary;
  const lines: string[] = [];
  lines.push(
    `I imported a Screaming Frog crawl (${result.filename}, ${s.totalRows} URLs) into Epicsem. Here's the aggregated technical SEO findings — help me fix what's safe to fix in bulk across this codebase/CMS, and flag anything that needs a per-page editorial decision instead of a mechanical fix.`
  );
  lines.push("");
  lines.push(
    `Summary: ${s.missingTitle} missing titles, ${s.duplicateTitles} URLs sharing a duplicate title, ${s.titleTooLong} titles over 60 chars, ${s.missingMetaDescription} missing meta descriptions, ${s.duplicateMetaDescriptions} URLs sharing a duplicate meta description, ${s.metaDescriptionTooLong} meta descriptions over 160 chars, ${s.missingH1} missing H1, ${s.multipleH1} pages with multiple H1s, ${s.thinContent} pages under ~200 words, ${s.brokenLinks} broken (4xx/5xx) URLs, ${s.redirects} redirects, ${s.nonIndexable} non-indexable URLs, ${s.noindexTag} URLs with a noindex tag.`
  );

  const section = (label: string, code: string, hint: string) => {
    const sample = sampleUrls(result.rows, code);
    if (sample.length === 0) return;
    lines.push("");
    lines.push(`${label} — ${hint} (showing up to ${SAMPLE_CAP} of ${sample.length === SAMPLE_CAP ? "possibly more" : sample.length}):`);
    for (const url of sample) lines.push(`- ${url}`);
  };

  section("Broken URLs (4xx/5xx)", "broken", "find and fix the source of these links/redirects, or confirm they should 410/be removed from sitemaps and internal links");
  section("Missing titles", "missing-title", "generate a unique, accurate 50-60 char title per page from that page's own existing content — do not invent facts");
  section("Missing meta descriptions", "missing-meta-description", "generate a 140-160 char summary per page from that page's own existing content");
  section("Missing H1", "missing-h1", "add one clear H1 per page matching the page's actual topic");
  section("Thin content (<200 words)", "thin-content", "flag for editorial review — don't auto-generate filler content, that's the opposite of what this fixes");
  section("Pages with multiple H1s", "multiple-h1", "keep one, demote the rest to H2/H3 as appropriate to the page structure");

  if (result.duplicateTitleGroups.length > 0) {
    lines.push("");
    lines.push(`Duplicate title groups (${result.duplicateTitleGroups.length} distinct titles reused across multiple URLs) — each group needs titles differentiated based on what's actually different about those pages:`);
    for (const g of result.duplicateTitleGroups.slice(0, SAMPLE_CAP)) {
      lines.push(`- "${g.value}" used on: ${g.urls.slice(0, 5).join(", ")}${g.urls.length > 5 ? ` (+${g.urls.length - 5} more)` : ""}`);
    }
  }

  lines.push("");
  lines.push(
    "Work through these by category, starting with broken links and missing titles/meta descriptions (highest impact, lowest risk). For anything requiring new written content, generate it only from facts already present in this repo/CMS for that page — never invent statistics, pricing, or claims. Batch your changes by directory/section rather than one commit per URL, and run this project's existing build/lint before finishing."
  );

  return lines.join("\n");
}
