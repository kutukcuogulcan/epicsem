import * as cheerio from "cheerio";
import { citInputFromHtml, scoreCitability } from "./citability";

/**
 * Google arama sonuçları (SERP) — SerpApi üzerinden. SERPAPI_API_KEY ortam değişkeni
 * tanımlı değilse bu özellikler kapalıdır (arayüz "anahtar gerekli" der). Kullanım:
 *  - SERP rakip analizi (ContentSwift mantığı): ilk 10 sonucun başlıkları, uzunluğu, ortak başlıkları.
 *  - Sıralama takibi (SerpBear mantığı): bir domainin bir kelimedeki Google pozisyonu.
 * Her arama SerpApi kotasından 1 arama harcar.
 */

export function serpAvailable(): boolean {
  return Boolean(process.env.SERPAPI_API_KEY);
}

export interface SerpResult {
  position: number;
  title: string;
  link: string;
  domain: string;
  snippet: string;
}

export interface SerpResponse {
  results: SerpResult[];
  aiOverview: boolean;
  peopleAlsoAsk: string[];
  relatedSearches: string[];
}

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

export async function googleSerp(q: string, opts: { gl?: string; hl?: string; num?: number } = {}): Promise<SerpResponse> {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) throw new Error("SerpApi anahtarı tanımlı değil (SERPAPI_API_KEY).");
  const params = new URLSearchParams({
    engine: "google",
    q,
    gl: (opts.gl || "tr").toLowerCase(),
    hl: (opts.hl || "tr").toLowerCase(),
    num: String(opts.num ?? 10),
    google_domain: (opts.gl || "tr").toLowerCase() === "tr" ? "google.com.tr" : "google.com",
    api_key: key,
  });
  const r = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(30_000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`SerpApi: ${j.error ?? `HTTP ${r.status}`}`);
  const results: SerpResult[] = (j.organic_results ?? []).map((o: any) => ({
    position: Number(o.position),
    title: String(o.title ?? ""),
    link: String(o.link ?? ""),
    domain: host(String(o.link ?? "")),
    snippet: String(o.snippet ?? ""),
  }));
  return {
    results,
    aiOverview: Boolean(j.ai_overview),
    peopleAlsoAsk: (j.related_questions ?? []).map((x: any) => String(x.question ?? "")).filter(Boolean).slice(0, 8),
    relatedSearches: (j.related_searches ?? []).map((x: any) => String(x.query ?? "")).filter(Boolean).slice(0, 10),
  };
}

export interface CompetitorPage {
  position: number;
  url: string;
  domain: string;
  title: string;
  words: number | null;
  h2: string[];
  hasFaq: boolean;
  hasTable: boolean;
  citability: number | null;
}

export interface SerpAnalysis {
  keyword: string;
  pages: CompetitorPage[];
  avgWords: number | null;
  /** İlk sonuçlarda sık geçen alt başlık temaları. */
  commonTopics: { topic: string; count: number }[];
  peopleAlsoAsk: string[];
  relatedSearches: string[];
  aiOverview: boolean;
  faqShare: number;
  tableShare: number;
}

const UA = "Mozilla/5.0 (compatible; EpicsemSerp/1.0; +https://epicsem-web.onrender.com)";
const STOP = new Set("ve ile için en bir bu şu da de mi mı ne nasıl nedir neler hangi the and for with of to in a how what".split(" "));

async function analyzePage(r: SerpResult): Promise<CompetitorPage> {
  const base: CompetitorPage = { position: r.position, url: r.link, domain: r.domain, title: r.title, words: null, h2: [], hasFaq: false, hasTable: false, citability: null };
  try {
    const res = await fetch(r.link, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok || !/html/i.test(res.headers.get("content-type") ?? "")) return base;
    const $ = cheerio.load(await res.text());
    $("script, style, noscript, svg, nav, footer, header").remove();
    const root = $("article").first().length ? $("article").first() : $("main").first().length ? $("main").first() : $("body");
    const text = root.text().replace(/\s+/g, " ").trim();
    const h2 = root.find("h2").map((_, el) => $(el).text().replace(/\s+/g, " ").trim()).get().filter((x) => x && x.length < 120).slice(0, 25);
    return {
      ...base,
      words: text ? text.split(" ").length : 0,
      h2,
      hasFaq: /(sık sorulan|sss|faq|frequently asked)/i.test(text.slice(0, 200000)) || $('[itemtype*="FAQPage"]').length > 0,
      hasTable: root.find("table").length > 0,
      citability: text.split(" ").length >= 250 ? scoreCitability(citInputFromHtml($, r.domain)).score : null,
    };
  } catch {
    return base;
  }
}

export async function analyzeSerp(keyword: string, opts: { gl?: string; hl?: string } = {}): Promise<SerpAnalysis> {
  const serp = await googleSerp(keyword, { ...opts, num: 10 });
  const top = serp.results.slice(0, 8);
  const pages = await Promise.all(top.map(analyzePage));
  const withWords = pages.filter((p) => p.words);
  const avgWords = withWords.length ? Math.round(withWords.reduce((a, p) => a + (p.words ?? 0), 0) / withWords.length) : null;
  // Başlıklardaki anlamlı kelime ikililerini say → ortak alt konular.
  const kwWords = new Set(keyword.toLocaleLowerCase("tr").split(/\s+/));
  const counts = new Map<string, Set<number>>();
  pages.forEach((p, i) => {
    for (const h of p.h2) {
      const ws = h
        .toLocaleLowerCase("tr")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP.has(w) && !kwWords.has(w));
      for (let k = 0; k < ws.length; k++) {
        for (const g of [ws[k], ws[k + 1] ? `${ws[k]} ${ws[k + 1]}` : null]) {
          if (!g) continue;
          if (!counts.has(g)) counts.set(g, new Set());
          counts.get(g)!.add(i);
        }
      }
    }
  });
  const commonTopics = [...counts.entries()]
    .map(([topic, set]) => ({ topic, count: set.size }))
    .filter((t) => t.count >= 2)
    .sort((a, b) => b.count - a.count || b.topic.length - a.topic.length)
    .filter((t, i, arr) => !arr.slice(0, i).some((x) => x.topic.includes(t.topic) && x.count >= t.count))
    .slice(0, 15);
  const n = pages.length || 1;
  return {
    keyword,
    pages,
    avgWords,
    commonTopics,
    peopleAlsoAsk: serp.peopleAlsoAsk,
    relatedSearches: serp.relatedSearches,
    aiOverview: serp.aiOverview,
    faqShare: pages.filter((p) => p.hasFaq).length / n,
    tableShare: pages.filter((p) => p.hasTable).length / n,
  };
}

/** Bir domainin bir kelimedeki pozisyonu (ilk 100 içinde; yoksa null). */
export async function rankOf(keyword: string, domain: string, opts: { gl?: string; hl?: string } = {}): Promise<{ position: number | null; url: string | null; top: SerpResult[]; aiOverview: boolean }> {
  const serp = await googleSerp(keyword, { ...opts, num: 100 });
  const d = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
  const hit = serp.results.find((r) => r.domain === d || r.domain.endsWith(`.${d}`));
  return { position: hit?.position ?? null, url: hit?.link ?? null, top: serp.results.slice(0, 5), aiOverview: serp.aiOverview };
}
