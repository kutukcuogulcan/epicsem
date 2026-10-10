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

/** Kart: Overview/Domain/URL metrics spec §8 — "Biz, Rakip, Kurumsal, Editoryal, Kamu/Kurum,
 * UGC, Referans, Diğer" (8 categories). English keys here map to the Turkish labels shown in
 * the UI (see DOMAIN_TYPE_LABEL in app/geo/page.tsx). */
export type SourceDomainType = "You" | "Competitor" | "Corporate" | "Editorial" | "Government" | "Reference" | "UGC" | "Other";

export interface SourceDomainStat {
  domain: string;
  /** Total in-text citations of this domain across all runs — Kart §4 "Total citations". */
  count: number;
  type: SourceDomainType;
  /** This domain's citations ÷ total citations across every domain shown — Kart §4 "Citation
   * share" (0-1 ratio; ×100 for display). */
  citationShare: number;
  /** This domain's total citations ÷ number of distinct chats it was cited in — Kart §4
   * "Citation rate" (an average, NOT a percentage — can exceed 1.0, never ×100 for display). */
  citationRate: number;
  /** Number of distinct chats (runs) that cite this domain at least once. */
  chatsCited: number;
}

/** Kart §8 — "Ana sayfa, Kategori, Ürün, Listicle, Karşılaştırma, Profil, Alternatif, Tartışma,
 * Nasıl yapılır, Makale, Diğer" (11 categories). English keys map to Turkish labels in the UI. */
export type UrlType =
  | "Home"
  | "Category"
  | "Product"
  | "Listicle"
  | "Comparison"
  | "Profile"
  | "Alternative"
  | "Discussion"
  | "HowTo"
  | "Article"
  | "Other";

/** Per-URL citation breakdown — Kart §5 "URL metrikleri". "Retrievals" (how many chats used this
 * URL as a source, independent of whether it was cited) needs the not-yet-built browser-based
 * retrieval signal and is deliberately not included here — see computeUrlStats in lib/geo-engine.ts. */
export interface UrlStat {
  url: string;
  domain: string;
  type: UrlType;
  totalCitations: number;
  /** 0-1 ratio; ×100 for display. */
  citationShare: number;
  /** An average, NOT a percentage — never ×100, never shown with "%". */
  citationRate: number;
  chatsCited: number;
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
  /** Epicsem'in kendi tarayıcısından gelen ayrıntılı ölçümler (CSV içe aktarmada yok). */
  metrics?: BulkPageMetrics;
}

export interface BulkPageMetrics {
  responseMs: number | null;
  htmlKb: number | null;
  imagesTotal: number;
  imagesMissingAlt: number;
  internalOut: number;
  externalOut: number;
  /** Bu sayfaya taranan diğer sayfalardan gelen iç link sayısı. */
  inlinks: number;
  /** Ana sayfadan kaç tıkla ulaşıldığı (bulunamadıysa null). */
  depth: number | null;
  h2Count: number;
  schemaTypes: string[];
  hasViewport: boolean;
  lang: string | null;
  hasOpenGraph: boolean;
  redirectTarget: string | null;
  /** Yönlendirmenin hedefi de yönlendiriyor. */
  redirectChain: boolean;
  /** Bu sayfadaki, kırık (4xx/5xx) bir sayfaya giden iç linkler. */
  brokenOutlinks: string[];
  inSitemap: boolean;
  /** Sitemap'te var ama taranan hiçbir sayfadan link almıyor. */
  orphan: boolean;
  /** HTTPS sayfada http:// kaynak (görsel/script/css). */
  mixedContent: number;
  /** Sayfadaki linkler (en fazla 150): hedef, link metni, nofollow, dış link mi. */
  outLinks?: { to: string; anchor: string; nofollow: boolean; external: boolean }[];
  /** Sayfadaki görseller (en fazla 60). */
  images?: { src: string; alt: string | null; hasSize: boolean }[];
  /** hreflang alternatifleri. */
  hreflang?: { lang: string; href: string }[];
  /** Yönlendirme zinciri adımları: [{url, status}] — ilk adım bu sayfa. */
  redirectHops?: { url: string; status: number }[];
  /** Sayfada kaç link olduğu (iç + dış, tekrarlar dahil). */
  totalLinks?: number;
}

/** Tarama genelinde toplanan varlıklar — Linkler/Görseller/Yönlendirmeler sekmeleri için. */
export interface BulkCrawlAssets {
  /** Kontrol edilen dış link → HTTP durum kodu (0 = ulaşılamadı). */
  externalLinks: Record<string, number>;
  /** Kontrol edilen görsel → durum ve boyut. */
  images: Record<string, { status: number; kb: number | null }>;
  /** Neredeyse aynı içerikli sayfa grupları. */
  duplicateGroups: string[][];
  /** Site düzeyi güvenlik kontrolleri. */
  site: { https: boolean; hsts: boolean; httpRedirectsToHttps: boolean | null };
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
  /** Her sorun kodunun kaç sayfada görüldüğü (yeni taramalarda; tüm kodları kapsar). */
  issueCounts?: Record<string, number>;
  avgResponseMs?: number | null;
  avgHtmlKb?: number | null;
  /** Hata içermeyen taranmış URL yüzdesi (Ahrefs Health Score mantığı). */
  healthScore?: number | null;
  /** Sorun örneği sayıları (sorun × URL), önem derecesine göre. */
  severity?: { error: number; warning: number; notice: number };
  statusDist?: Record<string, number>;
  depthDist?: Record<string, number>;
  pagesWithErrors?: number;
  pagesWithIssuesOnly?: number;
  /** Tema puanları (0-100): crawl, links, content, perf, tech, ai. */
  themes?: Record<string, number>;
}

export interface BulkImportResult {
  filename: string;
  importedAt: string;
  columns: string[];
  summary: BulkImportSummary;
  rows: BulkImportRow[];
  duplicateTitleGroups: { value: string; urls: string[] }[];
  duplicateMetaGroups: { value: string; urls: string[] }[];
  /** Epicsem tarayıcısının topladığı linkler/görseller/kopya içerik/site güvenliği (yeni taramalarda). */
  assets?: BulkCrawlAssets;
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

/** One structural weakness the AI Citability score is docked for — e.g. "no
 * comparison table", "no direct-answer opening sentence" — always tied to what's
 * actually (not) present in the real page, never a generic filler complaint. */
export interface CitabilityWeakness {
  issue: string;
  why: string;
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
  /** 0-100 — how easily an AI answer engine (ChatGPT/Perplexity/Gemini/AI Overviews)
   * could lift a direct-answer snippet from this page as-is, based only on real
   * structural signals (definition sentences, scannable headings, tables/lists,
   * concrete numbers already on the page) — never a subjective "quality" score. */
  citabilityScore: number;
  citabilityWeaknesses: CitabilityWeakness[];
  /** The page's OWN real content (bodyText/bodyHtmlExcerpt), restructured for AI
   * parsing — answer-first sentences, clear H2/H3, tables/bullets where the source
   * material supports one. Never adds a fact that wasn't already on the page; a
   * gap the model can't fill from real content is left as an explicit
   * [NEEDS: ...] placeholder, same convention as lib/content-generator.ts. */
  geoRewrite: string;
  /** What KIND of authoritative data point would help citability (e.g. "a stat on
   * X here", "the year this claim was last updated") — suggestions of what to add,
   * never a fabricated number/source presented as real. */
  citationSuggestions: string[];
  demoMode: boolean;
  model: string;
}
