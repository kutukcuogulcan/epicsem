/**
 * Anahtar gerektirmeyen backlink ve bahsetme kaynakları. Bing/Ahrefs bağlı olmasa da çalışır.
 *  - Wikipedia (tr + en): sitene link veren maddeler (MediaWiki exturlusage API, ücretsiz).
 *  - Hacker News (Algolia API, ücretsiz): siteni paylaşan gönderiler.
 *  - Reddit (herkese açık domain listesi): siteni paylaşan gönderiler. Reddit bulut IP'lerini
 *    bazen engeller; o zaman sessizce atlanır.
 *  - Haberler (GDELT DOC API, ücretsiz): markanın geçtiği haberler. Her haber çekilip sitene
 *    link verip vermediğine bakılır; link vermeyenler "link iste" fırsatıdır.
 *  - CSV içe aktarma: Search Console, Bing, Ahrefs Webmaster Tools gibi araçlardan indirilen
 *    link listeleri.
 */
import { rootHost, type RefDomain } from "@/lib/backlinks";

const UA = "Mozilla/5.0 (compatible; EpicsemBacklinks/1.0; +https://epicsem.com)";
const T = (ms: number) => AbortSignal.timeout(ms);

async function getJson(url: string, ms = 20_000): Promise<any> {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: T(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const blank = (domain: string, source: RefDomain["source"]): RefDomain => ({
  domain,
  dr: null,
  links: 0,
  dofollow: null,
  traffic: null,
  firstSeen: null,
  lostAt: null,
  spam: false,
  anchors: [],
  sampleUrl: null,
  targets: [],
  source,
  from: [],
});

const own = (u: string, host: string) => {
  const h = rootHost(u);
  return h === host || h.endsWith(`.${host}`);
};

// ---------------- Wikipedia ----------------
export async function wikipediaLinks(host: string): Promise<RefDomain[]> {
  const out: RefDomain[] = [];
  for (const lang of ["tr", "en"]) {
    const d = blank(`${lang}.wikipedia.org`, "wikipedia");
    const seen = new Set<string>();
    for (const proto of ["https", "http"]) {
      for (const q of [host, `*.${host}`]) {
        try {
          const j = await getJson(
            `https://${lang}.wikipedia.org/w/api.php?${new URLSearchParams({ action: "query", list: "exturlusage", euquery: q, euprotocol: proto, eunamespace: "0", eulimit: "100", euprop: "title|url", format: "json", origin: "*" })}`
          );
          for (const x of j?.query?.exturlusage ?? []) {
            const title = String(x.title ?? "");
            const target = String(x.url ?? "");
            if (!title || seen.has(`${title}|${target}`)) continue;
            seen.add(`${title}|${target}`);
            d.links++;
            const page = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
            if (!d.from!.some((f) => f.url === page) && d.from!.length < 30) d.from!.push({ url: page, title });
            if (target && !d.targets.includes(target) && d.targets.length < 5) d.targets.push(target);
          }
        } catch {
          /* bu sorgu atlanır */
        }
      }
    }
    if (d.links) {
      d.sampleUrl = d.from![0]?.url ?? null;
      d.dofollow = 0; // Wikipedia linkleri nofollow
      out.push(d);
    }
  }
  return out;
}

// ---------------- Hacker News ----------------
export async function hackerNewsLinks(host: string): Promise<RefDomain[]> {
  const j = await getJson(`https://hn.algolia.com/api/v1/search?${new URLSearchParams({ query: host, restrictSearchableAttributes: "url", hitsPerPage: "50" })}`);
  const d = blank("news.ycombinator.com", "hn");
  for (const h of j?.hits ?? []) {
    if (!h.url || !own(String(h.url), host)) continue;
    d.links++;
    if (d.from!.length < 30) d.from!.push({ url: `https://news.ycombinator.com/item?id=${h.objectID}`, title: String(h.title ?? h.url), date: h.created_at ?? null, score: Number(h.points ?? 0) });
    if (!d.targets.includes(h.url) && d.targets.length < 5) d.targets.push(String(h.url));
    if (h.created_at && (!d.firstSeen || h.created_at < d.firstSeen)) d.firstSeen = h.created_at;
  }
  if (!d.links) return [];
  d.sampleUrl = d.from![0]?.url ?? null;
  return [d];
}

// ---------------- Reddit ----------------
export async function redditLinks(host: string): Promise<RefDomain[]> {
  const j = await getJson(`https://www.reddit.com/domain/${encodeURIComponent(host)}/new.json?limit=100&raw_json=1`, 15_000);
  const d = blank("reddit.com", "reddit");
  for (const c of j?.data?.children ?? []) {
    const p = c?.data;
    if (!p?.url || !own(String(p.url), host)) continue;
    d.links++;
    const date = p.created_utc ? new Date(p.created_utc * 1000).toISOString() : null;
    if (d.from!.length < 30) d.from!.push({ url: `https://www.reddit.com${p.permalink}`, title: `r/${p.subreddit} · ${p.title}`, date, score: Number(p.score ?? 0) });
    if (!d.targets.includes(p.url) && d.targets.length < 5) d.targets.push(String(p.url));
    if (date && (!d.firstSeen || date < d.firstSeen)) d.firstSeen = date;
  }
  if (!d.links) return [];
  d.sampleUrl = d.from![0]?.url ?? null;
  return [d];
}

// ---------------- Haber bahsetmeleri (GDELT) ----------------
export interface Mention {
  url: string;
  title: string;
  domain: string;
  date: string | null;
  lang: string | null;
  /** true: sitene link var, false: link yok (fırsat), null: sayfa okunamadı. */
  linked: boolean | null;
}

/** Marka adı: alan adının ilk parçası (epicsem.com → epicsem). */
export const brandOf = (host: string) => host.split(".")[0];

const isPublicHttp = (u: string) => {
  try {
    const x = new URL(u);
    if (!/^https?:$/.test(x.protocol)) return false;
    const h = x.hostname;
    return h.includes(".") && !/^\d+\.\d+\.\d+\.\d+$/.test(h) && !h.includes(":") && !/(^|\.)(localhost|local|internal)$/.test(h);
  } catch {
    return false;
  }
};

export async function pageLinksTo(url: string, host: string): Promise<boolean | null> {
  if (!isPublicHttp(url)) return null;
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "tr,en;q=0.8" }, redirect: "follow", signal: T(10_000) });
    if (!r.ok) return null;
    const html = (await r.text()).slice(0, 2_000_000).toLowerCase();
    if (html.length < 500) return null;
    const h = host.toLowerCase().replace(/\./g, "\\.");
    return new RegExp(`href\\s*=\\s*["']?(https?:)?//([a-z0-9-]+\\.)*${h}`).test(html);
  } catch {
    return null;
  }
}

