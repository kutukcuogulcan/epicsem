import type { BulkCrawlAssets, BulkImportResult, BulkImportRow, BulkImportSummary } from "@/types";
import { ISSUE_SEVERITY, THEMES } from "@/lib/bulk-labels";

/** Bir taramadan (kendi tarayıcımız ya da içe aktarılan CSV) gelen ham sayfa satırı. */
export type RawBulkRow = Omit<BulkImportRow, "issues">;

const THIN_CONTENT_WORDS = 200;
const TITLE_MAX = 60;
const TITLE_MIN = 30;
const META_DESC_MAX = 160;
const META_DESC_MIN = 70;
const SLOW_MS = 1500;
const LARGE_HTML_KB = 500;
const DEEP_CLICKS = 4;

/**
 * Site genelindeki teknik SEO sorunlarını satırlardan çıkarır: kırık/yönlendirme, eksik/uzun/
 * tekrarlayan title ve meta, H1, thin content, indekslenemez/noindex. Kaynaktan bağımsızdır.
 */
const GENERIC_ANCHORS = /^(tıkla(yın|yınız)?|buraya tıkla(yın)?|burada|buraya|devamı|devamını oku|daha fazla|detay(lar)?|incele|click here|here|read more|more|learn more|link)$/i;
const LANG_CODE = /^(x-default|[a-z]{2,3}(-[a-z]{4})?(-([a-z]{2}|\d{3}))?)$/i;

