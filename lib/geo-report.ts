import type { GeoRunResult } from "../types";
import { analyzeRun, cleanDomain, type BrandRef } from "./geo-loss.ts";
import { confidenceOf, type Confidence } from "./sample-size.ts";
import { buildPerception, type PerceptionTerm } from "./brand-perception.ts";

/**
 * "AI neden seni önermiyor?" raporu — son GEO testinin cevaplarından kodla üretilir (AI yok):
 * kaybedilen sorular (motor motor kim kazandı), AI'ın aramaları, AI'ın baktığı ama seni anmayan
 * kaynaklar, marka algısı ve öncelikli işler. Uydurma yok: her satır gerçek bir cevaba dayanır.
 */

export interface LostQuestion {
  question: string;
  lost: number;
  total: number;
  engines: { engine: string; status: "won" | "mentioned" | "lost" | "empty"; winner: string | null; rank: number | null }[];
  searches: string[];
  sources: string[];
}

export interface GeoReport {
  answers: number;
  engines: string[];
  questions: number;
  visibility: number;
  winRate: number;
  confidence: Confidence | null;
  brands: { name: string; own: boolean; visibility: number; firsts: number }[];
  lost: LostQuestion[];
  wonQuestions: string[];
  gapSources: { domain: string; count: number; rivals: string[] }[];
  ownCitedIn: number;
  perception: { positives: PerceptionTerm[]; negatives: PerceptionTerm[] };
  actions: { title: string; why: string }[];
}

export function buildGeoReport(runs: GeoRunResult[], own: BrandRef, rivals: BrandRef[]): GeoReport {
  const real = runs.filter((r) => r.responseText);
  const analyzed = real.map((r) => ({ r, a: analyzeRun(r, own, rivals) }));
  const hits = analyzed.filter((x) => x.a.status === "won" || x.a.status === "mentioned").length;
  const wins = analyzed.filter((x) => x.a.status === "won").length;
  const n = analyzed.length || 1;

  // Marka tablosu: her marka kaç cevapta anıldı, kaçında ilk sırada.
  const all = [own, ...rivals.filter((b) => b.name)];
  const brands = all
    .map((b, i) => {
      let vis = 0;
      let firsts = 0;
      for (const { a } of analyzed) {
        if (i === 0) {
          if (a.ownRank) vis++;
          if (a.ownRank === 1) firsts++;
        } else {
          const rv = a.rivals.find((x) => x.name === b.name);
          if (rv) vis++;
          if (rv && rv.rank === 1) firsts++;
        }
      }
      return { name: b.name, own: i === 0, visibility: vis / n, firsts };
    })
    .sort((x, y) => y.visibility - x.visibility);

  // Soru bazında
  const byQ = new Map<string, typeof analyzed>();
  for (const x of analyzed) byQ.set(x.r.promptText, [...(byQ.get(x.r.promptText) ?? []), x]);
  const lost: LostQuestion[] = [];
  const wonQuestions: string[] = [];
  for (const [question, xs] of byQ) {
    const lostN = xs.filter((x) => x.a.status === "lost" || x.a.status === "empty").length;
    if (!lostN) {
      wonQuestions.push(question);
      continue;
    }
    lost.push({
      question,
      lost: lostN,
      total: xs.length,
      engines: xs.map((x) => ({ engine: x.r.engine, status: x.a.status, winner: x.a.rivals[0]?.name ?? null, rank: x.a.ownRank })),
      searches: [...new Set(xs.flatMap((x) => x.r.searchQueries ?? []))].slice(0, 6),
      sources: [...new Set(xs.flatMap((x) => x.a.sources))].slice(0, 6),
    });
  }
  lost.sort((a, b) => b.lost / b.total - a.lost / a.total || b.lost - a.lost);

  // Kaybedilen cevaplarda AI'ın baktığı dış siteler (kendi ve rakip siteleri hariç)
  const skip = new Set([cleanDomain(own.domain), ...rivals.map((r) => cleanDomain(r.domain))].filter(Boolean));
  const gap = new Map<string, { count: number; rivals: Set<string> }>();
  for (const { a } of analyzed) {
    if (a.status !== "lost" && a.status !== "empty") continue;
    for (const s of a.sources) {
      if (skip.has(s)) continue;
      const e = gap.get(s) ?? { count: 0, rivals: new Set<string>() };
      e.count++;
      a.rivals.forEach((r) => e.rivals.add(r.name));
      gap.set(s, e);
    }
  }
  const gapSources = [...gap.entries()].map(([domain, e]) => ({ domain, count: e.count, rivals: [...e.rivals].slice(0, 3) })).sort((a, b) => b.count - a.count).slice(0, 8);
  const ownCitedIn = analyzed.filter((x) => x.a.ownCited).length;

  const per = buildPerception(real, [own, ...rivals.slice(0, 5)])[0];
  const perception = { positives: per.terms.filter((t) => !t.negative).slice(0, 6), negatives: per.terms.filter((t) => t.negative).slice(0, 4) };

  // Öncelikli işler (veriden; her biri bir gerekçeyle)
  const actions: GeoReport["actions"] = [];
  for (const q of lost.slice(0, 3)) {
    const winners = [...new Set(q.engines.map((e) => e.winner).filter(Boolean))];
    actions.push({
      title: `"${q.question}" sorusunu doğrudan cevaplayan bir sayfa yayınla`,
      why: `${q.total} motorun ${q.lost} tanesinde anılmadın${winners.length ? `; öne çıkan: ${winners.join(", ")}` : ""}.${q.searches.length ? ` AI bunu ararken şunlara baktı: ${q.searches.slice(0, 3).join(" · ")}.` : ""}`,
    });
  }
  if (gapSources.length)
    actions.push({
      title: `AI'ın baktığı sitelerde anıl: ${gapSources.slice(0, 3).map((s) => s.domain).join(", ")}`,
      why: `Kaybettiğin cevaplarda AI en çok bu kaynaklara dayandı; bu kaynaklarla yazılan cevaplarda markan anılmadı${gapSources[0].rivals.length ? `, ${gapSources[0].domain} kaynaklı cevaplarda ${gapSources[0].rivals.join(", ")} öne çıktı` : ""}.`,
    });
  if (!ownCitedIn && analyzed.length)
    actions.push({ title: "Kendi siten hiç kaynak gösterilmedi", why: `${analyzed.length} cevabın hiçbirinde ${cleanDomain(own.domain)} kaynak olarak geçmedi: soruları cevap-önce, SSS ve kaynaklarla yanıtlayan sayfalar AI'ın alıntılayabileceği biçimde değil.` });
  if (perception.negatives.length)
    actions.push({ title: `Olumsuz algıyı kontrol et: ${perception.negatives.map((t) => `"${t.term}"`).join(", ")}`, why: "AI bu ifadeleri markanın geçtiği cümlelerde kullanıyor (cümlede başka markalar da olabilir; örneklere bak). Doğruysa çözümü anlatan, değilse düzelten içerik yayınla." });

  return {
    answers: analyzed.length,
    engines: [...new Set(real.map((r) => r.engine))],
    questions: byQ.size,
    visibility: hits / n,
    winRate: wins / n,
    confidence: confidenceOf(hits, analyzed.length),
    brands,
    lost,
    wonQuestions,
    gapSources,
    ownCitedIn,
    perception,
    actions: actions.slice(0, 6),
  };
}
