import { sitePagesForLinks } from "./article-enrich";
import { ahrefsRefDomains, rootHost, type RefDomain } from "./backlinks";
import { hackerNewsLinks, redditLinks, wikipediaLinks } from "./free-backlinks";
import { communityMentions, type CommunitySiteId } from "./community-search";

/**
 * Link kazanma planı — rakiplerin hangi içeriklerle link aldığını çıkarır (çoğu ücretsiz kaynak):
 *  - Rakibin sitemap'i → içerik türleri (rehber, liste, karşılaştırma, istatistik, araç, sözlük…)
 *  - Rakibe link veren siteler: Wikipedia, Reddit, Hacker News (ücretsiz) + Ahrefs bağlıysa ref. domainler
 *  - Link alan rakip sayfaları (kaynakların hedef URL'leri)
 * Sonra AI (1 sorgu) bu verilerle yazılacak 5 "link çeken" yazı önerir: hedef kelime, anchor planı,
 * link istenecek siteler (yalnızca verilen listeden) ve içeriden link verecek sayfalar.
 */

import { assetType, type AssetType } from "./link-plan-types";
export { ASSET_LABEL, assetType } from "./link-plan-types";
export type { AssetType, LinkIdea } from "./link-plan-types";

export interface CompetitorLinkProfile {
  domain: string;
  pages: number;
  types: Partial<Record<AssetType, number>>;
  refDomains: { domain: string; source: string; target: string | null; dr: number | null }[];
  topPages: { url: string; type: AssetType; linkers: string[] }[];
  samplePages: { url: string; title: string; type: AssetType }[];
  /** Rakibin linklendiği topluluk konuları (Reddit, Hacker News) ve Wikipedia maddeleri — site bazında değil, konu bazında. Eski önbellekte yok. */
  community?: CommunityThread[];
}

export interface CommunityThread {
  /** reddit/hn/wikipedia: rakibe link veren konu. Diğerleri: rakibin konuşulduğu sayfa (Google araması, link şart değil). */
  source: "reddit" | "hn" | "wikipedia" | CommunitySiteId;
  url: string;
  title: string;
  /** Reddit: r/alt, HN/Wikipedia: boş. */
  where: string | null;
  date: string | null;
  score: number | null;
  /** Rakibin linklenen sayfası (bilindiğinde). */
  target: string | null;
}

const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T) => Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

export async function competitorProfile(userId: number, domain: string, ahrefsKey?: string | null, brandName?: string): Promise<CompetitorLinkProfile> {
  const host = rootHost(domain);
  const name = brandName?.trim() || host.split(".")[0];
  const [pages, wiki, reddit, hn, ah, mentions] = await Promise.all([
    withTimeout(sitePagesForLinks(userId, host, 300), 15000, [] as { title: string; url: string }[]),
    withTimeout(wikipediaLinks(host), 12000, [] as RefDomain[]),
    withTimeout(redditLinks(host), 12000, [] as RefDomain[]),
    withTimeout(hackerNewsLinks(host), 12000, [] as RefDomain[]),
    ahrefsKey ? withTimeout(ahrefsRefDomains(ahrefsKey, host, 60), 20000, [] as RefDomain[]) : Promise.resolve([] as RefDomain[]),
    withTimeout(communityMentions(name, host), 75000, []),
  ]);
  const types: Partial<Record<AssetType, number>> = {};
  const samplePages = pages.map((p) => ({ url: p.url, title: p.title, type: assetType(`${p.url} ${p.title}`) }));
  for (const p of samplePages) types[p.type] = (types[p.type] ?? 0) + 1;

  const refs = [...wiki, ...reddit, ...hn, ...ah];
  const refDomains = refs
    .filter((r) => !r.spam)
    .slice(0, 80)
    .map((r) => ({ domain: r.domain, source: r.source, target: r.targets?.[0] ?? null, dr: r.dr }));
  // Link alan sayfalar: kaynakların hedef URL'leri
  const byTarget = new Map<string, Set<string>>();
  for (const r of refs) for (const t of r.targets ?? []) {
    if (!byTarget.has(t)) byTarget.set(t, new Set());
    byTarget.get(t)!.add(r.domain);
  }
  const topPages = [...byTarget.entries()]
    .map(([url, s]) => ({ url, type: assetType(url), linkers: [...s].slice(0, 8) }))
    .sort((a, b) => b.linkers.length - a.linkers.length)
    .slice(0, 10);
  const community: CommunityThread[] = [...wiki, ...reddit, ...hn].flatMap((r) =>
    (r.from ?? []).map((f) => {
      const src = r.source as CommunityThread["source"];
      const m = src === "reddit" ? f.title.match(/^r\/([^\s·]+)\s*·\s*(.*)$/) : null;
      return { source: src, url: f.url, title: m ? m[2] : f.title, where: m ? `r/${m[1]}` : null, date: f.date ?? null, score: f.score ?? null, target: f.target ?? r.targets?.[0] ?? null };
    })
  );
  for (const m of mentions) community.push({ source: m.site, url: m.url, title: m.title, where: null, date: null, score: null, target: null });
  return { domain: host, pages: pages.length, types, refDomains, topPages, samplePages: samplePages.filter((p) => p.type !== "other").slice(0, 40), community: community.slice(0, 80) };
}

