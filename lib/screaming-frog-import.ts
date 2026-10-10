import type { BulkImportResult } from "@/types";
import { buildBulkResult, type RawBulkRow } from "@/lib/bulk-analysis";

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

  const raw: RawBulkRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const line = table[r];
    if (!line || line.every((c) => c.trim() === "")) continue;
    const get = (field: string) => (col[field] !== undefined ? line[col[field]]?.trim() ?? "" : "");
    const url = get("url");
    if (!url) continue;
    const indexabilityRaw = get("indexability").toLowerCase();
    const title = get("title") || null;
    const metaDescription = get("metaDescription") || null;
    raw.push({
      url,
      statusCode: toInt(get("statusCode")),
      indexable: indexabilityRaw ? indexabilityRaw === "indexable" : null,
      title,
      titleLength: toInt(get("titleLength")) ?? (title ? title.length : null),
      metaDescription,
      metaDescriptionLength: toInt(get("metaDescriptionLength")) ?? (metaDescription ? metaDescription.length : null),
      h1: get("h1") || null,
      h1Count: (get("h1") ? 1 : 0) + (get("h1Second") ? 1 : 0),
      wordCount: toInt(get("wordCount")),
      canonical: get("canonical") || null,
      metaRobots: get("metaRobots") || null,
    });
  }
  return buildBulkResult(raw, filename, header);
}
