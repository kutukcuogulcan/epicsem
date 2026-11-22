/**
 * Görünürlük gibi oranların kaç cevaba dayandığı ve ne kadar güvenilir olduğu (Wilson %95 aralığı).
 * Peec aynı soruları her gün binlerce kez sorar; bizim testler birkaç düzine cevaptır — bunu açıkça söylemek için.
 */

export interface Confidence {
  n: number;
  /** ± yüzde puan (yarım aralık genişliği), yuvarlanmış. */
  margin: number;
  level: "çok az veri" | "az veri" | "yeterli";
  text: string;
}

export function confidenceOf(hits: number, n: number): Confidence | null {
  if (!n) return null;
  const z = 1.96;
  const p = hits / n;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n);
  const margin = Math.round(half * 100);
  const level = n < 10 ? "çok az veri" : n < 30 ? "az veri" : "yeterli";
  const text = level === "yeterli" ? `${n} cevaba dayanıyor (±${margin} puan)` : `Yalnızca ${n} cevaba dayanıyor (±${margin} puan); kesin sonuç için daha fazla test gerekir`;
  return { n, margin, level, text };
}
