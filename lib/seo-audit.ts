import * as cheerio from "cheerio";
import { AI_BOTS } from "./ai-bots";
import { isBotAllowed, parseRobotsTxt } from "./robots";
import { generateFaqSchema, generateMetaDescription, generateOrganizationSchema } from "./fix-generator";
import type { AiBotAccess, GeneratedFix, IssueCategory, IssueSeverity, SeoAuditResult, SeoIssueResult } from "@/types";

const FETCH_TIMEOUT_MS = 12000;

async function fetchWithTimeout(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GeoSeoAuditBot/0.1; +https://example.com/bot)",
        ...(init?.headers ?? {}),
      },
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

function pushIssue(issues: SeoIssueResult[], issue: SeoIssueResult) {
  issues.push(issue);
}

export async function runSeoAudit(rawUrl: string): Promise<SeoAuditResult> {
  const url = normalizeUrl(rawUrl);
  const parsed = new URL(url);
  const issues: SeoIssueResult[] = [];

  // ---- 1. Fetch the page ----
  let html = "";
  let statusOk = true;
  try {
    const res = await fetchWithTimeout(url);
    statusOk = res.ok;
    html = await res.text();
    if (!res.ok) {
      pushIssue(issues, {
        category: "crawlability",
        severity: "critical",
        title: `Page returned HTTP ${res.status}`,
        detail: `Fetching ${url} did not return a 200 OK response.`,
        recommendation: "Ensure the URL resolves correctly and returns a 200 status for both users and crawlers.",
      });
    }
  } catch (err) {
    pushIssue(issues, {
      category: "crawlability",
      severity: "critical",
      title: "Page could not be fetched",
      detail: err instanceof Error ? err.message : "Unknown fetch error",
      recommendation: "Confirm the domain is reachable, not blocked by a firewall/WAF, and DNS resolves publicly.",
    });
    return buildEmptyResult(url, issues);
  }

  const $ = cheerio.load(html);

  // ---- 2. Title & meta description ----
  const title = $("title").first().text().trim() || null;
  if (!title) {
    pushIssue(issues, {
      category: "meta",
      severity: "critical",
      title: "Missing <title> tag",
      detail: "No <title> element was found in the page <head>.",
      recommendation: "Add a unique, descriptive <title> (50-60 chars) — it's the single strongest on-page signal for both classic SEO and how AI engines summarize the page.",
    });
  } else if (title.length > 60) {
    pushIssue(issues, {
      category: "meta",
      severity: "info",
      title: "Title tag is long",
      detail: `Title is ${title.length} characters: "${title}"`,
      recommendation: "Keep titles under ~60 characters so they aren't truncated in SERPs.",
    });
  } else {
    pushIssue(issues, { category: "meta", severity: "pass", title: "Title tag present", detail: title, recommendation: "" });
  }

  const description = $('meta[name="description"]').attr("content")?.trim() || null;
  if (!description) {
    pushIssue(issues, {
      category: "meta",
      severity: "warning",
      title: "Missing meta description",
      detail: "No <meta name=\"description\"> tag found.",
      recommendation: "Write a 140-160 character summary. AI answer engines often lift this text directly when the page has no clearer summary.",
    });
  } else {
    pushIssue(issues, { category: "meta", severity: "pass", title: "Meta description present", detail: description, recommendation: "" });
  }

  const canonical = $('link[rel="canonical"]').attr("href") || null;
  if (!canonical) {
    pushIssue(issues, {
      category: "meta",
      severity: "info",
      title: "No canonical tag",
      detail: "No <link rel=\"canonical\"> found.",
      recommendation: "Add a self-referencing canonical to avoid duplicate-content ambiguity for crawlers.",
    });
  }

  // ---- 3. Headings ----
  const h1s = $("h1");
  const h1Count = h1s.length;
  if (h1Count === 0) {
    pushIssue(issues, {
      category: "headings",
      severity: "warning",
      title: "No H1 found",
      detail: "The page has zero <h1> elements.",
      recommendation: "Add exactly one clear H1 stating the page's main topic — both Google and LLMs use it as the primary topic signal.",
    });
  } else if (h1Count > 1) {
    pushIssue(issues, {
      category: "headings",
      severity: "info",
      title: `Multiple H1 tags (${h1Count})`,
      detail: "More than one <h1> can dilute topical clarity.",
      recommendation: "Use a single H1 per page; structure the rest with H2/H3.",
    });
  } else {
    pushIssue(issues, { category: "headings", severity: "pass", title: "Single H1 present", detail: h1s.first().text().trim(), recommendation: "" });
  }

  // ---- 4. Content depth ----
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = bodyText ? bodyText.split(" ").length : 0;
  if (wordCount < 200) {
    pushIssue(issues, {
      category: "content",
      severity: "warning",
      title: "Thin content",
      detail: `Approx. ${wordCount} words of visible text.`,
      recommendation: "Generative engines favor pages that fully answer a question in self-contained text. Expand to cover the topic thoroughly (definitions, specifics, comparisons) rather than relying on JS-rendered or sparse content.",
    });
  } else {
    pushIssue(issues, { category: "content", severity: "pass", title: "Sufficient content depth", detail: `~${wordCount} words`, recommendation: "" });
  }

  // Answer-first check: does the first ~150 words directly address a question-like structure?
  const first150 = bodyText.split(" ").slice(0, 150).join(" ");
  const hasDirectAnswerPattern = /\b(is|are|means|refers to|works by|helps you|allows you)\b/i.test(first150.slice(0, 400));
  if (wordCount >= 200 && !hasDirectAnswerPattern) {
    pushIssue(issues, {
      category: "content",
      severity: "info",
      title: "Content may not lead with a direct answer",
      detail: "The opening ~150 words don't show an obvious definitional/answer pattern.",
      recommendation: "AI engines quote or paraphrase best when the top of the page states the direct answer in 1-2 sentences before elaborating (the 'answer-first' pattern).",
    });
  }

  // ---- 5. Structured data (schema.org) ----
  const schemaScripts = $('script[type="application/ld+json"]');
  const schemaTypes = new Set<string>();
  schemaScripts.each((_, el) => {
    try {
      const json = JSON.parse($(el).contents().text());
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
    } catch {
      // ignore malformed JSON-LD block
    }
  });
  const hasSchema = schemaTypes.size > 0;
  if (!hasSchema) {
    pushIssue(issues, {
      category: "schema",
      severity: "warning",
      title: "No structured data (JSON-LD) found",
      detail: "No <script type=\"application/ld+json\"> blocks detected.",
      recommendation: "Add Organization/Product/Article/FAQPage schema as relevant. Structured data is one of the clearest machine-readable signals LLM crawlers and Google AI Overviews use to extract facts confidently.",
    });
  } else {
    pushIssue(issues, {
      category: "schema",
      severity: "pass",
      title: "Structured data present",
      detail: `Types found: ${Array.from(schemaTypes).join(", ")}`,
      recommendation: "",
    });
  }
  const hasFaqSchema = Array.from(schemaTypes).some((t) => t.includes("FAQPage"));
  if (!hasFaqSchema) {
    pushIssue(issues, {
      category: "schema",
      severity: "info",
      title: "No FAQPage schema",
      detail: "FAQPage structured data was not detected.",
      recommendation: "If the page answers common questions, mark them up with FAQPage schema — it's one of the highest-leverage formats for direct citation in AI answers.",
    });
  }

  // ---- 5a. Language & localization (TR market depth) ----
  const htmlLang = $("html").attr("lang")?.trim().toLowerCase() || null;
  const hreflangs = $('link[rel="alternate"][hreflang]')
    .map((_, el) => $(el).attr("hreflang")?.toLowerCase() ?? "")
    .get()
    .filter(Boolean);
  if (!htmlLang) {
    pushIssue(issues, {
      category: "localization",
      severity: "info",
      title: "No <html lang> attribute",
      detail: "The page doesn't declare a language via <html lang=\"...\">.",
      recommendation: "Declare it (e.g. lang=\"tr\" for Turkish content) — search engines and AI crawlers use it to route content to the right locale/language audience, and it's required for hreflang to work correctly.",
    });
  } else {
    pushIssue(issues, {
      category: "localization",
      severity: "pass",
      title: "Language declared",
      detail: `<html lang="${htmlLang}">${hreflangs.length > 0 ? ` · hreflang alternates: ${hreflangs.join(", ")}` : ""}`,
      recommendation: "",
    });
    if (htmlLang.startsWith("tr") && hreflangs.length === 0) {
      pushIssue(issues, {
        category: "localization",
        severity: "info",
        title: "Turkish page with no hreflang alternates",
        detail: "lang=\"tr\" is declared but no <link rel=\"alternate\" hreflang=\"...\"> tags were found.",
        recommendation: "If this brand also serves other languages/markets, add hreflang alternates (including an x-default) so Google and AI engines don't treat the Turkish and other-language pages as duplicates or serve the wrong one to Turkish users.",
      });
    }
  }

  // ---- 5b. Fix generation — only for what's actually missing, built from real page content ----
  const fixes: GeneratedFix[] = [];
  if (!description) {
    const fix = generateMetaDescription($, title);
    if (fix) fixes.push(fix);
  }
  if (!hasSchema) {
    fixes.push(generateOrganizationSchema(url, title, htmlLang));
  }
  if (!hasFaqSchema) {
    const faqFix = generateFaqSchema($);
    if (faqFix) fixes.push(faqFix);
  }

  // ---- 6. robots.txt & sitemap ----
  let robotsTxtFound = false;
  let robotsBlocks: ReturnType<typeof parseRobotsTxt> = [];
  try {
    const robotsRes = await fetchWithTimeout(`${parsed.origin}/robots.txt`);
    if (robotsRes.ok) {
      robotsTxtFound = true;
      const text = await robotsRes.text();
      robotsBlocks = parseRobotsTxt(text);
    }
  } catch {
    // treat as not found
  }
  pushIssue(issues, {
    category: "crawlability",
    severity: robotsTxtFound ? "pass" : "info",
    title: robotsTxtFound ? "robots.txt found" : "No robots.txt found",
    detail: robotsTxtFound ? `${parsed.origin}/robots.txt` : "A missing robots.txt is not an error, but it means you can't explicitly allow/disallow AI crawlers.",
    recommendation: robotsTxtFound ? "" : "Add a robots.txt so you can deliberately control which AI and search crawlers may access the site.",
  });

  let sitemapFound = false;
  try {
    const sitemapRes = await fetchWithTimeout(`${parsed.origin}/sitemap.xml`);
    sitemapFound = sitemapRes.ok;
  } catch {
    sitemapFound = false;
  }
  pushIssue(issues, {
    category: "crawlability",
    severity: sitemapFound ? "pass" : "warning",
    title: sitemapFound ? "sitemap.xml found" : "No sitemap.xml found",
    detail: sitemapFound ? `${parsed.origin}/sitemap.xml` : "No sitemap detected at the default location.",
    recommendation: sitemapFound ? "" : "Publish an XML sitemap and reference it in robots.txt to help both search and AI crawlers discover all indexable pages.",
  });

  // ---- 7. AI bot accessibility (AXO) ----
  const aiBotAccess: AiBotAccess[] = AI_BOTS.map((bot) => ({
    bot: bot.userAgent,
    engine: bot.engine,
    allowed: robotsTxtFound ? isBotAllowed(robotsBlocks, bot.userAgent) : true,
  }));
  const blockedBots = aiBotAccess.filter((b) => !b.allowed);
  if (blockedBots.length > 0) {
    pushIssue(issues, {
      category: "ai-crawlability",
      severity: "critical",
      title: `${blockedBots.length} AI crawler(s) blocked in robots.txt`,
      detail: blockedBots.map((b) => `${b.bot} (${b.engine})`).join(", "),
      recommendation: "If you want this content to be eligible for citation in ChatGPT, Claude, Perplexity, or Google AI Overviews, remove the Disallow rule for these user-agents. If the block is intentional (e.g. protecting content from AI training), that's a valid choice — just make sure it's deliberate, not a default from your CMS/CDN.",
    });
  } else {
    pushIssue(issues, {
      category: "ai-crawlability",
      severity: "pass",
      title: "No AI crawlers blocked",
      detail: "GPTBot, ClaudeBot, PerplexityBot, Google-Extended and others can all reach this URL.",
      recommendation: "",
    });
  }

  // ---- 8. Score calculation ----
  const score = computeScore(issues, ["meta", "headings", "schema", "crawlability", "content", "performance"]);
  const aiCrawlScore = computeAiCrawlScore(aiBotAccess, hasSchema, hasFaqSchema);

  return {
    url,
    score,
    aiCrawlScore,
    issues,
    fixes,
    fetchedAt: new Date().toISOString(),
    meta: {
      title,
      description,
      h1Count,
      wordCount,
      hasSchema,
      schemaTypes: Array.from(schemaTypes),
      canonical,
      robotsTxtFound,
      sitemapFound,
      aiBotAccess,
      htmlLang,
      hreflangs,
    },
  };
}

