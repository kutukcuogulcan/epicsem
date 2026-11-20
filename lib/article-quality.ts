import type { GeneratedArticle } from "@/types";
import { mdToBlocks, scoreDoc, uid } from "./editor-score";

/**
 * Yazı kalite kapısı (AI'sız): dolgu cümlelerini temizler, editördeki SEO + GEO puanlamasıyla ölçer,
 * eksik maddeleri AI düzeltmesine verilecek talimatlara çevirir.
 */

// Anlamı bozmadan silinebilen kalıplar (cümle başı dolgu).
const FILLER_STRIP: [RegExp, string][] = [
  [/(^|\n)Günümüzde,?\s+/g, "$1"],
  [/(^|[.!?]\s+)Sonuç olarak,\s+/g, "$1"],
  [/(^|[.!?]\s+)Unutmamak gerekir ki,?\s+/gi, "$1"],
  [/(^|[.!?]\s+)Şunu belirtmek gerekir ki,?\s+/gi, "$1"],
  [/(^|[.!?]\s+)In today's (?:fast-paced |digital )?world,\s+/gi, "$1"],
  [/(^|[.!?]\s+)In conclusion,\s+/gi, "$1"],
  [/(^|[.!?]\s+)It is important to note that\s+/gi, "$1"],
];
// Tümüyle gereksiz cümleler ("Bu yazıda ... ele alacağız.")
const FILLER_SENTENCE = /(?:^|(?<=[.!?]\s))(?:Bu (?:yazımızda|yazıda|makalede|rehberde)[^.!?\n]{0,160}(?:ele alacağız|inceleyeceğiz|anlatacağız|bahsedeceğiz|değineceğiz)[.!]|In this (?:article|post|guide),? we will[^.!?\n]{0,160}[.!])\s*/gi;
const FILLER_DETECT = /(günümüzde|bu yazı(?:mız)?da|sonuç olarak|unutmamak gerekir|son derece önemli|hayati önem|in today's|in this article|in conclusion|it is important to note|delve|game-changer)/gi;

const capFirst = (s: string) => s.replace(/(^|\n)([a-zçğıöşü])/g, (_, a, b) => a + b.toLocaleUpperCase("tr"));

export function polishMarkdown(md: string): string {
  let out = md.replace(FILLER_SENTENCE, "");
  for (const [re, to] of FILLER_STRIP) out = out.replace(re, to);
  // cümle başı küçük harfe düşenleri düzelt, fazla boş satırları topla
  out = out.replace(/([.!?]\s+)([a-zçğıöşü])/g, (_, a, b) => a + b.toLocaleUpperCase("tr"));
  out = capFirst(out).replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

export interface QualityReport {
  seo: number;
  geo: number;
  overall: number;
  words: number;
  filler: number;
  placeholders: number;
  /** AI düzeltmesine verilecek somut talimatlar (en önemli önce). */
  issues: string[];
  /** Puan yüksek olsa bile mutlaka düzeltilmesi gereken sorun var mı (aşırı tekrar, kısa, çok [NEEDS]). */
  critical: boolean;
}

/** Kalite kapısı ne zaman AI düzeltmesi tetiklesin: puan 75'in altında ya da kritik sorun varsa. */
export const needsRevision = (q: QualityReport) => q.issues.length > 0 && (q.overall < 75 || q.critical);

/**
 * Yayına hazır son biçim: gövdenin başına tek bir "# Başlık" (H1) koyar, gövdedeki diğer H1'leri H2 yapar.
 * (WordPress'e gönderirken baştaki H1 zaten atılır; editörde H1 kontrolü geçsin diye eklenir.)
 */
/** Yazının sonuna yazar kutusu (E-E-A-T sinyali). Yazar boşsa dokunmaz. */
export function appendAuthor(md: string, author?: string, bio?: string): string {
  if (!author?.trim()) return md;
  return `${md.trimEnd()}\n\n---\n\n**Yazar:** ${author.trim()}${bio?.trim() ? ` — ${bio.trim()}` : ""}\n`;
}

export function finalizeArticleBody(title: string, md: string): string {
  const body = md
    .replace(/^\s*#\s+[^\n]*\n+/, "")
    .replace(/^#\s+(?!#)/gm, "## ")
    .replace(/^(\|.*\|)[ \t]*\n(?=[^|\s])/gm, "$1\n\n"); // tablo altındaki satır tabloya karışmasın
  return `# ${title.trim()}\n\n${body.trim()}`;
}

export function qualityReport(article: GeneratedArticle, keyword: string, opts: { hasSources?: boolean } = {}): QualityReport {
  const blocks = [{ id: uid(), type: "h1" as const, text: article.title }, ...mdToBlocks(article.bodyMarkdown)];
  const r = scoreDoc(blocks, { title: article.title, metaDescription: article.metaDescription, keyword });
  const filler = (article.bodyMarkdown.match(FILLER_DETECT) ?? []).length;
  const issues: string[] = [];
  // Yalnızca yazarın düzeltebileceği maddeler (görsel/link sonradan eklenir, onları sayma).
  // Gerçek veri olmadan düzeltilemeyecekleri de atla (aksi halde model alıntı/rakam uydurmaya itilir).
  const skip = new Set(["kw", "img", "links", "h1", "quotes", "placeholders", ...(opts.hasSources ? [] : ["stats", "cite", "stat-source"])]);
  const failing = [...r.seoChecks, ...r.geoChecks].filter((c) => !skip.has(c.key))
    .filter((c) => !c.ok && (c.part ?? 0) < 0.85)
    .sort((a, b) => b.weight - a.weight);
  for (const c of failing.slice(0, 8)) issues.push(`${c.label}: ${c.hint}`);
  if (filler) issues.push(`Remove ${filler} filler phrase(s) such as "Günümüzde", "Bu yazıda ... ele alacağız", "Sonuç olarak" and rewrite those sentences with concrete information.`);
  const sections = r.passages.all.filter((p) => p.heading && !p.heading.trim().endsWith("?"));
  const thin = sections.filter((p) => p.words < 70).map((p) => p.heading).slice(0, 4);
  if (thin.length) issues.push(`These sections are too thin; expand each with concrete steps, examples or criteria: ${thin.map((h) => `"${h}"`).join(", ")}.`);
  const holes = (article.bodyMarkdown.match(/\[NEEDS:/g) ?? []).length;
  if (holes > 2) issues.push(`Reduce the ${holes} [NEEDS: ...] placeholders to at most 2: keep only essential brand-specific facts; rewrite the other sentences as useful general guidance that doesn't need the missing fact (never invent the fact).`);
  if (r.stats.words < 900) issues.push(`The article is only ${r.stats.words} words; expand it to at least 1200 words by deepening the existing sections (steps, examples, criteria, a table), not by repeating.`);
  for (const p of sections.filter((x) => x.grade === "D" || x.grade === "F").slice(0, 3)) issues.push(`Section "${p.heading}" is hard for AI engines to quote: ${p.tip}`);
  const overall = Math.round(r.seo * 0.45 + r.geo * 0.55 - Math.min(10, filler * 2));
  return {
    seo: r.seo,
    geo: r.geo,
    overall,
    words: r.stats.words,
    filler,
    placeholders: (article.bodyMarkdown.match(/\[NEEDS:/g) ?? []).length,
    issues,
    critical:
      [...r.seoChecks, ...r.geoChecks].some((c) => (c.key === "density" || c.key === "stuffing") && !c.ok) ||
      (article.bodyMarkdown.match(/\[NEEDS:/g) ?? []).length > 2 ||
      r.stats.words < 900,
  };
}
