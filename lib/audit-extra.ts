import type { CheerioAPI } from "cheerio";
import type { SeoIssueResult } from "@/types";
import { safeFetch } from "@/lib/safe-fetch";

/**
 * Site Denetimi ek kontrolleri — tamamı kural tabanlı, yapay zekâ kullanmaz:
 * şema alan doğrulaması, görseller, linkler (kırık iç link örneklemi), sitemap içeriği,
 * llms.txt ve E-E-A-T sinyalleri (yazar, tarih, kaynak).
 */

const UA = "Mozilla/5.0 (compatible; GeoSeoAuditBot/0.1; +https://example.com/bot)";

async function fetchT(url: string, ms: number, init?: RequestInit) {
  return safeFetch(url, { redirect: "manual", ...init, signal: AbortSignal.timeout(ms), headers: { "User-Agent": UA, ...(init?.headers ?? {}) } });
}

/** URL'nin durum kodunu döndürür (HEAD, desteklenmezse GET). Ağ hatasında 0. */
export async function statusOf(url: string, ms = 7000): Promise<number> {
  try {
    let r = await fetchT(url, ms, { method: "HEAD" });
    if (r.status === 405 || r.status === 501 || r.status === 403) r = await fetchT(url, ms, { method: "GET" });
    return r.status;
  } catch {
    return 0;
  }
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    })
  );
  return out;
}

const short = (u: string, origin: string) => (u.startsWith(origin) ? u.slice(origin.length) || "/" : u);
const list = (xs: string[], max = 6) => xs.slice(0, max).join(", ") + (xs.length > max ? ` (+${xs.length - max} more)` : "");

/* ------------------------------------------------------------------ */
/* Şema alan doğrulaması                                               */
/* ------------------------------------------------------------------ */

type Json = Record<string, unknown>;
const has = (o: Json, k: string) => {
  const v = o[k];
  return v !== undefined && v !== null && !(typeof v === "string" && !v.trim()) && !(Array.isArray(v) && v.length === 0);
};

/** Google'ın zengin sonuç / AI motorlarının güvenle okuyacağı asgari alanlar. */
const REQUIRED: { match: RegExp; label: string; need: (string | string[])[] }[] = [
  { match: /^(Article|BlogPosting|NewsArticle|TechArticle)$/, label: "Article", need: ["headline", "datePublished", "author", "image"] },
  { match: /^Product$/, label: "Product", need: ["name", ["offers", "review", "aggregateRating"], "image"] },
  { match: /^(Organization|Corporation)$/, label: "Organization", need: ["name", "url", "logo"] },
  { match: /(LocalBusiness|Store|Restaurant|Dentist|Hotel|AutoDealer|BeautySalon|NailSalon)$/, label: "LocalBusiness", need: ["name", "address", "telephone"] },
  { match: /^WebSite$/, label: "WebSite", need: ["name", "url"] },
  { match: /^BreadcrumbList$/, label: "BreadcrumbList", need: ["itemListElement"] },
  { match: /^FAQPage$/, label: "FAQPage", need: ["mainEntity"] },
  { match: /^HowTo$/, label: "HowTo", need: ["name", "step"] },
  { match: /^Event$/, label: "Event", need: ["name", "startDate", "location"] },
  { match: /^(Recipe)$/, label: "Recipe", need: ["name", "recipeIngredient", "recipeInstructions"] },
];

