export type IssueSeverity = "critical" | "warning" | "info" | "pass";

export type IssueCategory =
  | "meta"
  | "headings"
  | "schema"
  | "crawlability"
  | "ai-crawlability"
  | "performance"
  | "content"
  | "localization";

export interface SeoIssueResult {
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  detail: string;
  recommendation: string;
}

export interface SeoAuditResult {
  url: string;
  score: number;
  aiCrawlScore: number;
  issues: SeoIssueResult[];
  fixes: GeneratedFix[];
  fetchedAt: string;
  meta: {
    title: string | null;
    description: string | null;
    h1Count: number;
    wordCount: number;
    hasSchema: boolean;
    schemaTypes: string[];
    canonical: string | null;
    robotsTxtFound: boolean;
    sitemapFound: boolean;
    aiBotAccess: AiBotAccess[];
    htmlLang: string | null;
    hreflangs: string[];
  };
}

export type FixKind = "meta-description" | "organization-schema" | "faq-schema";

export interface GeneratedFix {
  kind: FixKind;
  label: string;
  note: string;
  code: string;
}

export interface GeneratedFaqItem {
  question: string;
  answer: string;
}

export interface AiBotAccess {
  bot: string;
  engine: "OpenAI" | "Anthropic" | "Perplexity" | "Google" | "Meta" | "Common Crawl";
  allowed: boolean;
}

export type EngineId =
  | "openai"
  | "anthropic"
  | "google"
  | "perplexity"
  | "deepseek"
  | "xai"
  | "meta"
  | "microsoft";

export interface GeoRunResult {
  engine: EngineId;
  model: string;
  promptText: string;
  /** User-assigned category for this prompt (e.g. "Fiyat", "Karşılaştırma") — "Genel" when none was given. Powers the per-topic visibility breakdown. */
  topic: string;
  /** Whether the prompt text itself names the brand (vs. a discovery-style prompt someone who's never heard of the brand would ask). */
  branded: boolean;
  mentioned: boolean;
  position: number | null;
  sentiment: number | null;
  responseText: string;
  citations: { url: string; domain: string; isOwnDomain: boolean }[];
}

export interface GeoVisibilitySummary {
  brand: string;
  domain: string;
  visibility: number; // 0-1
  shareOfVoice: number; // 0-1
  avgPosition: number | null;
  avgSentiment: number | null;
  citationCount: number;
  rank?: number;
}

/** Own-brand visibility broken down by prompt topic — the per-category gap view (mirrors Peec AI's per-topic opportunity rollups). */
export interface TopicVisibility {
  topic: string;
  visibility: number; // 0-1
  mentionedCount: number;
  totalCount: number;
}

export type SourceDomainType = "You" | "Competitor" | "Reference" | "UGC" | "Other";

export interface SourceDomainStat {
  domain: string;
  count: number;
  type: SourceDomainType;
}

export type GapVerdict = "blocked" | "invisible" | "cited" | "needs-work";

export interface GapRow {
  url: string;
  seoScore: number;
  aiCrawlScore: number;
  blockedBots: number;
  citedExact: number;
  citedDomain: number;
  verdict: GapVerdict;
}

/** One row from an imported Screaming Frog CSV, after mapping + issue detection. */
export interface BulkImportRow {
  url: string;
  statusCode: number | null;
  indexable: boolean | null;
  title: string | null;
  titleLength: number | null;
  metaDescription: string | null;
  metaDescriptionLength: number | null;
  h1: string | null;
  h1Count: number;
  wordCount: number | null;
  canonical: string | null;
  metaRobots: string | null;
  /** Issue codes, e.g. "missing-title", "thin-content", "duplicate-title", "broken". */
  issues: string[];
}

export interface BulkImportSummary {
  totalRows: number;
  missingTitle: number;
  duplicateTitles: number;
  titleTooLong: number;
  missingMetaDescription: number;
  duplicateMetaDescriptions: number;
  metaDescriptionTooLong: number;
  missingH1: number;
  multipleH1: number;
  thinContent: number;
  brokenLinks: number;
  redirects: number;
  nonIndexable: number;
  noindexTag: number;
}

