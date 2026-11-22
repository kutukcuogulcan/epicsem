import type { GapRow, GapVerdict, GeoRunResult, SeoAuditResult } from "@/types";
import { analyzeRun } from "@/lib/geo-loss";

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
  /** Kaybedilen her soruda AI kimi önerdi, hangi sayfaları gösterdi (eski kayıtlarda yok). */
  lostTo?: LostQuestion[];
  /** Bu sayfa ile AI'ın en çok gösterdiği dış sayfanın kodla ölçülen karşılaştırması (eski kayıtlarda yok). */
  benchmark?: { own: PageFacts; other: PageFacts; cites: number };
}

export interface LostQuestion {
  question: string;
  /** Motor → o cevapta öne çıkan rakip (yoksa null = kimse anılmadı). */
  engines: { engine: string; winner: string | null }[];
  sources: { url: string; domain: string }[];
}

export interface PageFacts {
  url: string;
  wordCount: number;
  schemaTypes: string[];
  faq: boolean;
  author: boolean | null;
  date: boolean | null;
  outboundCitations: number | null;
  aiCrawlScore: number;
}

export const pageFacts = (a: SeoAuditResult): PageFacts => ({
  url: a.url,
  wordCount: a.meta.wordCount,
  schemaTypes: a.meta.schemaTypes,
  faq: a.meta.schemaTypes.includes("FAQPage"),
  author: a.meta.eeat?.author ?? null,
  date: a.meta.eeat?.date ?? null,
  outboundCitations: a.meta.links?.outboundCitations ?? a.meta.eeat?.citations ?? null,
  aiCrawlScore: a.aiCrawlScore,
});

/** Kaybedilen sorular (rakip kazandı ya da kimse anılmadı) + AI'ın gösterdiği dış sayfalar; en çok gösterilen dış sayfalar sırayla. */
export function lostQuestions(runs: GeoRunResult[], brand: BrandRef, competitors: BrandRef[]) {
  const own = normalizeDomain(brand.domain);
  const byQ = new Map<string, LostQuestion>();
  const urlHits = new Map<string, number>();
  for (const r of runs) {
    const a = analyzeRun(r, brand, competitors);
    if (a.status !== "lost" && a.status !== "empty") continue;
    const q = byQ.get(r.promptText) ?? { question: r.promptText, engines: [], sources: [] };
    q.engines.push({ engine: r.engine, winner: a.rivals[0]?.name ?? null });
    for (const c of r.citations) {
      const d = normalizeDomain(c.domain || c.url);
      if (!c.url || !d || d === own || d.endsWith("." + own)) continue;
      urlHits.set(c.url, (urlHits.get(c.url) ?? 0) + 1);
      if (!q.sources.some((x) => x.url === c.url)) q.sources.push({ url: c.url, domain: d });
    }
    byQ.set(r.promptText, q);
  }
  const lost = [...byQ.values()].map((q) => ({ ...q, sources: q.sources.slice(0, 5) }));
  const topUrls = [...urlHits.entries()].sort((a, b) => b[1] - a[1]).map(([url, n]) => ({ url, n }));
  return { lost, topUrls };
}

const yesNo = (v: boolean | null) => (v == null ? "?" : v ? "var" : "yok");

/** Kendi sayfa ile AI'ın gösterdiği sayfa arasındaki ölçülebilir farklar (yalnızca senin aleyhine olanlar). */
export function compareFacts(own: PageFacts, other: PageFacts): string[] {
  const out: string[] = [];
  const host = (u: string) => normalizeDomain(u);
  const o = host(other.url);
  if (other.wordCount >= own.wordCount * 1.5 && other.wordCount - own.wordCount >= 300)
    out.push(`AI'ın gösterdiği ${o} sayfası ~${other.wordCount} kelime, seninki ~${own.wordCount}: soruyu daha kapsamlı cevaplıyor.`);
  if (other.faq && !own.faq) out.push(`${o} sayfasında SSS (FAQPage) işaretlemesi var, sende yok.`);
  const missing = other.schemaTypes.filter((t) => !own.schemaTypes.includes(t) && t !== "FAQPage").slice(0, 3);
  if (missing.length) out.push(`${o} şu yapılandırılmış veri türlerini kullanıyor, sen kullanmıyorsun: ${missing.join(", ")}.`);
  if (other.author && own.author === false) out.push(`${o} sayfasında yazar bilgisi ${yesNo(other.author)}, sende ${yesNo(own.author)}.`);
  if (other.date && own.date === false) out.push(`${o} sayfasında yayın/güncelleme tarihi görünüyor, sende görünmüyor.`);
  if ((other.outboundCitations ?? 0) >= 3 && (own.outboundCitations ?? 0) < 2)
    out.push(`${o} ${other.outboundCitations} dış kaynağa bağlantı veriyor, sen ${own.outboundCitations ?? 0}: AI kaynak gösteren sayfaları daha çok alıntılıyor.`);
  return out;
}

interface BrandRef {
  name: string;
  domain: string;
}

function normalizeDomain(d: string): string {
  return d
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
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
  competitors: BrandRef[],
  /** AI'ın en çok gösterdiği dış sayfaların denetimi (yoksa karşılaştırma yapılmaz). */
  benchmarks: { audit: SeoAuditResult; cites: number }[] = []
): ContentBrief[] {
  const { lost } = lostQuestions(runs, brand, competitors);
  const targetQuestions = lost.map((q) => q.question).slice(0, 6);
  const suggestedHeadings = targetQuestions.map(toHeading);
  const bench = benchmarks[0];

  const briefs: ContentBrief[] = [];
  for (const row of gapMatrix) {
    if (row.verdict !== "invisible" && row.verdict !== "needs-work" && row.verdict !== "blocked") continue;
    const audit = audits.find((a) => a.url === row.url);
    if (!audit) continue;
    const own = pageFacts(audit);
    const other = bench ? pageFacts(bench.audit) : null;

    const contentGaps: string[] = other ? compareFacts(own, other) : [];
    if (!own.faq && !contentGaps.some((g) => g.includes("FAQPage")))
      contentGaps.push("SSS (FAQPage) işaretlemesi yok: AI'ın aynen alıntılayabileceği kısa soru-cevap blokları ekle.");
    if (own.wordCount < 300) contentGaps.push(`İçerik çok kısa (~${own.wordCount} kelime): AI, soruyu tek başına eksiksiz cevaplayan sayfaları seçiyor.`);
    if (!audit.meta.description) contentGaps.push("Meta açıklaması yok: Site Denetimi'ndeki Düzeltmeler bölümünde hazır taslak var.");

    let reason: string;
    if (row.verdict === "blocked") {
      reason = `robots.txt ${row.blockedBots} AI botunu engelliyor: AI bu sayfayı okuyamıyor. İçerikten önce erişimi aç.`;
    } else if (row.verdict === "invisible") {
      reason = `Teknik olarak sağlam ve AI botlarına açık, ama bu testteki ${runs.length} cevabın hiçbirinde kaynak gösterilmedi. Sorun teknik değil, içeriğin soruları cevaplama biçimi.`;
    } else {
      reason = "SEO / AI uygunluk puanı 60'ın altında: içerikten önce Site Denetimi'ndeki teknik düzeltmeler gelmeli.";
    }

    if (targetQuestions.length === 0 && contentGaps.length === 0) continue;

    briefs.push({
      url: row.url,
      verdict: row.verdict,
      reason,
      targetQuestions,
      suggestedHeadings,
      contentGaps,
      lostTo: lost.slice(0, 8),
      benchmark: other && bench ? { own, other, cites: bench.cites } : undefined,
    });
  }
  return briefs;
}
