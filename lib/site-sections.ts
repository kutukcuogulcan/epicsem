/**
 * Sitenin bütün adreslerini (sitemap) bölümlere ayırır: /kedi/kedi-mamasi/… → "kedi / kedi mamasi".
 * GEO konu üretimine ve Site Gezgini'ne "sitede neler var" bilgisini verir. Saf, ağ yok.
 */

export interface SiteSection {
  path: string;
  label: string;
  count: number;
  sample: string[];
}

const NOISE = /^(tag|tags|etiket|author|yazar|page|sayfa|wp-|feed|amp|search|arama|cdn-cgi|static|assets|uploads|media|cart|sepet|checkout|hesabim|account|login|giris)/i;
const label = (seg: string) =>
  decodeURIComponent(seg)
    .replace(/[-_]+/g, " ")
    .replace(/\.(html?|php|aspx?)$/i, "")
    .trim();

export function sectionsFromUrls(urls: string[], host: string, max = 80): { total: number; sections: SiteSection[] } {
  const h = host.toLowerCase().replace(/^www\./, "");
  const paths: string[][] = [];
  for (const u of urls) {
    try {
      const x = new URL(u);
      if (x.hostname.toLowerCase().replace(/^www\./, "") !== h) continue;
      const segs = x.pathname.split("/").filter(Boolean);
      if (segs.length && NOISE.test(segs[0])) continue;
      paths.push(segs);
    } catch {
      /* geçersiz adres */
    }
  }
  const by = new Map<string, { segs: string[]; urls: string[] }>();
  const add = (key: string[], u: string[]) => {
    const k = `/${key.join("/")}`;
    const e = by.get(k) ?? { segs: key, urls: [] };
    e.urls.push(`/${u.join("/")}`);
    by.set(k, e);
  };
  // Önce birinci segmente göre; kalabalık (20+) ve çoğu alt klasörde olan bölüm ikinci segmente göre bölünür.
  const first = new Map<string, string[][]>();
  for (const p of paths) {
    if (!p.length) continue; // ana sayfa
    first.set(p[0], [...(first.get(p[0]) ?? []), p]);
  }
  for (const [seg, list] of first) {
    const deep = list.filter((p) => p.length >= 3);
    if (list.length >= 20 && deep.length >= list.length * 0.5) {
      for (const p of list) add(p.length >= 3 ? [seg, p[1]] : [seg], p);
    } else for (const p of list) add([seg], p);
  }
  const sections = [...by.entries()]
    .map(([path, e]) => ({ path, label: e.segs.map(label).join(" / "), count: e.urls.length, sample: e.urls.slice(0, 3) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, max);
  return { total: paths.length, sections };
}

/** GEO konu üretimi için tohum: en kalabalık, anlamlı bölümlerin adları (kurumsal/yasal sayfalar hariç). */
export function sectionSeeds(sections: SiteSection[], max = 40): string[] {
  const corp = /(gizlilik|kvkk|cerez|çerez|sartlar|şartlar|kosullar|koşullar|iletisim|iletişim|hakkimizda|hakkımızda|kariyer|privacy|terms|cookie|contact|about|careers|basin|basın)/i;
  // Kalabalık bölümler önce, sonra kökteki tek sayfalar (çoğu sitede ürün / hizmet sayfaları: /e-fatura, /on-muhasebe).
  const ok = sections.filter((s) => !corp.test(s.path));
  const groups = ok.filter((s) => s.count >= 2);
  const rootPages = ok.filter((s) => s.count === 1 && s.path.split("/").length === 2);
  return [...groups, ...rootPages].map((s) => s.label).slice(0, max);
}