export function validateSchema($: CheerioAPI): { issues: SeoIssueResult[]; nodes: Json[] } {
  const issues: SeoIssueResult[] = [];
  const nodes: Json[] = [];
  let broken = 0;
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    try {
      const json = JSON.parse(raw);
      const items = Array.isArray(json) ? json : [json];
      for (const it of items) {
        if (!it || typeof it !== "object") continue;
        const graph = Array.isArray((it as Json)["@graph"]) ? ((it as Json)["@graph"] as Json[]) : [it as Json];
        for (const g of graph) if (g && typeof g === "object") nodes.push(g);
      }
    } catch {
      broken++;
    }
  });
  if (broken)
    issues.push({
      category: "schema",
      severity: "warning",
      title: `${broken} JSON-LD block(s) could not be parsed`,
      detail: "The JSON inside <script type=\"application/ld+json\"> is invalid (trailing comma, unescaped quote, HTML inside, etc.). Search engines and AI crawlers ignore the whole block.",
      recommendation: "Validate the block at validator.schema.org or search.google.com/test/rich-results and fix the syntax error.",
    });

  const problems: string[] = [];
  const ok: string[] = [];
  for (const n of nodes) {
    const types = (Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]]).map(String);
    for (const t of types) {
      const rule = REQUIRED.find((r) => r.match.test(t));
      if (!rule) continue;
      const missing = rule.need.filter((k) => (Array.isArray(k) ? !k.some((x) => has(n, x)) : !has(n, k))).map((k) => (Array.isArray(k) ? k.join(" / ") : k));
      if (rule.label === "FAQPage" && has(n, "mainEntity")) {
        const qs = (Array.isArray(n.mainEntity) ? n.mainEntity : [n.mainEntity]) as Json[];
        const bad = qs.filter((q) => !q || !has(q, "name") || !q.acceptedAnswer || !has(q.acceptedAnswer as Json, "text")).length;
        if (bad) missing.push(`${bad} question(s) without name/acceptedAnswer.text`);
      }
      if (rule.label === "Article" && has(n, "author")) {
        const a = (Array.isArray(n.author) ? n.author[0] : n.author) as Json | string;
        if (typeof a === "object" && a && !has(a, "name")) missing.push("author.name");
      }
      if (missing.length) problems.push(`${t}: missing ${missing.join(", ")}`);
      else ok.push(t);
    }
  }
  if (problems.length)
    issues.push({
      category: "schema",
      severity: "warning",
      title: `Structured data is incomplete (${problems.length})`,
      detail: problems.slice(0, 6).join(" · "),
      recommendation: "Fill in the missing properties. Incomplete schema is not eligible for rich results, and AI engines can't extract the facts (price, author, date, address) they'd otherwise quote.",
    });
  else if (ok.length)
    issues.push({ category: "schema", severity: "pass", title: "Structured data has the key properties", detail: Array.from(new Set(ok)).join(", "), recommendation: "" });
  return { issues, nodes };
}

/* ------------------------------------------------------------------ */
/* Görseller                                                           */
/* ------------------------------------------------------------------ */

export function auditImages($: CheerioAPI, origin: string): { issues: SeoIssueResult[]; stats: { total: number; noAlt: number; noSize: number; lazy: number } } {
  const issues: SeoIssueResult[] = [];
  const imgs = $("img").toArray();
  const total = imgs.length;
  const noAltSrc: string[] = [];
  let noSize = 0;
  let lazy = 0;
  imgs.forEach((el, i) => {
    const $el = $(el);
    const src = $el.attr("src") || $el.attr("data-src") || "";
    if ($el.attr("alt") === undefined) noAltSrc.push(short(src, origin).split("?")[0].slice(-60) || "(inline)");
    if (!$el.attr("width") || !$el.attr("height")) noSize++;
    if (($el.attr("loading") ?? "").toLowerCase() === "lazy" || $el.attr("data-src")) lazy++;
    void i;
  });
  if (!total) return { issues, stats: { total, noAlt: 0, noSize: 0, lazy: 0 } };
  if (noAltSrc.length)
    issues.push({
      category: "images",
      severity: noAltSrc.length / total > 0.3 ? "warning" : "info",
      title: `${noAltSrc.length} of ${total} images have no alt attribute`,
      detail: list(noAltSrc),
      recommendation: "Add a short descriptive alt text to content images (use alt=\"\" for purely decorative ones). Alt text is how search and AI engines understand images, and it's required for accessibility.",
    });
  else issues.push({ category: "images", severity: "pass", title: "All images have alt attributes", detail: `${total} images checked`, recommendation: "" });
  if (noSize / total > 0.5 && total >= 3)
    issues.push({
      category: "images",
      severity: "info",
      title: `${noSize} images without width/height`,
      detail: "Images without explicit dimensions shift the layout while loading.",
      recommendation: "Set width and height (or aspect-ratio in CSS) on images to prevent layout shift (CLS), a Core Web Vitals metric.",
    });
  if (total > 6 && lazy === 0)
    issues.push({
      category: "images",
      severity: "info",
      title: "No lazy-loaded images",
      detail: `${total} images, none with loading="lazy".`,
      recommendation: "Add loading=\"lazy\" to images below the fold so the main content loads faster (keep the hero image eager).",
    });
  return { issues, stats: { total, noAlt: noAltSrc.length, noSize, lazy } };
}

