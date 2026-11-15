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
        title: `Sayfa HTTP ${res.status} döndürdü`,
        detail: `${url} adresi 200 (başarılı) yanıtı vermedi.`,
        recommendation: "Adresin hem kullanıcılar hem tarayıcılar için 200 durum koduyla açıldığından emin ol.",
      });
    }
  } catch (err) {
    pushIssue(issues, {
      category: "crawlability",
      severity: "critical",
      title: "Sayfa açılamadı",
      detail: err instanceof Error ? err.message : "Bilinmeyen bağlantı hatası",
      recommendation: "Alan adının erişilebilir olduğunu, güvenlik duvarı/WAF tarafından engellenmediğini ve DNS kaydının doğru olduğunu kontrol et.",
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
      title: "Sayfa başlığı (title) yok",
      detail: "Sayfanın <head> bölümünde <title> etiketi bulunamadı.",
      recommendation: "50-60 karakterlik, sayfaya özgü ve açıklayıcı bir başlık ekle. Hem Google hem AI motorları sayfanın konusunu ilk buradan anlar.",
    });
  } else if (title.length > 60) {
    pushIssue(issues, {
      category: "meta",
      severity: "info",
      title: "Sayfa başlığı uzun",
      detail: `Başlık ${title.length} karakter: "${title}"`,
      recommendation: "Arama sonuçlarında kesilmemesi için başlığı 60 karakterin altında tut.",
    });
  } else {
    pushIssue(issues, { category: "meta", severity: "pass", title: "Sayfa başlığı var", detail: title, recommendation: "" });
  }

  const description = $('meta[name="description"]').attr("content")?.trim() || null;
  if (!description) {
    pushIssue(issues, {
      category: "meta",
      severity: "warning",
      title: "Meta açıklama yok",
      detail: "<meta name=\"description\"> etiketi bulunamadı.",
      recommendation: "140-160 karakterlik bir özet yaz. AI motorları sayfada daha net bir özet yoksa bu metni doğrudan kullanır.",
    });
  } else {
    pushIssue(issues, { category: "meta", severity: "pass", title: "Meta açıklama var", detail: description, recommendation: "" });
  }

  const canonical = $('link[rel="canonical"]').attr("href") || null;
  if (!canonical) {
    pushIssue(issues, {
      category: "meta",
      severity: "info",
      title: "Canonical etiketi yok",
      detail: "<link rel=\"canonical\"> etiketi bulunamadı.",
      recommendation: "Sayfanın kendisini gösteren bir canonical ekle; tarayıcılar kopya içerik konusunda kararsız kalmasın.",
    });
  }

  // ---- 3. Headings ----
  const h1s = $("h1");
  const h1Count = h1s.length;
  if (h1Count === 0) {
    pushIssue(issues, {
      category: "headings",
      severity: "warning",
      title: "H1 başlığı yok",
      detail: "Sayfada hiç <h1> başlığı yok.",
      recommendation: "Sayfanın ana konusunu söyleyen tek bir H1 ekle. Google ve AI motorları konuyu öncelikle buradan anlar.",
    });
  } else if (h1Count > 1) {
    pushIssue(issues, {
      category: "headings",
      severity: "info",
      title: `Birden fazla H1 başlığı (${h1Count})`,
      detail: "Birden fazla <h1>, sayfanın ana konusunu bulanıklaştırır.",
      recommendation: "Sayfada tek H1 kullan; diğer başlıkları H2/H3 olarak düzenle.",
    });
  } else {
    pushIssue(issues, { category: "headings", severity: "pass", title: "Tek H1 başlığı var", detail: h1s.first().text().trim(), recommendation: "" });
  }

  // ---- 4. Content depth ----
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = bodyText ? bodyText.split(" ").length : 0;
  if (wordCount < 200) {
    pushIssue(issues, {
      category: "content",
      severity: "warning",
      title: "İçerik çok kısa",
      detail: `Görünen metin yaklaşık ${wordCount} kelime.`,
      recommendation: "AI motorları bir soruyu kendi içinde eksiksiz cevaplayan sayfaları tercih eder. Konuyu tanımlar, somut bilgiler ve karşılaştırmalarla genişlet.",
    });
  } else {
    pushIssue(issues, { category: "content", severity: "pass", title: "İçerik yeterli uzunlukta", detail: `~${wordCount} kelime`, recommendation: "" });
  }

  // Answer-first check: does the first ~150 words directly address a question-like structure?
  const first150 = bodyText.split(" ").slice(0, 150).join(" ");
  const hasDirectAnswerPattern = /\b(is|are|means|refers to|works by|helps you|allows you)\b|(dır|dir|dur|dür|tır|tir|tur|tür|nedir|demektir|sağlar|anlamına gelir)\b/i.test(first150.slice(0, 400));
  if (wordCount >= 200 && !hasDirectAnswerPattern) {
    pushIssue(issues, {
      category: "content",
      severity: "info",
      title: "Sayfa doğrudan bir cevapla başlamıyor olabilir",
      detail: "İlk ~150 kelimede net bir tanım ya da cevap cümlesi görünmüyor.",
      recommendation: "AI motorları, sayfanın en başında konuyu 1-2 cümlede doğrudan cevaplayan metinleri daha çok alıntılar (önce cevap, sonra ayrıntı).",
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
      title: "Yapısal veri (JSON-LD) yok",
      detail: "Sayfada <script type=\"application/ld+json\"> bloğu bulunamadı.",
      recommendation: "Uygun olanları ekle: Organization, Product, Article, FAQPage. Yapısal veri, AI motorlarının ve Google AI Overviews'un bilgileri güvenle okuduğu en net sinyallerden biridir.",
    });
  } else {
    pushIssue(issues, {
      category: "schema",
      severity: "pass",
      title: "Yapısal veri var",
      detail: `Bulunan türler: ${Array.from(schemaTypes).join(", ")}`,
      recommendation: "",
    });
  }
  const hasFaqSchema = Array.from(schemaTypes).some((t) => t.includes("FAQPage"));
  if (!hasFaqSchema) {
    pushIssue(issues, {
      category: "schema",
      severity: "info",
      title: "SSS (FAQPage) şeması yok",
      detail: "FAQPage yapısal verisi bulunamadı.",
      recommendation: "Sayfa sık sorulan soruları cevaplıyorsa bunları FAQPage şemasıyla işaretle. AI cevaplarında doğrudan alıntılanmanın en etkili yollarından biridir.",
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
      title: "Sayfa dili belirtilmemiş",
      detail: "Sayfa <html lang=\"...\"> ile dilini belirtmiyor.",
      recommendation: "Dili belirt (Türkçe içerik için lang=\"tr\"). Arama motorları ve AI tarayıcıları içeriği doğru dildeki kullanıcılara bununla ulaştırır; hreflang için de gereklidir.",
    });
  } else {
    pushIssue(issues, {
      category: "localization",
      severity: "pass",
      title: "Sayfa dili belirtilmiş",
      detail: `<html lang="${htmlLang}">${hreflangs.length > 0 ? ` · hreflang alternatifleri: ${hreflangs.join(", ")}` : ""}`,
      recommendation: "",
    });
    if (htmlLang.startsWith("tr") && hreflangs.length === 0) {
      pushIssue(issues, {
        category: "localization",
        severity: "info",
        title: "Türkçe sayfada hreflang alternatifi yok",
        detail: "lang=\"tr\" belirtilmiş ama <link rel=\"alternate\" hreflang=\"...\"> etiketi yok.",
        recommendation: "Marka başka dil/pazarlara da hizmet veriyorsa hreflang alternatiflerini (x-default dahil) ekle; aksi halde Google ve AI motorları sayfaları kopya sanabilir ya da yanlış dildeki sayfayı gösterebilir.",
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
    title: robotsTxtFound ? "robots.txt bulundu" : "robots.txt yok",
    detail: robotsTxtFound ? `${parsed.origin}/robots.txt` : "robots.txt olmaması hata değil, ama AI tarayıcılarına açıkça izin verip engelleyemezsin.",
    recommendation: robotsTxtFound ? "" : "Hangi AI ve arama tarayıcılarının siteye erişebileceğini kontrol etmek için bir robots.txt ekle.",
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
    title: sitemapFound ? "sitemap.xml bulundu" : "sitemap.xml yok",
    detail: sitemapFound ? `${parsed.origin}/sitemap.xml` : "Varsayılan konumda site haritası bulunamadı.",
    recommendation: sitemapFound ? "" : "Bir XML site haritası yayınla ve robots.txt içinde belirt; arama ve AI tarayıcıları tüm sayfaları daha kolay bulur.",
  });

  // ---- 7. AI bot accessibility (AXO) ----
  const aiBotAccess: AiBotAccess[] = AI_BOTS.map((bot) => ({
    bot: bot.userAgent,
    engine: bot.engine,
    role: bot.role,
    allowed: robotsTxtFound ? isBotAllowed(robotsBlocks, bot.userAgent) : true,
  }));
  const blockedBots = aiBotAccess.filter((b) => !b.allowed);
  const blockedCitation = blockedBots.filter((b) => b.role !== "training");
  if (blockedBots.length > 0) {
    pushIssue(issues, {
      category: "ai-crawlability",
      severity: blockedCitation.length ? "critical" : "warning",
      title: blockedCitation.length
        ? `robots.txt ${blockedCitation.length} AI arama/alıntı botunu engelliyor`
        : `robots.txt ${blockedBots.length} AI eğitim botunu engelliyor`,
      detail: blockedBots.map((b) => `${b.bot} (${b.engine}${b.role === "training" ? ", eğitim" : ""})`).join(", "),
      recommendation: "Bu içeriğin ChatGPT, Claude, Perplexity veya Google AI Overviews cevaplarında alıntılanmasını istiyorsan bu botlar için Disallow kuralını kaldır. Engel bilinçliyse (ör. içeriği AI eğitiminden korumak) sorun değil; sadece CMS/CDN'in varsayılan ayarı olmadığından emin ol.",
    });
  } else {
    pushIssue(issues, {
      category: "ai-crawlability",
      severity: "pass",
      title: "Hiçbir AI botu engellenmiyor",
      detail: "GPTBot, ClaudeBot, PerplexityBot, Google-Extended ve diğerleri bu sayfaya erişebiliyor.",
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
      aiBotAccess: AI_BOTS.map((b) => ({ bot: b.userAgent, engine: b.engine, role: b.role, allowed: true })),
      htmlLang: null,
      hreflangs: [],
    },
  };
}
