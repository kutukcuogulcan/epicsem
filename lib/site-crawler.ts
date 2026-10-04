import * as cheerio from "cheerio";
import { normalizeUrl } from "@/lib/content-fetch";
import { domainFromUrl } from "@/lib/brand-discovery";

/**
 * Kart: Hızlı ve kapsamlı tarama.
 *
 * lib/content-fetch.ts'in fetchPageSummary'si (ve onun üzerine kurulu lib/brand-discovery.ts's
 * runCrawlStep'i) TEK bir sayfayı okuyordu — marka profilinin kalitesi doğrudan "sitenin ne
 * kadar doğru okunduğuna" bağlı olduğu için bu yetersizdi: bir ana sayfa genelde ürün/hizmet
 * detayını ya da "hakkımızda" metnini içermez. Bu modül onun yerine GERÇEK, eş zamanlı çok
 * sayfalı bir tarama yapar:
 *
 *   Dalga 1 (aynı anda): ana sayfa + robots.txt + sitemap.xml + llms.txt.
 *   Dalga 2 (dalga 1 bitince, yine aynı anda): sitemap/menü linklerinden bulunan, en fazla 5
 *   "kritik sayfa" (hakkımızda / ürünler-hizmetler / iletişim).
 *
 * Her sayfa isteği kendi 4sn sınırına sahip (PAGE_TIMEOUT_MS) — sayfalar paralel çekildiği için
 * TÜM taramanın süresi tek bir yavaş sayfaya göre değil, o sayfaların en yavaşına göre belirlenir.
 * Basit fetch başarısız olur, bariz şekilde engellenmiş (Cloudflare meydan okuması) ya da
 * neredeyse boş (JS'le render edilen bir SPA kabuğu) görünürse Jina Reader
 * (https://r.jina.ai/<url>) üzerinden, sunucu tarafında render edilmiş temiz metin alınmaya
 * çalışılır — API anahtarı gerektirmeyen, Render'daki web service'e Playwright/Chromium gibi
 * ağır bir bağımlılık eklemeden JS-ağırlıklı/Cloudflare'li siteleri de okuyabilen tek yedek.
 * Firecrawl/Playwright kartın metninde alternatif olarak anılıyor ama ikisi de (API anahtarı +
 * ücretli kota, ya da tarayıcı ikili dosyaları + ciddi bellek/soğuk-başlama maliyeti) bu
 * boyuttaki bir web service için orantısız — Jina Reader aynı işi sıfır yeni altyapıyla görüyor.
 *
 * Jina Reader'dan dönen içerik zaten düzyazıya çevrilmiş metin olduğu için (orijinal HTML değil)
 * o sayfalarda OG/JSON-LD/hreflang alanları doldurulamaz — bu açıkça `fetchedVia: "jina-reader"`
 * ile işaretlenir, asla sahte/boş metadata üretilmez.
 */

const PAGE_TIMEOUT_MS = 4000;
const JINA_TIMEOUT_MS = 4000;
const MAX_BODY_CHARS_PER_PAGE = 3000;
const MAX_CRITICAL_PAGES = 5;
const CRAWLER_UA = "Mozilla/5.0 (compatible; GeoSeoContentHubBot/0.1; +https://example.com/bot)";

export interface CrawledPageData {
  url: string;
  fetchedVia: "fetch" | "jina-reader" | "failed";
  title: string | null;
  metaDescription: string | null;
  /** og:* meta tags, keyed by their full property name (e.g. "og:site_name"). */
  og: Record<string, string>;
  /** Raw parsed JSON-LD blocks found on the page (schema.org Organization/Product and anything
   * else) — kept as-is, never filtered down, so callers can look for whatever @type they need. */
  jsonLd: any[];
  lang: string | null;
  hreflang: { lang: string; href: string }[];
  bodyText: string;
  error?: string;
}

