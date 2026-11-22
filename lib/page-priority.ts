import type { BulkImportRow } from "../types";
import { ISSUE_LABEL, ISSUE_SEVERITY } from "./bulk-labels.ts";

/**
 * Site Gezgini: "hangi sayfayı önce düzeltmeliyim?" Sorun yükü (hata 3, uyarı 1.5, bildirim 0.3) ×
 * sayfanın önemi (gelen iç link, ana sayfaya yakınlık, site haritası, ana sayfa). Kodla, AI yok.
 */

const SEV_W = { error: 3, warning: 1.5, notice: 0.3 } as const;

export interface PagePriority {
  url: string;
  score: number;
  /** Neden önemli (kısa): iç link, derinlik. */
  why: string;
  /** En ağır sorunlar (ağırlığa göre), Türkçe adlarıyla. */
  issues: { code: string; label: string; sev: keyof typeof SEV_W }[];
}

export function pagePriority(row: BulkImportRow): PagePriority {
  const m = row.metrics;
  const issues = row.issues
    .map((code) => ({ code, label: ISSUE_LABEL[code] ?? code, sev: ISSUE_SEVERITY[code] ?? "notice" }))
    .sort((a, b) => SEV_W[b.sev] - SEV_W[a.sev]);
  const load = issues.reduce((s, i) => s + SEV_W[i.sev], 0);
  let home = false;
  try {
    home = new URL(row.url).pathname.replace(/\/+$/, "") === "";
  } catch {}
  const inl = m?.inlinks ?? 0;
  const depth = m?.depth ?? null;
  const importance = 1 + Math.log2(1 + inl) + (depth == null ? 0 : depth <= 1 ? 2 : depth === 2 ? 1 : 0) + (m?.inSitemap ? 0.5 : 0) + (home ? 2 : 0);
  const why = [home ? "Ana sayfa" : null, m ? `${inl} iç link alıyor` : null, depth != null && !home ? `ana sayfadan ${depth} tık` : null].filter(Boolean).join(" · ");
  return { url: row.url, score: load ? Math.round(load * importance * 10) / 10 : 0, why, issues };
}

/** Düzeltilecek sayfalar, öncelik sırasıyla (sorunsuzlar hariç). */
export const prioritizedPages = (rows: BulkImportRow[]) =>
  rows.map(pagePriority).filter((p) => p.score > 0).sort((a, b) => b.score - a.score);
