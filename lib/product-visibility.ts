import type { GeoRunResult } from "../types";
import { trLower } from "./text-match.ts";

/**
 * Ürün görünürlüğü (Peec'teki alışveriş görünürlüğünün karşılığı): AI cevaplarında hangi ÜRÜNLER öneriliyor.
 * AI yalnızca cevaplardaki ürün adlarını çıkarır (1 sorgu); sayım kodla yapılır — cevaplarda geçmeyen ad atılır.
 */
export interface ProductRow {
  name: string;
  brand: string;
  own: boolean;
  answers: number;
  engines: string[];
}

/** AI'a gidecek metin: markaların geçtiği cümleler (boyut sınırlı). */
export function productExcerpts(runs: GeoRunResult[], brandNames: string[], max = 14000): string {
  const names = brandNames.map(trLower).filter(Boolean);
  const out: string[] = [];
  let len = 0;
  for (const r of runs) {
    for (const s of r.responseText.split(/(?<=[.!?])\s+|\n+/)) {
      const t = s.trim();
      if (t.length < 12 || !names.some((n) => trLower(t).includes(n))) continue;
      if (len + t.length > max) return out.join("\n");
      out.push(t);
      len += t.length + 1;
    }
  }
  return out.join("\n");
}

export function productPrompt(brand: string, aliases: string[], competitors: string[], excerpts: string): string {
  return `Below are sentences from AI assistant answers (ChatGPT, Claude…) that mention brands. Extract the specific PRODUCTS / product lines that are recommended or named (e.g. "Pro Plan Sterilised", "Royal Canin Renal", "Axess kredi kartı") — not generic categories, not company names alone.
Tracked brands: ${brand}${aliases.length ? ` (its sub-brands: ${aliases.join(", ")})` : ""}; competitors: ${competitors.join(", ") || "—"}.
For each product give the exact name as written in the text and which brand it belongs to (use the tracked brand name "${brand}" for its sub-brands; "Diğer" if none of the tracked brands).
SENTENCES:
${excerpts}
Return ONLY JSON: {"products":[{"name":"exact product name as in the text","brand":"brand"}]}`;
}

/** AI'ın çıkardığı adları cevaplarda doğrular ve sayar; en çok anılan önce. */
export function countProducts(raw: Record<string, unknown>, runs: GeoRunResult[], ownBrand: string): ProductRow[] {
  const seen = new Set<string>();
  const rows: ProductRow[] = [];
  for (const p of Array.isArray(raw.products) ? raw.products : []) {
    const name = String((p as any)?.name ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
    const key = trLower(name);
    if (name.length < 3 || seen.has(key)) continue;
    seen.add(key);
    const hits = runs.filter((r) => trLower(r.responseText).includes(key));
    if (!hits.length) continue; // cevaplarda geçmiyorsa (AI uydurduysa) atılır
    const brand = String((p as any)?.brand ?? "Diğer").trim().slice(0, 60) || "Diğer";
    rows.push({ name, brand, own: trLower(brand) === trLower(ownBrand), answers: hits.length, engines: [...new Set(hits.map((r) => r.engine))] });
  }
  return rows.sort((a, b) => b.answers - a.answers).slice(0, 30);
}
