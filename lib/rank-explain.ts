/**
 * Sıralama değişiminin nedeni: iki kontroldeki Google ilk 10'u karşılaştırır (kodla, AI yok).
 * Veri her kontrolde SerpApi'nin zaten döndürdüğü sonuçlardan kaydedilir; ek arama harcanmaz.
 */

export interface SerpSnap {
  /** İlk 10 organik sonuç: sıra, alan adı, adres, başlık. */
  top: { p: number; d: string; u: string; t: string }[];
  /** Google bu aramada AI Overview gösterdi mi. */
  ai: boolean;
  /** "İnsanlar şunu da soruyor" soruları. */
  paa: string[];
}

export interface RankExplanation {
  lines: string[];
  /** Şu an senin üstündeki sonuçlar; was = önceki kontroldeki sırası (yoksa null = yeni girdi). */
  above: { p: number; d: string; u: string; t: string; was: number | null }[];
}

const clean = (d: string) => d.toLowerCase().replace(/^www\./, "");
const isOwn = (d: string, own: string) => clean(d) === clean(own) || clean(d).endsWith(`.${clean(own)}`);

export function explainMove(own: string, prevPos: number | null, curPos: number | null, prev: SerpSnap | null, cur: SerpSnap): RankExplanation {
  const cutoff = curPos && curPos <= 10 ? curPos : 11;
  const prevOf = (d: string) => prev?.top.find((x) => clean(x.d) === clean(d))?.p ?? null;
  const above = cur.top.filter((x) => x.p < cutoff && !isOwn(x.d, own)).map((x) => ({ ...x, was: prev ? prevOf(x.d) : null }));
  const lines: string[] = [];
  if (!prev) {
    lines.push("Karşılaştırma için bir sonraki kontrol bekleniyor; aşağıda Google'ın bugünkü ilk 10'u var.");
  } else {
    const a = prevPos ?? 101;
    const b = curPos ?? 101;
    const fmt = (x: number | null) => (x ? `${x}.` : "100+");
    if (b > a) lines.push(`${b - a > 90 ? "İlk 100'ün dışına düştün" : `${b - a} sıra düştün`} (${fmt(prevPos)} → ${fmt(curPos)}).`);
    else if (b < a) lines.push(`${a - b} sıra yükseldin (${fmt(prevPos)} → ${fmt(curPos)}).`);
    else lines.push(`Sıran değişmedi (${fmt(curPos)}).`);
    if (prevPos && prevPos <= 10 && (!curPos || curPos > 10)) lines.push("İlk sayfadan (ilk 10) çıktın: tıklamaların büyük kısmı burada.");
    const newcomers = above.filter((x) => x.was == null);
    const passed = above.filter((x) => x.was != null && prevPos != null && x.was > prevPos);
    if (newcomers.length) lines.push(`Üstüne yeni giren: ${newcomers.map((x) => `${x.d} (${x.p}.)`).join(", ")}.`);
    if (passed.length) lines.push(`Seni geçen: ${passed.map((x) => `${x.d} (${x.was}. → ${x.p}.)`).join(", ")}.`);
    if (cur.ai && !prev.ai) lines.push("Google bu aramada artık AI Overview gösteriyor: sıran aynı kalsa da tıklama azalabilir.");
    if (!cur.ai && prev.ai) lines.push("Google bu aramada AI Overview göstermeyi bıraktı.");
  }
  return { lines, above };
}