export interface SiteCrawlResult {
  rootUrl: string;
  domain: string;
  robotsTxt: { found: boolean; content: string | null; sitemapUrls: string[] };
  sitemapUrls: string[];
  llmsTxt: { found: boolean; content: string | null };
  /** Home page first, then up to 5 critical pages — see pickCriticalPages below. */
  pages: CrawledPageData[];
  criticalPageUrls: string[];
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

async function fetchRaw(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, redirect: "follow", headers: { "User-Agent": CRAWLER_UA } });
  } finally {
    clearTimeout(timer);
  }
}

function looksBlockedOrEmpty(html: string, bodyText: string, status: number): boolean {
  if (status === 403 || status === 503) return true;
  if (/cf-browser-verification|just a moment\.{3}|__cf_chl_|attention required[\s\S]{0,40}cloudflare|enable javascript and cookies to continue/i.test(html)) {
    return true;
  }
  if (bodyText.trim().length < 200) return true;
  return false;
}

async function fetchViaJinaReader(url: string): Promise<{ bodyText: string; title: string | null } | null> {
  try {
    const res = await fetchRaw(`https://r.jina.ai/${url}`, JINA_TIMEOUT_MS);
    if (!res.ok) return null;
    const raw = await res.text();
    const titleMatch = raw.match(/^Title:\s*(.+)$/m);
    const cleaned = raw
      .replace(/^Title:.*$/m, "")
      .replace(/^URL Source:.*$/m, "")
      .replace(/^Markdown Content:\s*/m, "")
      .trim();
    if (!cleaned) return null;
    return { bodyText: cleaned.slice(0, MAX_BODY_CHARS_PER_PAGE), title: titleMatch ? titleMatch[1].trim() : null };
  } catch {
    return null;
  }
}

function extractOg($: cheerio.CheerioAPI): Record<string, string> {
  const og: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const prop = $(el).attr("property");
    const content = $(el).attr("content");
    if (prop && content) og[prop] = content;
  });
  return og;
}

function extractJsonLd($: cheerio.CheerioAPI): any[] {
  const blocks: any[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw.trim()) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) blocks.push(...parsed);
      else blocks.push(parsed);
    } catch {
      // Sayfanın kendi JSON-LD'si bozuk — taramanın geri kalanını düşürmeden atlanır.
    }
  });
  return blocks;
}

function extractHreflang($: cheerio.CheerioAPI, baseUrl: string): { lang: string; href: string }[] {
  const out: { lang: string; href: string }[] = [];
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const lang = $(el).attr("hreflang");
    const href = $(el).attr("href");
    if (!lang || !href) return;
    try {
      out.push({ lang, href: new URL(href, baseUrl).toString() });
    } catch {
      out.push({ lang, href });
    }
  });
  return out;
}

function extractInternalLinks($: cheerio.CheerioAPI, baseUrl: string, hostname: string): { href: string; text: string }[] {
  const out: { href: string; text: string }[] = [];
  const seen = new Set<string>();
  const bareHost = hostname.replace(/^www\./, "");
  $("a[href]").each((_, el) => {
    const raw = $(el).attr("href");
    if (!raw || raw.startsWith("#") || /^(mailto|tel):/i.test(raw)) return;
    try {
      const resolved = new URL(raw, baseUrl);
      if (resolved.hostname.replace(/^www\./, "") !== bareHost) return;
      const key = resolved.origin + resolved.pathname;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ href: resolved.toString(), text: $(el).text().trim().slice(0, 80) });
    } catch {
      // Çözülemeyen href — atla.
    }
  });
  return out;
}

function emptyPage(url: string, error: string): CrawledPageData {
  return { url, fetchedVia: "failed", title: null, metaDescription: null, og: {}, jsonLd: [], lang: null, hreflang: [], bodyText: "", error };
}