/* ------------------------------------------------------------------ */
/* Linkler — iç/dış sayım ve kırık iç link örneklemi                   */
/* ------------------------------------------------------------------ */

export async function auditLinks($: CheerioAPI, pageUrl: string): Promise<{ issues: SeoIssueResult[]; stats: { internal: number; external: number; checked: number; broken: string[]; redirects: number; outboundCitations: number } }> {
  const issues: SeoIssueResult[] = [];
  const base = new URL(pageUrl);
  const host = base.hostname.replace(/^www\./i, "");
  const internal = new Set<string>();
  const external = new Set<string>();
  let emptyAnchors = 0;
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") ?? "").trim();
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript|whatsapp|sms):/i.test(href)) return;
    let u: URL;
    try {
      u = new URL(href, base);
    } catch {
      return;
    }
    if (!/^https?:$/.test(u.protocol)) return;
    u.hash = "";
    const txt = $(el).text().trim() || $(el).attr("aria-label") || $(el).find("img").attr("alt") || "";
    if (!txt) emptyAnchors++;
    if (u.hostname.replace(/^www\./i, "") === host) internal.add(u.toString());
    else external.add(u.toString());
  });
  // İçerik alanındaki dış linkler (kaynak gösterme) — nav/footer hariç
  const outboundCitations = $("main a[href^='http'], article a[href^='http'], .content a[href^='http'], .post a[href^='http']")
    .toArray()
    .filter((el) => {
      try {
        return new URL($(el).attr("href")!).hostname.replace(/^www\./i, "") !== host;
      } catch {
        return false;
      }
    }).length;

  const sample = Array.from(internal).filter((u) => u !== base.toString()).slice(0, 25);
  const codes = await pool(sample, 6, (u) => statusOf(u, 6000));
  const broken = sample.filter((_, i) => codes[i] >= 400);
  const redirects = codes.filter((c) => c >= 300 && c < 400).length;

  if (internal.size === 0)
    issues.push({
      category: "links",
      severity: "warning",
      title: "No internal links on the page",
      detail: "The page doesn't link to any other page on the same site.",
      recommendation: "Link to related pages with descriptive anchor text. Internal links help crawlers discover pages and pass authority; AI engines also follow them to build context.",
    });
  if (broken.length)
    issues.push({
      category: "links",
      severity: "warning",
      title: `${broken.length} broken internal link(s)`,
      detail: list(broken.map((u) => short(u, base.origin))),
      recommendation: "Fix or remove links that return 4xx/5xx. Broken links waste crawl budget and send users (and AI crawlers) to dead ends.",
    });
  else if (sample.length)
    issues.push({ category: "links", severity: "pass", title: "No broken internal links found", detail: `${sample.length} of ${internal.size} internal links checked`, recommendation: "" });
  if (redirects >= 3)
    issues.push({
      category: "links",
      severity: "info",
      title: `${redirects} internal links point to redirects`,
      detail: "Some internal links go through a 3xx redirect before reaching the final page.",
      recommendation: "Update these links to point directly at the final URL to save a hop for users and crawlers.",
    });
  if (emptyAnchors >= 3)
    issues.push({
      category: "links",
      severity: "info",
      title: `${emptyAnchors} links have no anchor text`,
      detail: "Links with no visible text, aria-label or image alt.",
      recommendation: "Give every link a descriptive text or aria-label so crawlers and screen readers know where it goes.",
    });
  return { issues, stats: { internal: internal.size, external: external.size, checked: sample.length, broken, redirects, outboundCitations } };
}

/* ------------------------------------------------------------------ */
/* Sitemap içeriği                                                     */
/* ------------------------------------------------------------------ */

