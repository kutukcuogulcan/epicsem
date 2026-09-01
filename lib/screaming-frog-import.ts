import type { BulkImportResult, BulkImportRow, BulkImportSummary } from "@/types";

/**
 * Screaming Frog "Internal → All" (or "Internal → HTML") CSV export import.
 *
 * Why this exists: Epicsem's own crawler (lib/seo-audit.ts) audits one URL at a time —
 * great for a landing page, useless for "here are the 4,000 URLs on this client's site,
 * which ones are broken/thin/duplicated." Agencies already run Screaming Frog for that;
 * this reuses its export instead of reinventing a full site crawler. Arvow doesn't offer
 * bulk technical import at all — every check there is single-URL, same gap this closes.
 *
 * Screaming Frog's exact column set varies by version and by which export tab it came
 * from, so this deliberately does NOT hardcode a fixed schema — it looks up each field
 * by header name (case-insensitive, with a couple of known aliases for older versions)
 * and treats anything it can't find as "unknown" rather than failing the whole import.
 * Only "Address" (the URL column) is required.
 */

const COLUMN_ALIASES: Record<string, string[]> = {
  url: ["address", "url"],
  statusCode: ["status code"],
  indexability: ["indexability"],
  title: ["title 1"],
  titleLength: ["title 1 length"],
  metaDescription: ["meta description 1"],
  metaDescriptionLength: ["meta description 1 length"],
  h1: ["h1-1"],
  h1Second: ["h1-2"],
  wordCount: ["word count"],
  canonical: ["canonical link element 1"],
  metaRobots: ["meta robots 1"],
};

/** Minimal RFC4180 CSV parser — handles quoted fields, embedded commas/newlines, "" escapes, CRLF. */
export function parseCsv(text: string): string[][] {
  // Screaming Frog exports on Windows often carry a UTF-8 BOM.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

function buildColumnIndex(header: string[]): Record<string, number> {
  const normalized = header.map((h) => h.trim().toLowerCase());
  const index: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const i = normalized.indexOf(alias);
      if (i !== -1) {
        index[field] = i;
        break;
      }
    }
  }
  return index;
}

function toInt(v: string | undefined): number | null {
  if (v === undefined || v.trim() === "") return null;
  const n = parseInt(v.replace(/[, ]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

const THIN_CONTENT_WORDS = 200;
const TITLE_MAX = 60;
const META_DESC_MAX = 160;

export function parseScreamingFrogCsv(csvText: string, filename: string): BulkImportResult {
  const table = parseCsv(csvText);
  if (table.length < 2) {
    throw new Error("CSV appears empty — export 'Internal → All' from Screaming Frog and try again.");
  }
  const header = table[0];
  const col = buildColumnIndex(header);
  if (col.url === undefined) {
    throw new Error(
      `No "Address" (URL) column found. Detected columns: ${header.slice(0, 8).join(", ")}${header.length > 8 ? ", …" : ""}`
    );
  }

  const rows: BulkImportRow[] = [];
  const titleCounts = new Map<string, string[]>();
  const metaCounts = new Map<string, string[]>();

  for (let r = 1; r < table.length; r++) {
    const line = table[r];
    if (!line || line.every((c) => c.trim() === "")) continue;
    const get = (field: string) => (col[field] !== undefined ? line[col[field]]?.trim() ?? "" : "");

    const url = get("url");
    if (!url) continue;

    const statusCode = toInt(get("statusCode"));
    const indexabilityRaw = get("indexability").toLowerCase();
    const indexable = indexabilityRaw ? indexabilityRaw === "indexable" : null;
    const title = get("title") || null;
    const titleLength = toInt(get("titleLength")) ?? (title ? title.length : null);
    const metaDescription = get("metaDescription") || null;
    const metaDescriptionLength = toInt(get("metaDescriptionLength")) ?? (metaDescription ? metaDescription.length : null);
    const h1 = get("h1") || null;
    const h1Count = (get("h1") ? 1 : 0) + (get("h1Second") ? 1 : 0);
    const wordCount = toInt(get("wordCount"));
    const canonical = get("canonical") || null;
    const metaRobots = get("metaRobots") || null;

    const issues: string[] = [];
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

    if (title) {
      const key = title.toLowerCase();
      if (!titleCounts.has(key)) titleCounts.set(key, []);
      titleCounts.get(key)!.push(url);
    }
    if (metaDescription) {
      const key = metaDescription.toLowerCase();
      if (!metaCounts.has(key)) metaCounts.set(key, []);
      metaCounts.get(key)!.push(url);
    }

    rows.push({
      url,
      statusCode,
      indexable,
      title,
      titleLength,
      metaDescription,
      metaDescriptionLength,
      h1,
      h1Count,
      wordCount,
      canonical,
      metaRobots,
      issues,
    });
  }

  const duplicateTitleGroups = [...titleCounts.entries()]
    .filter(([, urls]) => urls.length > 1)
    .map(([value, urls]) => ({ value, urls }));
  const duplicateMetaGroups = [...metaCounts.entries()]
    .filter(([, urls]) => urls.length > 1)
    .map(([value, urls]) => ({ value, urls }));

  const dupTitleUrls = new Set(duplicateTitleGroups.flatMap((g) => g.urls));
  const dupMetaUrls = new Set(duplicateMetaGroups.flatMap((g) => g.urls));
  for (const row of rows) {
    if (dupTitleUrls.has(row.url) && row.title) row.issues.push("duplicate-title");
    if (dupMetaUrls.has(row.url) && row.metaDescription) row.issues.push("duplicate-meta-description");
  }

  const summary: BulkImportSummary = {
    totalRows: rows.length,
    missingTitle: rows.filter((r) => r.issues.includes("missing-title")).length,
    duplicateTitles: dupTitleUrls.size,
    titleTooLong: rows.filter((r) => r.issues.includes("title-too-long")).length,
    missingMetaDescription: rows.filter((r) => r.issues.includes("missing-meta-description")).length,
    duplicateMetaDescriptions: dupMetaUrls.size,
    metaDescriptionTooLong: rows.filter((r) => r.issues.includes("meta-description-too-long")).length,
    missingH1: rows.filter((r) => r.issues.includes("missing-h1")).length,
    multipleH1: rows.filter((r) => r.issues.includes("multiple-h1")).length,
    thinContent: rows.filter((r) => r.issues.includes("thin-content")).length,
    brokenLinks: rows.filter((r) => r.issues.includes("broken")).length,
    redirects: rows.filter((r) => r.issues.includes("redirect")).length,
    nonIndexable: rows.filter((r) => r.issues.includes("non-indexable")).length,
    noindexTag: rows.filter((r) => r.issues.includes("noindex-tag")).length,
  };

  return {
    filename,
    importedAt: new Date().toISOString(),
    columns: header,
    summary,
    rows,
    duplicateTitleGroups,
    duplicateMetaGroups,
  };
}