function severityWeight(s: IssueSeverity) {
  switch (s) {
    case "critical": return -20;
    case "warning": return -8;
    case "info": return -2;
    case "pass": return 4;
  }
}

function computeScore(issues: SeoIssueResult[], categories: IssueCategory[]) {
  const relevant = issues.filter((i) => categories.includes(i.category));
  let score = 70; // baseline
  for (const issue of relevant) score += severityWeight(issue.severity);
  return Math.max(0, Math.min(100, Math.round(score)));
}

function computeAiCrawlScore(aiBotAccess: AiBotAccess[], hasSchema: boolean, hasFaqSchema: boolean) {
  const allowedRatio = aiBotAccess.filter((b) => b.allowed).length / aiBotAccess.length;
  let score = allowedRatio * 70;
  if (hasSchema) score += 15;
  if (hasFaqSchema) score += 15;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function buildEmptyResult(url: string, issues: SeoIssueResult[]): SeoAuditResult {
  return {
    url,
    score: 0,
    aiCrawlScore: 0,
    issues,
    fixes: [],
    fetchedAt: new Date().toISOString(),
    meta: {
      title: null,
      description: null,
      h1Count: 0,
      wordCount: 0,
      hasSchema: false,
      schemaTypes: [],
      canonical: null,
      robotsTxtFound: false,
      sitemapFound: false,
      aiBotAccess: AI_BOTS.map((b) => ({ bot: b.userAgent, engine: b.engine, allowed: true })),
      htmlLang: null,
      hreflangs: [],
    },
  };
}