export async function auditSitemap(origin: string, robotsText: string | null): Promise<{ issues: SeoIssueResult[]; found: boolean; stats: { url: string | null; urls: number; checked: number; broken: string[]; redirects: string[]; inRobots: boolean } }> {
  const issues: SeoIssueResult[] = [];
  const fromRobots = (robotsText ?? "")
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*sitemap:\s*(\S+)/i)?.[1])
    .filter(Boolean) as string[];
  const candidates = Array.from(new Set([...fromRobots, `${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`]));
  let smUrl: string | null = null;
  let xml = "";
  for (const c of candidates.slice(0, 4)) {
    try {
      const r = await safeFetch(c, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": UA } });
      if (r.ok) {
        const t = await r.text();
        if (/<(urlset|sitemapindex)/i.test(t)) {
          smUrl = c;
          xml = t;
          break;
        }
      }
    } catch {
      /* sonraki aday */
    }
  }
  const stats = { url: smUrl, urls: 0, checked: 0, broken: [] as string[], redirects: [] as string[], inRobots: fromRobots.length > 0 };
  if (!smUrl) {
    issues.push({
      category: "crawlability",
      severity: "warning",
      title: "No sitemap.xml found",
      detail: `Checked ${candidates.slice(0, 3).map((c) => short(c, origin)).join(", ")}.`,
      recommendation: "Publish an XML sitemap and reference it in robots.txt (Sitemap: https://…/sitemap.xml) to help both search and AI crawlers discover all indexable pages.",
    });
    return { issues, found: false, stats };
  }
  const locs = (x: string) => Array.from(x.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)/gi)).map((m) => m[1].trim());
  let urls: string[] = [];
  if (/<sitemapindex/i.test(xml)) {
    const ch = new URL(origin).hostname.replace(/^www\./i, "");
    const children = locs(xml)
      .filter((c) => {
        try {
          return new URL(c).hostname.replace(/^www\./i, "") === ch;
        } catch {
          return false;
        }
      })
      .slice(0, 3);
    for (const c of children) {
      try {
        const r = await safeFetch(c, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": UA } });
        if (r.ok) urls.push(...locs(await r.text()));
      } catch {
        /* geç */
      }
      if (urls.length > 2000) break;
    }
  } else urls = locs(xml);
  stats.urls = urls.length;
  // Yalnızca aynı sitenin URL'leri kontrol edilir (başka sunuculara istek atılmaz).
  const host = new URL(origin).hostname.replace(/^www\./i, "");
  urls = urls.filter((u) => {
    try {
      return new URL(u).hostname.replace(/^www\./i, "") === host;
    } catch {
      return false;
    }
  });

  const sample = urls.length <= 15 ? urls : Array.from({ length: 15 }, (_, i) => urls[Math.floor((i * urls.length) / 15)]);
  const codes = await pool(sample, 6, (u) => statusOf(u, 6000));
  stats.checked = sample.length;
  stats.broken = sample.filter((_, i) => codes[i] >= 400);
  stats.redirects = sample.filter((_, i) => codes[i] >= 300 && codes[i] < 400);

  if (!urls.length)
    issues.push({ category: "crawlability", severity: "warning", title: "Sitemap is empty", detail: short(smUrl, origin), recommendation: "Make sure the sitemap lists every indexable page." });
  else if (stats.broken.length || stats.redirects.length)
    issues.push({
      category: "crawlability",
      severity: stats.broken.length ? "warning" : "info",
      title: stats.broken.length ? `Sitemap contains broken URLs (${stats.broken.length} of ${sample.length} sampled)` : `Sitemap contains redirecting URLs (${stats.redirects.length} of ${sample.length} sampled)`,
      detail: list([...stats.broken, ...stats.redirects].map((u) => short(u, origin))),
      recommendation: "A sitemap should only list final, 200-OK, indexable URLs. Remove deleted pages and replace redirected URLs with their destination.",
    });
  else
    issues.push({ category: "crawlability", severity: "pass", title: "sitemap.xml found and healthy", detail: `${short(smUrl, origin)} · ${urls.length.toLocaleString("en-US")} URLs · ${sample.length} sampled, all OK`, recommendation: "" });
  if (!stats.inRobots)
    issues.push({
      category: "crawlability",
      severity: "info",
      title: "Sitemap not referenced in robots.txt",
      detail: "robots.txt has no Sitemap: line.",
      recommendation: `Add "Sitemap: ${smUrl}" to robots.txt so every crawler (including AI crawlers that don't use Search Console) can find it.`,
    });
  return { issues, found: true, stats };
}