export function buildBulkResult(raw: RawBulkRow[], filename: string, columns: string[], assets?: BulkCrawlAssets): BulkImportResult {
  const byUrl = new Map(raw.map((r) => [r.url, r]));
  const sitemapNoindex = (r: RawBulkRow) => !!r.metrics?.inSitemap && !!r.metaRobots && /noindex/i.test(r.metaRobots);
  const dupOf = new Set((assets?.duplicateGroups ?? []).flat());
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
    const m = r.metrics;
    if (m) {
      if (statusCode !== null && statusCode >= 300 && statusCode < 400 && m.redirectChain) issues.push("redirect-chain");
      if (m.brokenOutlinks.length > 0) issues.push("broken-outlinks");
      if (m.orphan) issues.push("orphan-page");
      if (is2xx) {
        if (m.responseMs !== null && m.responseMs > SLOW_MS) issues.push("slow-response");
        if (m.htmlKb !== null && m.htmlKb > LARGE_HTML_KB) issues.push("large-page");
        if (m.mixedContent > 0) issues.push("mixed-content");
      }
      if (isIndexableContext && is2xx) {
        if (title && title.length < TITLE_MIN) issues.push("title-too-short");
        if (metaDescription && metaDescription.length < META_DESC_MIN) issues.push("meta-description-too-short");
        if (m.imagesMissingAlt > 0) issues.push("images-missing-alt");
        if (!r.canonical) issues.push("missing-canonical");
        if (m.schemaTypes.length === 0) issues.push("missing-schema");
        if (!m.hasViewport) issues.push("missing-viewport");
        if (!m.lang) issues.push("missing-lang");
        if (!m.hasOpenGraph) issues.push("missing-open-graph");
        if (m.h2Count === 0 && (wordCount ?? 0) >= THIN_CONTENT_WORDS) issues.push("missing-h2");
        if (m.depth !== null && m.depth >= DEEP_CLICKS) issues.push("deep-page");
        if (m.inSitemap === false && m.depth !== null && m.depth > 0) issues.push("not-in-sitemap");
      }
    }
    if (m && assets) {
      // Yönlendirme ayrıntıları
      const hops = m.redirectHops ?? [];
      if (hops.some((h) => h.status === -1)) issues.push("redirect-loop");
      if (statusCode === 302 || statusCode === 307) issues.push("redirect-temporary");
      if (hops.some((h, i) => i > 0 && /^http:/i.test(h.url) && /^https:/i.test(hops[i - 1].url))) issues.push("https-to-http");
      // Dış linkler / görseller
      const brokenExt = (m.outLinks ?? []).filter((l) => l.external && (assets.externalLinks[l.to] ?? 200) >= 400);
      if (brokenExt.length) issues.push("broken-external-links");
      const imgs = m.images ?? [];
      if (imgs.some((i) => {
        const st = assets.images[i.src]?.status;
        return st !== undefined && (st >= 400 || st === 0);
      })) issues.push("broken-images");
      if (imgs.some((i) => (assets.images[i.src]?.kb ?? 0) > 100)) issues.push("large-images");
      if (is2xx && imgs.some((i) => !i.hasSize)) issues.push("images-no-dimensions");
      // Link kalitesi
      const anchors = (m.outLinks ?? []).filter((l) => !l.external);
      if (anchors.some((l) => !l.anchor)) issues.push("empty-anchor");
      if (anchors.some((l) => GENERIC_ANCHORS.test(l.anchor.trim()))) issues.push("generic-anchor");
      if (anchors.some((l) => l.nofollow)) issues.push("nofollow-internal");
      if ((m.totalLinks ?? 0) > 150) issues.push("too-many-links");
      // Canonical hedefi sağlıklı mı?
      if (r.canonical && r.canonical !== url) {
        const t = byUrl.get(r.canonical);
        if (t && t.statusCode !== null && (t.statusCode >= 300 || t.statusCode === 0)) issues.push("canonical-to-non200");
      }
      // İçerik
      if (is2xx && title && r.h1 && title.trim().toLowerCase() === r.h1.trim().toLowerCase()) issues.push("title-equals-h1");
      if (dupOf.has(url)) issues.push("near-duplicate");
      if (sitemapNoindex(r)) issues.push("noindex-in-sitemap");
      // hreflang
      const hl = m.hreflang ?? [];
      if (hl.length) {
        if (hl.some((h) => !LANG_CODE.test(h.lang))) issues.push("hreflang-invalid");
        if (!hl.some((h) => h.href === url)) issues.push("hreflang-no-self");
        const noReturn = hl.some((h) => {
          if (h.href === url) return false;
          const t = byUrl.get(h.href);
          return !!t?.metrics?.hreflang && !t.metrics.hreflang.some((x) => x.href === url);
        });
        if (noReturn) issues.push("hreflang-no-return");
      }
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

  if (assets && rows.length) {
    const home = rows.find((r) => { try { return new URL(r.url).pathname === "/"; } catch { return false; } }) ?? rows[0];
    if (!assets.site.https) home.issues.push("no-https");
    else {
      if (!assets.site.hsts) home.issues.push("no-hsts");
      if (assets.site.httpRedirectsToHttps === false) home.issues.push("http-not-redirected");
    }
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

  const issueCounts: Record<string, number> = {};
  for (const row of rows) for (const code of row.issues) issueCounts[code] = (issueCounts[code] ?? 0) + 1;
  summary.issueCounts = issueCounts;
  const withM = rows.filter((r) => r.metrics && r.statusCode !== null && r.statusCode >= 200 && r.statusCode < 300);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  if (withM.length) {
    summary.avgResponseMs = avg(withM.map((r) => r.metrics!.responseMs).filter((x): x is number => x !== null));
    summary.avgHtmlKb = avg(withM.map((r) => r.metrics!.htmlKb).filter((x): x is number => x !== null));
  }

  // --- Ahrefs/Semrush tarzı özet: sağlık skoru, hata/uyarı/bildirim, durum kodu ve derinlik dağılımı ---
  const sev = (code: string) => ISSUE_SEVERITY[code] ?? "notice";
  const internalHtml = rows.filter((r) => r.statusCode !== null);
  const withError = internalHtml.filter((r) => r.issues.some((c) => sev(c) === "error")).length;
  summary.healthScore = internalHtml.length ? Math.round(((internalHtml.length - withError) / internalHtml.length) * 100) : null;
  summary.severity = { error: 0, warning: 0, notice: 0 };
  for (const [code, n] of Object.entries(issueCounts)) summary.severity[sev(code)] += n;
  const statusDist: Record<string, number> = {};
  for (const r of rows) {
    const k = r.statusCode === null ? "?" : r.statusCode === 0 ? "hata" : `${Math.floor(r.statusCode / 100)}xx`;
    statusDist[k] = (statusDist[k] ?? 0) + 1;
  }
  summary.statusDist = statusDist;
  const depthDist: Record<string, number> = {};
  for (const r of rows) {
    const d = r.metrics?.depth;
    if (d === undefined) continue;
    const k = d === null ? "bulunamadı" : d >= 5 ? "5+" : String(d);
    depthDist[k] = (depthDist[k] ?? 0) + 1;
  }
  if (Object.keys(depthDist).length) summary.depthDist = depthDist;
  summary.pagesWithErrors = withError;
  summary.pagesWithIssuesOnly = internalHtml.filter((r) => r.issues.length > 0 && !r.issues.some((c) => sev(c) === "error")).length;
  summary.themes = Object.fromEntries(
    THEMES.map((t) => {
      const bad = internalHtml.filter((r) => r.issues.some((c) => t.codes.includes(c))).length;
      return [t.key, internalHtml.length ? Math.round(((internalHtml.length - bad) / internalHtml.length) * 100) : 100];
    })
  );

  return { filename, importedAt: new Date().toISOString(), columns, summary, rows, duplicateTitleGroups, duplicateMetaGroups };
}
