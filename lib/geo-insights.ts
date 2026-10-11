import { brandMentioned, trLower } from "./text-match";
import type { GeoRunResult } from "@/types";

/**
 * GEO testinden AI KULLANMADAN türetilen içgörüler:
 *  - Rakip karşılaştırma kartları (battlecard): her rakip için "nerede kazanıyor, nerede kaybediyoruz".
 *  - Fırsatlar (niş keşfi): markanın hiç geçmediği, rakiplerin kazandığı ve kimsenin sahiplenmediği sorular.
 * Girdi: /api/geo'nun döndürdüğü runs (prompt × motor) + marka/rakip listesi.
 */

export interface BrandRef {
  name: string;
  domain: string;
}

const cleanDomain = (d: string) => d.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();

function mentionIndex(text: string, b: BrandRef): number {
  const folded = trLower(text);
  const i = folded.indexOf(trLower(b.name));
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}

function mentions(run: GeoRunResult, b: BrandRef, isOwn: boolean): boolean {
  if (isOwn) return run.mentioned;
  return brandMentioned(run.responseText, { name: b.name });
}

interface PromptGroup {
  prompt: string;
  topic: string;
  runs: GeoRunResult[];
}

function groupByPrompt(runs: GeoRunResult[]): PromptGroup[] {
  const m = new Map<string, PromptGroup>();
  for (const r of runs) {
    const g = m.get(r.promptText) ?? { prompt: r.promptText, topic: r.topic || "Genel", runs: [] };
    g.runs.push(r);
    m.set(r.promptText, g);
  }
  return [...m.values()];
}

// ---------------- Rakip kartları ----------------

export interface Battlecard {
  competitor: BrandRef;
  /** Rakibin geçtiği sohbet oranı (0-1). */
  theirRate: number;
  /** Bizim geçtiğimiz sohbet oranı (0-1). */
  ourRate: number;
  /** Rakip var, biz yokuz. */
  theyWin: { prompt: string; topic: string; engines: string[] }[];
  /** Biz varız, rakip yok. */
  weWin: { prompt: string; topic: string; engines: string[] }[];
  /** İkimiz de varız — kim önce geçiyor. */
  bothAhead: number;
  bothBehind: number;
  /** Rakibin kazandığı cevaplarda en çok alıntılanan kaynaklar. */
  theirSources: { domain: string; count: number }[];
  /** Rakibin kendi sitesinin kaç kez kaynak gösterildiği. */
  theirDomainCited: number;
  /** Konu bazında: rakibin önde olduğu konular. */
  topicsTheyLead: { topic: string; them: number; us: number }[];
  /** Yapılacaklar (kural tabanlı). */
  actions: string[];
  verdict: "önde" | "başa baş" | "geride";
}

export function buildBattlecards(runs: GeoRunResult[], own: BrandRef, competitors: BrandRef[]): Battlecard[] {
  const total = runs.length || 1;
  const groups = groupByPrompt(runs);
  return competitors.map((comp) => {
    const theyWin: Battlecard["theyWin"] = [];
    const weWin: Battlecard["weWin"] = [];
    let bothAhead = 0;
    let bothBehind = 0;
    let theirCount = 0;
    let ourCount = 0;
    const srcCount = new Map<string, number>();
    let theirDomainCited = 0;
    const topicAgg = new Map<string, { them: number; us: number; n: number }>();

    for (const g of groups) {
      const tw: string[] = [];
      const ww: string[] = [];
      for (const r of g.runs) {
        const us = mentions(r, own, true);
        const them = mentions(r, comp, false);
        if (us) ourCount++;
        if (them) theirCount++;
        const t = topicAgg.get(g.topic) ?? { them: 0, us: 0, n: 0 };
        t.n++;
        if (us) t.us++;
        if (them) t.them++;
        topicAgg.set(g.topic, t);
        for (const c of r.citations) if (cleanDomain(c.domain) === cleanDomain(comp.domain)) theirDomainCited++;
        if (them && !us) {
          tw.push(r.engine);
          for (const c of r.citations) {
            const d = cleanDomain(c.domain);
            if (d === cleanDomain(own.domain)) continue;
            srcCount.set(d, (srcCount.get(d) ?? 0) + 1);
          }
        } else if (us && !them) ww.push(r.engine);
        else if (us && them) {
          if (mentionIndex(r.responseText, own) <= mentionIndex(r.responseText, comp)) bothAhead++;
          else bothBehind++;
        }
      }
      if (tw.length) theyWin.push({ prompt: g.prompt, topic: g.topic, engines: tw });
      if (ww.length) weWin.push({ prompt: g.prompt, topic: g.topic, engines: ww });
    }

    const theirRate = theirCount / total;
    const ourRate = ourCount / total;
    const topicsTheyLead = [...topicAgg.entries()]
      .map(([topic, v]) => ({ topic, them: v.them / v.n, us: v.us / v.n }))
      .filter((t) => t.them > t.us)
      .sort((a, b) => b.them - b.us - (a.them - a.us))
      .slice(0, 5);
    const theirSources = [...srcCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([domain, count]) => ({ domain, count }));

    const actions: string[] = [];
    if (theyWin.length) actions.push(`Rakibin tek başına önerildiği ${theyWin.length} soru için doğrudan cevap veren bir sayfa/yazı yayınla (Fırsatlar sekmesinden tek tıkla).`);
    if (topicsTheyLead[0]) actions.push(`"${topicsTheyLead[0].topic}" konusunda rakip önde — bu konuda karşılaştırma tablosu ve SSS içeren bir rehber hazırla.`);
    const ugc = theirSources.find((s) => /reddit|youtube|eksisozluk|ekşisözlük|quora|sikayetvar|forum/i.test(s.domain));
    if (ugc) actions.push(`Rakibin cevaplarında ${ugc.domain} sık alıntılanıyor — orada markanın görünür olması (yorum, içerik, topluluk) gerekiyor.`);
    const editorial = theirSources.find((s) => s !== ugc);
    if (editorial) actions.push(`${editorial.domain} rakibi alıntılıyor; bu siteye haber/içerik ortaklığı ya da listeye girme için ulaş.`);
    if (theirDomainCited > 0 && !actions.some((a) => a.includes("karşılaştırma"))) actions.push(`Rakibin kendi sitesi ${theirDomainCited} kez kaynak gösterildi — senin ilgili sayfalarının Site Taraması'ndaki alıntılanabilirlik puanını yükselt.`);
    if (bothBehind > bothAhead) actions.push("İkinizin de geçtiği cevaplarda rakip daha önce anılıyor — ürün sayfalarına net fiyat, özellik ve karşılaştırma bilgisi ekle.");
    if (!actions.length) actions.push("Bu rakibe karşı önde görünüyorsun — kazandığın sorulardaki içerikleri güncel tut.");

    const diff = ourRate - theirRate;
    return {
      competitor: comp,
      theirRate,
      ourRate,
      theyWin: theyWin.sort((a, b) => b.engines.length - a.engines.length),
      weWin: weWin.sort((a, b) => b.engines.length - a.engines.length),
      bothAhead,
      bothBehind,
      theirSources,
      theirDomainCited,
      topicsTheyLead,
      actions: actions.slice(0, 4),
      verdict: diff > 0.05 ? "önde" : diff < -0.05 ? "geride" : "başa baş",
    };
  });
}