async function crawlPage(url: string, collectLinks: boolean): Promise<CrawledPageData & { internalLinks?: { href: string; text: string }[] }> {
  let res: Response;
  try {
    res = await fetchRaw(url, PAGE_TIMEOUT_MS);
  } catch (err) {
    // Basit fetch'in kendisi patladı (DNS/timeout/ağ hatası) — JS render gerektirmeyen bir
    // erişim sorunu olsa bile, Jina Reader farklı bir ağ yolundan denediği için yine de bir
    // şans veriliyor; o da başarısız olursa sayfa dürüstçe "failed" olarak işaretleniyor.
    const fallback = await fetchViaJinaReader(url);
    if (fallback) {
      return { url, fetchedVia: "jina-reader", title: fallback.title, metaDescription: null, og: {}, jsonLd: [], lang: null, hreflang: [], bodyText: fallback.bodyText };
    }
    return emptyPage(url, err instanceof Error ? err.message : "Sayfa alınamadı");
  }

  if (res.status === 404) {
    // Temiz bir "bulunamadı" — bu aday URL zaten yok, ağır bir yedek denemeye değmez.
    return emptyPage(url, "404 Not Found");
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  const bodyText = $("body").clone().find("nav, footer").remove().end().text().replace(/\s+/g, " ").trim();

  if (!res.ok || looksBlockedOrEmpty(html, bodyText, res.status)) {
    const fallback = await fetchViaJinaReader(url);
    if (fallback && fallback.bodyText.length > bodyText.length) {
      return {
        url,
        fetchedVia: "jina-reader",
        title: fallback.title ?? ($("title").first().text().trim() || null),
        metaDescription: $('meta[name="description"]').attr("content")?.trim() || null,
        og: extractOg($),
        jsonLd: extractJsonLd($),
        lang: $("html").attr("lang")?.trim().toLowerCase() || null,
        hreflang: extractHreflang($, url),
        bodyText: fallback.bodyText,
        internalLinks: collectLinks ? extractInternalLinks($, url, new URL(url).hostname) : undefined,
      };
    }
    // Yedek de yardımcı olmadıysa (ya da kendisi başarısız olduysa) basit fetch'in bulabildiği
    // — muhtemelen kısa/boş — içerik dürüstçe aşağıda döndürülüyor, sessizce atlanmıyor.
  }

  return {
    url,
    fetchedVia: "fetch",
    title: $("title").first().text().trim() || null,
    metaDescription: $('meta[name="description"]').attr("content")?.trim() || null,
    og: extractOg($),
    jsonLd: extractJsonLd($),
    lang: $("html").attr("lang")?.trim().toLowerCase() || null,
    hreflang: extractHreflang($, url),
    bodyText: bodyText.slice(0, MAX_BODY_CHARS_PER_PAGE),
    internalLinks: collectLinks ? extractInternalLinks($, url, new URL(url).hostname) : undefined,
  };
}

async function fetchRobotsTxt(origin: string): Promise<{ found: boolean; content: string | null; sitemapUrls: string[] }> {
  try {
    const res = await fetchRaw(`${origin}/robots.txt`, PAGE_TIMEOUT_MS);
    if (!res.ok) return { found: false, content: null, sitemapUrls: [] };
    const content = await res.text();
    const sitemapUrls = content
      .split(/\r?\n/)
      .filter((l) => /^sitemap:/i.test(l.trim()))
      .map((l) => l.trim().replace(/^sitemap:\s*/i, ""));
    return { found: true, content: content.slice(0, 4000), sitemapUrls };
  } catch {
    return { found: false, content: null, sitemapUrls: [] };
  }
}

async function fetchLlmsTxt(origin: string): Promise<{ found: boolean; content: string | null }> {
  try {
    const res = await fetchRaw(`${origin}/llms.txt`, PAGE_TIMEOUT_MS);
    if (!res.ok) return { found: false, content: null };
    const content = await res.text();
    return { found: true, content: content.slice(0, 6000) };
  } catch {
    return { found: false, content: null };
  }
}

/** Bir sitemap index dosyasına denk gelirse, zaman bütçesi için kasıtlı olarak sadece İLK alt
 * sitemap'e iner — tam rekürsif bir tarama değil, dokümante edilmiş bir sınırlama. */
async function fetchSitemapFromUrl(sitemapUrl: string, depth = 0): Promise<string[]> {
  if (depth > 1) return [];
  const res = await fetchRaw(sitemapUrl, PAGE_TIMEOUT_MS);
  if (!res.ok) return [];
  const xml = await res.text();
  const $ = cheerio.load(xml, { xmlMode: true });
  if ($("sitemapindex").length > 0) {
    const firstChild = $("sitemap > loc").first().text().trim();
    if (!firstChild) return [];
    return fetchSitemapFromUrl(firstChild, depth + 1);
  }
  const urls: string[] = [];
  $("url > loc").each((_, el) => {
    const loc = $(el).text().trim();
    if (loc) urls.push(loc);
  });
  return urls;
}

async function fetchSitemapXml(origin: string): Promise<string[]> {
  try {
    return await fetchSitemapFromUrl(`${origin}/sitemap.xml`);
  } catch {
    return [];
  }
}

const ABOUT_KEYWORDS = ["hakkimizda", "about", "kurumsal", "biz-kimiz"];
const PRODUCT_KEYWORDS = ["urunler", "urun", "hizmetler", "hizmet", "products", "product", "services", "service", "cozumler"];
const CONTACT_KEYWORDS = ["iletisim", "contact", "bize-ulasin"];

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

/** Kart: "en fazla 5 kritik sayfa (hakkımızda, ürünler/hizmetler, iletişim; sitemap'ten ya da
 * menü linklerinden bulunur)". Sitemap URL'leri önce denenir (gerçek, yayınlanmış sayfa listesi
 * — menüdeki bir linkten daha güvenilir bir sinyal), sonra ana sayfanın kendi iç linkleri
 * (hem yol hem link metni eşleştirilir). Kota hâlâ doluysa kalan sitemap URL'leriyle
 * tamamlanır ki "kritik" kategoriler boş çıksa bile tarama elinde hiç ek sayfa olmadan
 * kalmasın. */
function pickCriticalPages(opts: {
  sitemapUrls: string[];
  homeLinks: { href: string; text: string }[];
  hostname: string;
  homeUrl: string;
}): string[] {
  const { sitemapUrls, homeLinks, hostname, homeUrl } = opts;
  const bareHost = hostname.replace(/^www\./, "");
  const picked: string[] = [];
  const pickedSet = new Set<string>([homeUrl]);

  function tryMatch(keywords: string[], max: number) {
    let count = 0;
    for (const u of sitemapUrls) {
      if (count >= max) break;
      try {
        const parsed = new URL(u);
        if (parsed.hostname.replace(/^www\./, "") !== bareHost) continue;
        const path = normalizeForMatch(parsed.pathname);
        if (keywords.some((k) => path.includes(k)) && !pickedSet.has(u)) {
          picked.push(u);
          pickedSet.add(u);
          count++;
        }
      } catch {
        // Bozuk bir sitemap girişi — atla.
      }
    }
    for (const link of homeLinks) {
      if (count >= max) break;
      const path = normalizeForMatch(new URL(link.href).pathname);
      const text = normalizeForMatch(link.text);
      if ((keywords.some((k) => path.includes(k)) || keywords.some((k) => text.includes(k))) && !pickedSet.has(link.href)) {
        picked.push(link.href);
        pickedSet.add(link.href);
        count++;
      }
    }
  }

  tryMatch(ABOUT_KEYWORDS, 1);
  tryMatch(PRODUCT_KEYWORDS, 2);
  tryMatch(CONTACT_KEYWORDS, 1);

  if (picked.length < MAX_CRITICAL_PAGES) {
    for (const u of sitemapUrls) {
      if (picked.length >= MAX_CRITICAL_PAGES) break;
      if (!pickedSet.has(u)) {
        picked.push(u);
        pickedSet.add(u);
      }
    }
  }
  return picked.slice(0, MAX_CRITICAL_PAGES);
}

export async function crawlSite(rawUrl: string): Promise<SiteCrawlResult> {
  const startedAt = new Date().toISOString();
  const start = Date.now();
  const url = normalizeUrl(rawUrl);
  const origin = new URL(url).origin;
  const domain = domainFromUrl(url);
  const hostname = new URL(url).hostname;

  // Dalga 1 — "aynı anda çekilecekler": ana sayfa + robots.txt + sitemap.xml + llms.txt.
  const [homeSettled, robotsSettled, sitemapSettled, llmsSettled] = await Promise.allSettled([
    crawlPage(url, true),
    fetchRobotsTxt(origin),
    fetchSitemapXml(origin),
    fetchLlmsTxt(origin),
  ]);

  const home: CrawledPageData =
    homeSettled.status === "fulfilled" ? homeSettled.value : emptyPage(url, "Ana sayfa alınamadı");
  const homeLinks = homeSettled.status === "fulfilled" ? (homeSettled.value.internalLinks ?? []) : [];
  const robots = robotsSettled.status === "fulfilled" ? robotsSettled.value : { found: false, content: null, sitemapUrls: [] };
  let sitemapUrls = sitemapSettled.status === "fulfilled" ? sitemapSettled.value : [];
  const llmsTxt = llmsSettled.status === "fulfilled" ? llmsSettled.value : { found: false, content: null };

  // Varsayılan /sitemap.xml hiç URL vermediyse ve robots.txt farklı bir sitemap adresi
  // belirtiyorsa, SADECE bu durumda onu da dener — gereksiz bir ikinci istekten kaçınmak için.
  if (sitemapUrls.length === 0 && robots.sitemapUrls.length > 0) {
    try {
      sitemapUrls = await fetchSitemapFromUrl(robots.sitemapUrls[0]);
    } catch {
      // Kritik sayfa seçimi zaten ana sayfa linklerine düşer — burada sessizce devam edilir.
    }
  }

  // Dalga 2 — kritik sayfalar, yine aynı anda.
  const criticalUrls = pickCriticalPages({ sitemapUrls, homeLinks, hostname, homeUrl: url });
  const criticalSettled = await Promise.allSettled(criticalUrls.map((u) => crawlPage(u, false)));
  const criticalPages = criticalSettled.map((r, i) => (r.status === "fulfilled" ? r.value : emptyPage(criticalUrls[i], "Sayfa alınamadı")));

  return {
    rootUrl: url,
    domain,
    robotsTxt: robots,
    sitemapUrls: sitemapUrls.slice(0, 50),
    llmsTxt,
    pages: [home, ...criticalPages],
    criticalPageUrls: criticalUrls,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
  };
}

function summarizeJsonLd(blocks: any[]): string | null {
  const bits: string[] = [];
  for (const b of blocks) {
    const rawType = b?.["@type"];
    const type = typeof rawType === "string" ? rawType : Array.isArray(rawType) ? rawType.join("/") : null;
    if (!type) continue;
    if (/organization/i.test(type)) {
      bits.push(`Organization name=${b.name ?? "?"}${b.description ? `, description=${String(b.description).slice(0, 200)}` : ""}`);
    } else if (/product/i.test(type)) {
      bits.push(`Product name=${b.name ?? "?"}${b.description ? `, description=${String(b.description).slice(0, 150)}` : ""}`);
    }
  }
  return bits.length > 0 ? bits.join("; ") : null;
}

/** Çoklu sayfa taramasını tek bir, LLM prompt'una gömülebilir metne indirger — her sayfa kendi
 * URL/title/meta/OG/JSON-LD özetiyle başlar, ardından gövde metni gelir. Toplamda maxChars'ta
 * kesilir (varsayılan 8000 — eski tek-sayfalı akışın 4000 karakterlik sınırının, artık 6 sayfaya
 * kadar birleştirildiği için kabaca iki katı). */
export function combinedCrawlText(crawl: SiteCrawlResult, maxChars = 8000): string {
  const parts: string[] = [];
  for (const page of crawl.pages) {
    if (!page.bodyText && !page.title) continue;
    const jsonLdSummary = summarizeJsonLd(page.jsonLd);
    const section = [
      `--- ${page.url} ---`,
      page.title ? `Title: ${page.title}` : null,
      page.metaDescription ? `Meta description: ${page.metaDescription}` : null,
      page.og["og:site_name"] ? `OG site name: ${page.og["og:site_name"]}` : null,
      page.og["og:description"] ? `OG description: ${page.og["og:description"]}` : null,
      jsonLdSummary ? `JSON-LD: ${jsonLdSummary}` : null,
      page.bodyText ? `Body: ${page.bodyText}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    parts.push(section);
  }
  return parts.join("\n\n").slice(0, maxChars);
}