export interface BulkImportResult {
  filename: string;
  importedAt: string;
  columns: string[];
  summary: BulkImportSummary;
  rows: BulkImportRow[];
  duplicateTitleGroups: { value: string; urls: string[] }[];
  duplicateMetaGroups: { value: string; urls: string[] }[];
}

/**
 * AI content generation + draft-first CMS publishing — Arvow's core feature, deliberately
 * built to avoid the two weaknesses documented against it: content is always grounded in a
 * real ContentBrief (real audit/gap data, "no invented facts" — see lib/content-generator.ts),
 * and publishing always lands as a WordPress DRAFT, never auto-published (see lib/wordpress.ts).
 */
export interface GeneratedArticle {
  title: string;
  metaDescription: string;
  bodyMarkdown: string;
  /** Facts the model couldn't ground and left as [NEEDS: ...] placeholders instead of inventing. */
  openPlaceholders: string[];
  demoMode: boolean;
  model: string;
}

export type ContentDraftStatus = "draft" | "published-to-wp";

export interface ContentDraft {
  id: number;
  sourceUrl: string;
  article: GeneratedArticle;
  status: ContentDraftStatus;
  publishedPostUrl: string | null;
  publishedEditUrl: string | null;
  createdAt: string;
}

/** WordPress uses Application Passwords; Shopify uses a Custom App Admin API access token. */
export type CmsPlatform = "wordpress" | "shopify";

/** Safe-to-return-to-the-client view of a saved CMS connection — the secret is masked. */
export interface CmsConnection {
  id: number;
  platform: CmsPlatform;
  label: string;
  siteUrl: string;
  authIdentifier: string;
  authSecretMasked: string;
  createdAt: string;
}

/**
 * Article Writer — an LLM-driven deep on-page content audit, one level more detailed
 * than the deterministic /audit tool: it grades the actual copy quality of title/meta/
 * alt-text/links against character-count and content rules (not just presence/absence),
 * and closes the loop with concrete article ideas grounded in what the audit found.
 * The page's real HTML is fetched and extracted first (see lib/article-audit.ts) —
 * the model only ever analyzes real, fetched content, it never guesses at a page it
 * hasn't seen.
 */
export interface ArticleFieldSuggestion {
  current: string;
  suggested: string;
  why: string;
}

export interface ArticleImageAlt {
  src: string;
  currentAlt: string;
  suggestedAlt: string;
  why: string;
}

export interface ArticleLinkIssue {
  anchorText: string;
  targetUrl: string;
  issue: string;
  suggestedAnchor: string;
}

export interface ArticleMissingLink {
  suggestedAnchor: string;
  context: string;
  suggestedTargetUrlPattern: string;
  why: string;
}

export type ArticleSchemaStatus = "present-valid" | "present-mismatch" | "missing" | "not-applicable";

export interface ArticleSchemaResult {
  status: ArticleSchemaStatus;
  note: string;
  jsonLd: string | null;
}

export interface ArticleRecommendation {
  title: string;
  targetKeyword: string;
  angle: string;
  outline: string[];
}

export interface ArticleAuditResult {
  url: string;
  fetchedAt: string;
  pageType: string;
  searchIntent: string;
  targetKeyword: string;
  title: ArticleFieldSuggestion & { currentLength: number; suggestedLength: number };
  metaDescription: ArticleFieldSuggestion;
  canonical: { current: string | null; suggested: string; why: string };
  imageAlts: ArticleImageAlt[];
  imagesTotal: number;
  imagesSkipped: number;
  linkIssues: ArticleLinkIssue[];
  missingLinks: ArticleMissingLink[];
  faqSchema: ArticleSchemaResult;
  articleSchema: ArticleSchemaResult;
  articleRecommendations: ArticleRecommendation[];
  priorityActions: string[];
  demoMode: boolean;
  model: string;
}
