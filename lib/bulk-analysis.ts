import type { BulkImportResult, BulkImportRow, BulkImportSummary } from "@/types";

/** Bir taramadan (kendi tarayıcımız ya da içe aktarılan CSV) gelen ham sayfa satırı. */
export type RawBulkRow = Omit<BulkImportRow, "issues">;

const THIN_CONTENT_WORDS = 200;
const TITLE_MAX = 60;
const META_DESC_MAX = 160;

/**
 * Site genelindeki teknik SEO sorunlarını satırlardan çıkarır: kırık/yönlendirme, eksik/uzun/
 * tekrarlayan title ve meta, H1, thin content, indekslenemez/noindex. Kaynaktan bağımsızdır.
 */
export function buildBulkResult(raw: RawBulkRow[], filename: string, columns: string[]): BulkImportResult {
  const rows: BulkImportRow[] = [];
  const titleCounts = new Map<string, string[]>();
  const metaCounts = new Map<string, string[]>();

  for (const r of raw) {
    const issues: string[] = [];
    const { statusCode, indexable, title, titleLength, metaDescription, metaDescriptionLength, h1, h1Count, wordCount, metaRobots, url } = r;
    const is2xx = statusCode !== null && statusCode >= 200 && statusCode < 300;
    const isIndexableContext = indexable !== false && (statusCode === null || is2xx);

    if (statusCode !== null && statusCode >= 400) issues.push("broken");
    else if (statusCode !== null && statusCode >= 300 && statusCode < 400) issues.push("redirect");

    if (isIndexableContext) {
      if (!title) issues.push("missing-title");
      else if (titleLength !== null && titleLength > TITLE_MAX) issues.push("title-too-long");
      if (!metaDescription) issues.push("missing-meta-description");
      else if (metaDescriptionLength !== null && metaDescriptionLength > META_DESC_MAX) issues.push("meta-description-too-long");
      if (!h1) issues.push("missing-h1");
      if (h1Count > 1) issues.push("multiple-h1");
      if (wordCount !== null && wordCount < THIN_CONTENT_WORDS) issues.push("thin-content");
    }
    if (indexable === false) issues.push("non-indexable");
    if (metaRobots && /noindex/i.test(metaRobots)) issues.push("noindex-tag");

    if (title && isIndexableContext) {
      const key = title.toLowerCase();
      if (!titleCounts.has(key)) titleCounts.set(key, []);
      titleCounts.get(key)!.push(url);
    }
    if (metaDescription && isIndexableContext) {
      const key = metaDescription.toLowerCase();
      if (!metaCounts.has(key)) metaCounts.set(key, []);
      metaCounts.get(key)!.push(url);
    }
    rows.push({ ...r, issues });
  }

  const duplicateTitleGroups = [...titleCounts.entries()].filter(([, u]) => u.length > 1).map(([value, urls]) => ({ value, urls }));
  const duplicateMetaGroups = [...metaCounts.entries()].filter(([, u]) => u.length > 1).map(([value, urls]) => ({ value, urls }));
  const dupTitleUrls = new Set(duplicateTitleGroups.flatMap((g) => g.urls));
  const dupMetaUrls = new Set(duplicateMetaGroups.flatMap((g) => g.urls));
  for (const row of rows) {
    if (dupTitleUrls.has(row.url) && row.title) row.issues.push("duplicate-title");
    if (dupMetaUrls.has(row.url) && row.metaDescription) row.issues.push("duplicate-meta-description");
  }

  const n = (code: string) => rows.filter((r) => r.issues.includes(code)).length;
  const summary: BulkImportSummary = {
    totalRows: rows.length,
    missingTitle: n("missing-title"),
    duplicateTitles: dupTitleUrls.size,
    titleTooLong: n("title-too-long"),
    missingMetaDescription: n("missing-meta-description"),
    duplicateMetaDescriptions: dupMetaUrls.size,
    metaDescriptionTooLong: n("meta-description-too-long"),
    missingH1: n("missing-h1"),
    multipleH1: n("multiple-h1"),
    thinContent: n("thin-content"),
    brokenLinks: n("broken"),
    redirects: n("redirect"),
    nonIndexable: n("non-indexable"),
    noindexTag: n("noindex-tag"),
  };

  return { filename, importedAt: new Date().toISOString(), columns, summary, rows, duplicateTitleGroups, duplicateMetaGroups };
}