/* ------------------------------------------------------------------ */
/* llms.txt                                                            */
/* ------------------------------------------------------------------ */

export async function auditLlmsTxt(origin: string): Promise<{ issues: SeoIssueResult[]; found: boolean }> {
  try {
    const r = await safeFetch(`${origin}/llms.txt`, { signal: AbortSignal.timeout(7000), headers: { "User-Agent": UA } });
    const t = r.ok ? await r.text() : "";
    const found = r.ok && t.trim().length > 20 && !/<html/i.test(t.slice(0, 500));
    return {
      found,
      issues: [
        found
          ? { category: "ai-crawlability", severity: "pass", title: "llms.txt found", detail: `${origin}/llms.txt · ${t.split(/\r?\n/).length} lines`, recommendation: "" }
          : {
              category: "ai-crawlability",
              severity: "info",
              title: "No llms.txt file",
              detail: `${origin}/llms.txt was not found.`,
              recommendation: "Add an llms.txt: a short Markdown summary of the brand plus links to the most important pages. It's an emerging convention that gives LLMs a clean map of the site.",
            },
      ],
    };
  } catch {
    return { found: false, issues: [] };
  }
}

/* ------------------------------------------------------------------ */
/* E-E-A-T sinyalleri                                                  */
/* ------------------------------------------------------------------ */

export function auditEeat($: CheerioAPI, nodes: Json[], wordCount: number, outboundCitations: number): { issues: SeoIssueResult[]; signals: { author: boolean; date: boolean; citations: number; about: boolean } } {
  const issues: SeoIssueResult[] = [];
  const schemaAuthor = nodes.some((n) => has(n, "author"));
  const schemaDate = nodes.some((n) => has(n, "datePublished") || has(n, "dateModified"));
  const author =
    schemaAuthor ||
    !!$('meta[name="author"]').attr("content")?.trim() ||
    $('[rel="author"], [itemprop="author"], .author, .byline, .post-author, [class*="author-name"]').length > 0;
  const date =
    schemaDate ||
    !!$('meta[property="article:published_time"], meta[property="article:modified_time"], meta[itemprop="datePublished"]').attr("content") ||
    $("time[datetime]").length > 0;
  const about = $("a[href]")
    .toArray()
    .some((el) => /\/(hakkimizda|hakkinda|about|kurumsal|iletisim|contact)/i.test($(el).attr("href") ?? ""));
  const isArticle = nodes.some((n) => /Article|BlogPosting/.test(String(n["@type"]))) || $("article").length > 0 || wordCount >= 600;

  if (isArticle) {
    if (!author)
      issues.push({
        category: "content",
        severity: "warning",
        title: "No author shown",
        detail: "No author byline, meta author or schema author found on this article-like page.",
        recommendation: "Show a real author with a short bio and link to an author page, and add author to the Article schema. Experience and expertise signals (E-E-A-T) affect both Google rankings and whether AI engines trust the page as a source.",
      });
    if (!date)
      issues.push({
        category: "content",
        severity: "info",
        title: "No published/updated date",
        detail: "No <time datetime>, article:published_time or schema datePublished found.",
        recommendation: "Show a visible publish and last-updated date and add datePublished/dateModified to the schema. AI engines prefer recent sources for time-sensitive questions.",
      });
    if (outboundCitations === 0 && wordCount >= 500)
      issues.push({
        category: "content",
        severity: "info",
        title: "No sources cited in the content",
        detail: "The main content area has no links to external sources.",
        recommendation: "Cite 2–3 authoritative sources (studies, official data) for key claims. Pages with cited statistics are quoted noticeably more often in AI answers.",
      });
    if (author && date)
      issues.push({ category: "content", severity: "pass", title: "Author and date present", detail: `Author ✓ · Date ✓${outboundCitations ? ` · ${outboundCitations} source link(s)` : ""}`, recommendation: "" });
  }
  if (!about)
    issues.push({
      category: "content",
      severity: "info",
      title: "No About/Contact link found",
      detail: "The page doesn't link to an About or Contact page.",
      recommendation: "Link to About and Contact pages (usually in the footer). Clear ownership and contact info is a basic trust signal for search and AI engines.",
    });
  return { issues, signals: { author, date, citations: outboundCitations, about } };
}