export async function newsMentions(host: string, brand: string, verify = 20): Promise<Mention[]> {
  const terms = [...new Set([host, brand].filter((t) => t && t.length >= 4))];
  if (!terms.length) return [];
  const query = terms.length > 1 ? `(${terms.map((t) => `"${t}"`).join(" OR ")})` : `"${terms[0]}"`;
  const j = await getJson(`https://api.gdeltproject.org/api/v2/doc/doc?${new URLSearchParams({ query, mode: "artlist", maxrecords: "75", timespan: "3months", sort: "datedesc", format: "json" })}`, 25_000);
  const seen = new Set<string>();
  const list: Mention[] = [];
  for (const a of j?.articles ?? []) {
    const url = String(a.url ?? "");
    const domain = rootHost(String(a.domain ?? url));
    if (!url || own(url, host) || seen.has(url)) continue;
    seen.add(url);
    const sd = String(a.seendate ?? "");
    const date = /^\d{8}T/.test(sd) ? `${sd.slice(0, 4)}-${sd.slice(4, 6)}-${sd.slice(6, 8)}` : null;
    list.push({ url, title: String(a.title ?? url), domain, date, lang: a.language ?? null, linked: null });
  }
  // İlk N haberi aç: sitene link var mı?
  const head = list.slice(0, verify);
  for (let i = 0; i < head.length; i += 5) {
    await Promise.all(head.slice(i, i + 5).map(async (m) => (m.linked = await pageLinksTo(m.url, host))));
  }
  return list;
}

/** Linkli haber bahsetmelerini referring domain olarak ekle. */
export function mentionsToDomains(ms: Mention[]): RefDomain[] {
  const agg = new Map<string, RefDomain>();
  for (const m of ms) {
    if (m.linked !== true) continue;
    const d = agg.get(m.domain) ?? blank(m.domain, "news");
    d.links++;
    if (d.from!.length < 10) d.from!.push({ url: m.url, title: m.title, date: m.date });
    d.sampleUrl ??= m.url;
    if (m.date && (!d.firstSeen || m.date < d.firstSeen)) d.firstSeen = m.date;
    agg.set(m.domain, d);
  }
  return [...agg.values()];
}

