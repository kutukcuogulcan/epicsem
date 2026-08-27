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

export type EngineId = "openai" | "anthropic" | "google" | "perplexity";

export interface GeoRunResult {
  engine: EngineId;
  model: string;
  promptText: string;
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