// ---------------- Fırsatlar (niş keşfi) ----------------

export type OpportunityKind = "competitor-owned" | "unclaimed" | "weak" | "strong";

export interface Opportunity {
  prompt: string;
  topic: string;
  kind: OpportunityKind;
  /** Bizim geçtiğimiz motor oranı (0-1). */
  ourRate: number;
  /** Bu soruda en çok geçen rakip ve oranı. */
  leader: { name: string; rate: number } | null;
  /** Bu sorunun cevaplarında en çok alıntılanan kaynak. */
  topSource: string | null;
  engines: number;
  /** Önem sırası için kaba puan. */
  priority: number;
}

export const OPPORTUNITY_LABEL: Record<OpportunityKind, string> = {
  "competitor-owned": "Rakip sahiplenmiş",
  unclaimed: "Boş alan",
  weak: "Zayıf",
  strong: "Güçlü",
};

export function findOpportunities(runs: GeoRunResult[], own: BrandRef, competitors: BrandRef[]): Opportunity[] {
  return groupByPrompt(runs)
    .map((g) => {
      const n = g.runs.length || 1;
      const ourRate = g.runs.filter((r) => r.mentioned).length / n;
      let leader: Opportunity["leader"] = null;
      for (const c of competitors) {
        const rate = g.runs.filter((r) => mentions(r, c, false)).length / n;
        if (rate > 0 && (!leader || rate > leader.rate)) leader = { name: c.name, rate };
      }
      const src = new Map<string, number>();
      for (const r of g.runs) for (const c of r.citations) src.set(cleanDomain(c.domain), (src.get(cleanDomain(c.domain)) ?? 0) + 1);
      const topSource = [...src.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const branded = g.runs.some((r) => r.branded);
      const kind: OpportunityKind =
        ourRate === 0 && leader ? "competitor-owned" : ourRate === 0 ? "unclaimed" : ourRate < 0.5 ? "weak" : "strong";
      const priority =
        (kind === "competitor-owned" ? 3 : kind === "unclaimed" ? 2.5 : kind === "weak" ? 1.5 : 0) + (leader?.rate ?? 0) - (branded ? 1 : 0);
      return { prompt: g.prompt, topic: g.topic, kind, ourRate, leader, topSource, engines: g.runs.length, priority };
    })
    .sort((a, b) => b.priority - a.priority);
}

/** Konu bazında fırsat haritası: her konu için kaç soruda yokuz. */
export function opportunityTopics(ops: Opportunity[]): { topic: string; missing: number; total: number; competitorOwned: number }[] {
  const m = new Map<string, { topic: string; missing: number; total: number; competitorOwned: number }>();
  for (const o of ops) {
    const t = m.get(o.topic) ?? { topic: o.topic, missing: 0, total: 0, competitorOwned: 0 };
    t.total++;
    if (o.ourRate === 0) t.missing++;
    if (o.kind === "competitor-owned") t.competitorOwned++;
    m.set(o.topic, t);
  }
  return [...m.values()].sort((a, b) => b.missing / b.total - a.missing / a.total || b.total - a.total);
}
