import type { GeoRunResult } from "@/types";

/**
 * AI'ın aramaları (query fan-out): motorlar cevap yazarken web'de ne arıyor, bu aramaların hangisinde
 * markan cevaba girdi, hangisi için sitende karşılık gelen bir sayfa var? AI kullanmaz; sitenin adresleri
 * (sitemap) ile kelime örtüşmesine bakar.
 */

export interface FanoutQuery {
  query: string;
  count: number; // kaç cevapta arandı
  engines: string[];
  prompts: string[];
  ownMentionRate: number; // bu aramayı yapan cevaplarda markanın geçme oranı 0-1
  match: { url: string; score: number } | null;
}

const STOP = new Set(
  "ve ile için bir bu şu ne en mi mı mu mü da de ki nasıl nedir hangi neden kaç gibi olan the a an and or of for to in on with is are best vs what how which top 2024 2025 2026 2027".split(" ")
);
const fold = (s: string) =>
  s
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i");
export const tokens = (s: string) => [...new Set(fold(s).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)))];
const stem = (w: string) => w.slice(0, 5); // Türkçe ekleri kabaca at: 5 harflik kök (fiyatları ~ fiyatlar)

export function aggregateFanout(runs: GeoRunResult[]): FanoutQuery[] {
  const m = new Map<string, { q: string; n: number; e: Set<string>; p: Set<string>; own: number }>();
  for (const r of runs) {
    for (const raw of new Set((r.searchQueries ?? []).map((q) => q.trim()).filter(Boolean))) {
      const k = fold(raw).replace(/\s+/g, " ");
      const x = m.get(k) ?? { q: raw, n: 0, e: new Set(), p: new Set(), own: 0 };
      x.n++;
      x.e.add(r.engine);
      x.p.add(r.promptText);
      if (r.mentioned) x.own++;
      m.set(k, x);
    }
  }
  return [...m.values()]
    .map((x) => ({ query: x.q, count: x.n, engines: [...x.e], prompts: [...x.p], ownMentionRate: x.own / x.n, match: null }))
    .sort((a, b) => b.count - a.count || a.query.localeCompare(b.query));
}

/** Her arama için sitedeki en iyi örtüşen adres (slug kelimeleri). score = arama kelimelerinin yüzde kaçı adreste geçiyor. */
export function matchUrls(queries: string[], urls: string[], brandTokens: string[]): ({ url: string; score: number } | null)[] {
  const brand = new Set(brandTokens.map(fold));
  // shortcut: ilk 50.000 adres ve yalnızca URL yolu (sayfa başlığı değil); büyük sitelerde başlık indeksine geç
  const idx = urls.slice(0, 50_000).map((u) => {
    let path = u;
    try {
      path = decodeURIComponent(new URL(u).pathname);
    } catch {}
    return { u, stems: new Set(tokens(path.replace(/[-_/]/g, " ")).map(stem)) };
  });
  return queries.map((q) => {
    const t = tokens(q).filter((w) => !brand.has(w));
    if (!t.length) return null;
    const ts = t.map(stem);
    let best: { url: string; score: number } | null = null;
    for (const d of idx) {
      if (!d.stems.size) continue;
      const hit = ts.filter((s) => d.stems.has(s)).length;
      if (!hit) continue;
      const score = hit / ts.length;
      if (!best || score > best.score || (score === best.score && d.u.length < best.url.length)) best = { url: d.u, score };
    }
    return best && best.score >= 0.6 ? { url: best.url, score: Math.round(best.score * 100) } : null;
  });
}