// ---------------- CSV içe aktarma ----------------
function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const looksLikeHost = (v: string) => /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/|$|:)/i.test(v.trim());

/**
 * Search Console ("En çok bağlantı veren siteler" / "Top linking sites"), Bing Webmaster,
 * Ahrefs Webmaster Tools, Semrush gibi dışa aktarmaları okur. Sütunlar başlıktan tahmin edilir.
 */
export function parseBacklinkCsv(text: string, host: string): { domains: RefDomain[]; rows: number; tool: string } {
  const clean = text.replace(/^\uFEFF/, "").replace(/\u0000/g, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("CSV boş görünüyor.");
  const first = lines[0];
  const sep = [",", ";", "\t"].map((s) => [s, first.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const head = splitCsvLine(first, sep).map((h) => h.toLowerCase());
  const rows = lines.slice(1, 50_001).map((l) => splitCsvLine(l, sep));
  const find = (re: RegExp) => head.findIndex((h) => re.test(h));

  const hostish = (i: number) => i >= 0 && rows.slice(0, 20).filter((r) => looksLikeHost(r[i] ?? "")).length >= Math.min(3, rows.length);
  let urlCol = [
    find(/(referring|source|kaynak|linking|from|link veren).*(url|adres)|^url$/),
    find(/referring page$|source page|kaynak sayfa|link veren sayfa/),
    find(/^site$|linking site|referring domain|^domain$|alan ad|bağlantı veren site|kaynak site|^source$/),
  ].find(hostish) ?? -1;
  if (urlCol < 0) {
    // Değerleri alan adına benzeyen ilk sütun
    urlCol = head.findIndex((_, i) => hostish(i));
  }
  if (urlCol < 0) throw new Error("CSV'de link veren site ya da sayfa sütunu bulunamadı.");
  const anchorCol = find(/anchor|bağlantı metni|link metni/);
  const drCol = find(/^dr$|domain rating|domain ascore|authority score|^as$/);
  const countCol = find(/linking pages|bağlantı veren sayfa|backlinks|^links$|link sayısı|bağlantılar$/);
  const targetCol = find(/target url|hedef (url|sayfa)|target page|^target$/);
  const nofollowCol = find(/nofollow/);

  const tool =
    head.some((h) => /domain rating/.test(h)) ? "Ahrefs" : head.some((h) => /ascore|authority score/.test(h)) ? "Semrush" : head.some((h) => /linking pages|bağlantı veren sayfa/.test(h)) ? "Search Console" : "CSV";

  const agg = new Map<string, RefDomain>();
  let n = 0;
  for (const r of rows) {
    const v = r[urlCol] ?? "";
    if (!looksLikeHost(v)) continue;
    const dom = rootHost(v);
    if (!dom || dom === host || dom.endsWith(`.${host}`)) continue;
    n++;
    const d = agg.get(dom) ?? blank(dom, "csv");
    const cnt = countCol >= 0 ? Number(String(r[countCol] ?? "").replace(/[^\d]/g, "")) : NaN;
    d.links += Number.isFinite(cnt) && cnt > 0 ? cnt : 1;
    if (drCol >= 0) {
      const dr = Number(String(r[drCol] ?? "").replace(",", "."));
      if (Number.isFinite(dr) && dr >= 0 && dr <= 100) d.dr = Math.max(d.dr ?? 0, dr);
    }
    if (anchorCol >= 0) {
      const a = (r[anchorCol] ?? "").trim();
      if (a && !d.anchors.includes(a) && d.anchors.length < 5) d.anchors.push(a);
    }
    if (targetCol >= 0) {
      const t = (r[targetCol] ?? "").trim();
      if (t && !d.targets.includes(t) && d.targets.length < 5) d.targets.push(t);
    }
    if (nofollowCol >= 0 && /true|yes|evet|1/i.test(r[nofollowCol] ?? "")) d.dofollow = d.dofollow ?? 0;
    if (/^https?:\/\//i.test(v) && d.from!.length < 10 && !d.from!.some((f) => f.url === v)) d.from!.push({ url: v, title: v });
    d.sampleUrl ??= /^https?:\/\//i.test(v) ? v : null;
    agg.set(dom, d);
  }
  if (!agg.size) throw new Error("CSV'de sitene link veren alan adı bulunamadı.");
  return { domains: [...agg.values()].sort((a, b) => b.links - a.links).slice(0, 5000), rows: n, tool };
}
