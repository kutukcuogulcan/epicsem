/**
 * Backlink verisi — iki kaynak:
 *  - Bing Webmaster (ücretsiz, kullanıcının doğrulanmış sitesi): sitene link veren sayfalar ve anchor metinleri.
 *  - Ahrefs API v3: Domain Rating (ücretsiz anahtarla), referring domains + rakip boşluğu (ücretli plan).
 * Sonuçlar lib/db.ts backlink_cache tablosunda 24 saat tutulur (Ahrefs API birimi harcamamak için).
 */

const T = (ms: number) => AbortSignal.timeout(ms);

export const rootHost = (u: string) => {
  try {
    return new URL(/^https?:/i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return u.replace(/^https?:\/\//i, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
  }
};

export interface RefDomain {
  domain: string;
  dr: number | null;
  links: number;
  dofollow: number | null;
  traffic: number | null;
  firstSeen: string | null;
  /** Ahrefs: link kaybedildiyse tarih. */
  lostAt: string | null;
  spam: boolean;
  anchors: string[];
  sampleUrl: string | null;
  targets: string[];
  source: "bing" | "ahrefs" | "wikipedia" | "hn" | "reddit" | "news" | "csv";
  /** Link veren sayfalar (ücretsiz kaynaklar ve CSV). */
  from?: { url: string; title: string; date?: string | null; score?: number }[];
}

// ---------------- Bing Webmaster ----------------
const BING = "https://ssl.bing.com/webmaster/api.svc/json";

const pick = (o: any, ...keys: string[]) => {
  for (const k of keys) if (o && o[k] !== undefined) return o[k];
  return undefined;
};

async function bingGet(apiKey: string, method: string, params: Record<string, string>) {
  const r = await fetch(`${BING}/${method}?${new URLSearchParams({ ...params, apikey: apiKey })}`, { signal: T(30_000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ErrorCode) throw new Error(`Bing: ${j.Message ?? `HTTP ${r.status}`}`);
  return j.d;
}

/**
 * Bing'in bildiği gelen linkler: önce en çok link alan sayfalar (GetLinkCounts), sonra bu
 * sayfalara link veren URL'ler (GetUrlLinks). Alan adına göre toplanır.
 */
export async function bingBacklinks(apiKey: string, siteUrl: string): Promise<{ domains: RefDomain[]; pages: { url: string; count: number }[]; totalLinks: number }> {
  const pages: { url: string; count: number }[] = [];
  for (let p = 0; p < 3; p++) {
    const d = await bingGet(apiKey, "GetLinkCounts", { siteUrl, page: String(p) });
    const links: any[] = pick(d, "Links", "links") ?? [];
    for (const l of links) pages.push({ url: String(pick(l, "Url", "url") ?? ""), count: Number(pick(l, "Count", "count") ?? 0) });
    const total = Number(pick(d, "TotalPages", "totalPages", "total_pages") ?? 1);
    if (p + 1 >= total) break;
  }
  pages.sort((a, b) => b.count - a.count);
  const own = rootHost(siteUrl);
  const agg = new Map<string, RefDomain>();
  let totalLinks = 0;
  for (const pg of pages.slice(0, 12)) {
    for (let p = 0; p < 2; p++) {
      let d: any;
      try {
        d = await bingGet(apiKey, "GetUrlLinks", { siteUrl, link: pg.url, page: String(p) });
      } catch {
        break;
      }
      const details: any[] = pick(d, "Details", "details") ?? [];
      for (const x of details) {
        const url = String(pick(x, "Url", "url") ?? "");
        const host = rootHost(url);
        if (!host || host === own || host.endsWith(`.${own}`)) continue;
        totalLinks++;
        const anchor = String(pick(x, "AnchorText", "anchorText", "anchor_text") ?? "").trim();
        const cur =
          agg.get(host) ??
          ({ domain: host, dr: null, links: 0, dofollow: null, traffic: null, firstSeen: null, lostAt: null, spam: false, anchors: [], sampleUrl: url, targets: [], source: "bing" } as RefDomain);
        cur.links++;
        if (anchor && !cur.anchors.includes(anchor) && cur.anchors.length < 5) cur.anchors.push(anchor);
        if (!cur.targets.includes(pg.url) && cur.targets.length < 5) cur.targets.push(pg.url);
        agg.set(host, cur);
      }
      const total = Number(pick(d, "TotalPages", "totalPages", "total_pages") ?? 1);
      if (p + 1 >= total) break;
    }
  }
  return { domains: [...agg.values()].sort((a, b) => b.links - a.links), pages: pages.slice(0, 50), totalLinks };
}

// ---------------- Ahrefs ----------------
const AHREFS = "https://api.ahrefs.com/v3";

async function ahrefs(apiKey: string, path: string, init: RequestInit & { query?: Record<string, string> } = {}) {
  const qs = init.query ? `?${new URLSearchParams(init.query)}` : "";
  const r = await fetch(`${AHREFS}${path}${qs}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
    body: init.body,
    signal: T(60_000),
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error("Ahrefs API anahtarı geçersiz.");
  if (r.status === 403) throw new Error("Bu Ahrefs verisi için ücretli API planı (Lite veya üstü) gerekiyor.");
  if (r.status === 429) throw new Error("Ahrefs API sınırına ulaşıldı — biraz sonra tekrar dene.");
  if (!r.ok) throw new Error(`Ahrefs: ${j?.error ?? j?.message ?? `HTTP ${r.status}`}`);
  return j;
}

/** Ücretsiz Domain Rating (ücretsiz Ahrefs anahtarıyla, birim harcamaz). En fazla 1000 alan adı. */
export async function ahrefsFreeDR(apiKey: string, domains: string[]): Promise<Record<string, number>> {
  const list = [...new Set(domains.filter(Boolean))].slice(0, 1000);
  if (!list.length) return {};
  const j = await ahrefs(apiKey, "/public/domain-rating-free", { method: "POST", body: JSON.stringify({ targets: list }) });
  const out: Record<string, number> = {};
  for (const t of j?.domain_rating?.targets ?? []) if (typeof t.domain_rating === "number") out[rootHost(String(t.target))] = t.domain_rating;
  return out;
}

export async function ahrefsRefDomains(apiKey: string, target: string, limit = 300): Promise<RefDomain[]> {
  const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  const j = await ahrefs(apiKey, "/site-explorer/referring-domains", {
    query: {
      target: rootHost(target),
      mode: "subdomains",
      history: `since:${since}`,
      select: "domain,domain_rating,links_to_target,dofollow_links,traffic_domain,first_seen,last_seen,is_spam",
      order_by: "domain_rating:desc",
      limit: String(limit),
    },
  });
  return (j.refdomains ?? []).map((d: any) => ({
    domain: String(d.domain),
    dr: typeof d.domain_rating === "number" ? d.domain_rating : null,
    links: Number(d.links_to_target ?? 0),
    dofollow: d.dofollow_links != null ? Number(d.dofollow_links) : null,
    traffic: d.traffic_domain != null ? Number(d.traffic_domain) : null,
    firstSeen: d.first_seen ?? null,
    lostAt: d.last_seen ?? null,
    spam: !!d.is_spam,
    anchors: [],
    sampleUrl: null,
    targets: [],
    source: "ahrefs" as const,
  }));
}

export interface GapDomain {
  domain: string;
  dr: number | null;
  traffic: number | null;
  /** Bu alan adının link verdiği rakipler. */
  linksTo: string[];
}

/** Rakiplere link veren ama sana vermeyen alan adları (Ahrefs "Link Intersect" mantığı). */
export async function ahrefsLinkGap(apiKey: string, own: string, competitors: string[]): Promise<{ gaps: GapDomain[]; checked: string[] }> {
  const mine = new Set((await ahrefsRefDomains(apiKey, own, 1000)).filter((d) => !d.lostAt).map((d) => d.domain));
  const comps = [...new Set(competitors.map(rootHost).filter((c) => c && c !== rootHost(own)))].slice(0, 4);
  const agg = new Map<string, GapDomain>();
  for (const c of comps) {
    const list = await ahrefsRefDomains(apiKey, c, 500);
    for (const d of list) {
      if (d.lostAt || d.spam || mine.has(d.domain) || d.domain === rootHost(own) || comps.includes(d.domain)) continue;
      const cur = agg.get(d.domain) ?? { domain: d.domain, dr: d.dr, traffic: d.traffic, linksTo: [] };
      if (!cur.linksTo.includes(c)) cur.linksTo.push(c);
      agg.set(d.domain, cur);
    }
  }
  const gaps = [...agg.values()].sort((a, b) => b.linksTo.length - a.linksTo.length || (b.dr ?? 0) - (a.dr ?? 0)).slice(0, 300);
  return { gaps, checked: comps };
}
