import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getBacklinkCache, getIntegration, setBacklinkCache } from "@/lib/db";
import { bingSites } from "@/lib/bing";
import { ahrefsFreeDR, ahrefsRefDomains, bingBacklinks, rootHost, type RefDomain } from "@/lib/backlinks";
import { brandOf, hackerNewsLinks, mentionsToDomains, newsMentions, redditLinks, wikipediaLinks, type Mention } from "@/lib/free-backlinks";

interface Sources {
  bing: boolean;
  ahrefs: boolean;
  free: boolean;
  /** İçe aktarılan CSV'deki alan adı sayısı (0 = yok). */
  imported: number;
}
interface Payload {
  site: string;
  sources: Sources;
  domains: RefDomain[];
  pages: { url: string; count: number }[];
  mentions: Mention[];
  errors: string[];
  notes: string[];
  cachedAt: string | null;
  drLicense: boolean;
}
export interface ImportData {
  domains: RefDomain[];
  tool: string;
  rows: number;
  fileName: string | null;
}

/** Aynı alan adı birden çok kaynaktan gelirse birleştir. */
function merge(into: Map<string, RefDomain>, d: RefDomain) {
  const cur = into.get(d.domain);
  if (!cur) return void into.set(d.domain, d);
  const from = [...(cur.from ?? []), ...(d.from ?? [])].filter((f, i, a) => a.findIndex((x) => x.url === f.url) === i).slice(0, 30);
  into.set(d.domain, {
    ...cur,
    ...(cur.source === "ahrefs" ? {} : { dr: cur.dr ?? d.dr, traffic: cur.traffic ?? d.traffic, lostAt: cur.lostAt ?? d.lostAt, spam: cur.spam || d.spam }),
    links: Math.max(cur.links, d.links),
    anchors: [...new Set([...cur.anchors, ...d.anchors])].slice(0, 5),
    targets: [...new Set([...cur.targets, ...d.targets])].slice(0, 5),
    sampleUrl: cur.sampleUrl ?? d.sampleUrl,
    firstSeen: [cur.firstSeen, d.firstSeen].filter(Boolean).sort()[0] ?? null,
    from,
  });
}

/**
 * GET /api/backlinks?site=domain.com[&refresh=1]
 * Ücretsiz kaynaklar (Wikipedia, Hacker News, Reddit, haberler) + içe aktarılan CSV her zaman;
 * Bing Webmaster ve Ahrefs bağlıysa onlar da eklenir.
 */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const site = rootHost(req.nextUrl.searchParams.get("site") ?? "");
  const [bingI, ahrefsI] = await Promise.all([getIntegration(user.id, "bing"), getIntegration(user.id, "ahrefs")]);
  const impRaw = site ? await getBacklinkCache<ImportData>(user.id, `import:${site}`, 24 * 3650) : null;
  const imp = impRaw?.data.domains?.length ? impRaw : null;
  const sources: Sources = { bing: !!bingI?.secrets.apiKey, ahrefs: !!ahrefsI?.secrets.apiKey, free: true, imported: imp?.data.domains.length ?? 0 };
  if (!site) return NextResponse.json({ sources });

  const key = `all2:${site}:${+sources.bing}${+sources.ahrefs}:${imp?.createdAt ?? "-"}`;
  if (req.nextUrl.searchParams.get("refresh") !== "1") {
    const c = await getBacklinkCache<Payload>(user.id, key);
    if (c) return NextResponse.json({ ...c.data, sources, cachedAt: c.createdAt });
  }
  const rl = rateLimit(`backlinks:${user.id}`, 10, 60 * 60 * 1000);
  if (!rl.allowed) return NextResponse.json({ error: "Saatte en fazla 10 backlink yenilemesi yapılabilir." }, { status: 429 });

  const errors: string[] = [];
  const notes: string[] = [];
  const byDomain = new Map<string, RefDomain>();
  let pages: { url: string; count: number }[] = [];
  let mentions: Mention[] = [];

  // Ücretsiz kaynaklar paralel
  const [wiki, hn, reddit, news] = await Promise.allSettled([wikipediaLinks(site), hackerNewsLinks(site), redditLinks(site), newsMentions(site, brandOf(site))]);
  if (wiki.status === "fulfilled") wiki.value.forEach((d) => merge(byDomain, d));
  if (hn.status === "fulfilled") hn.value.forEach((d) => merge(byDomain, d));
  if (reddit.status === "fulfilled") reddit.value.forEach((d) => merge(byDomain, d));
  else notes.push("Reddit şu an yanıt vermedi; Reddit gönderileri bu taramada yok.");
  if (news.status === "fulfilled") {
    mentions = news.value;
    mentionsToDomains(mentions).forEach((d) => merge(byDomain, d));
  } else notes.push("Haber taraması (GDELT) şu an yanıt vermedi; biraz sonra yenile.");

  if (imp) imp.data.domains.forEach((d) => merge(byDomain, d));

  if (sources.bing) {
    try {
      const all = await bingSites(bingI!.secrets.apiKey);
      const match = all.find((s) => rootHost(s.url) === site);
      if (!match) errors.push(`Bing Webmaster hesabında ${site} yok — siteyi Bing'e ekleyip doğrula.`);
      else {
        const b = await bingBacklinks(bingI!.secrets.apiKey, match.url);
        pages = b.pages;
        b.domains.forEach((d) => merge(byDomain, d));
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "Bing hatası");
    }
  }

  let drLicense = false;
  if (sources.ahrefs) {
    const k = ahrefsI!.secrets.apiKey;
    try {
      for (const d of await ahrefsRefDomains(k, site, 500)) {
        const cur = byDomain.get(d.domain);
        byDomain.set(d.domain, cur ? { ...d, anchors: cur.anchors, sampleUrl: cur.sampleUrl, targets: cur.targets, from: cur.from, links: Math.max(d.links, cur.links) } : d);
      }
      drLicense = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ahrefs hatası";
      if (/ücretli/.test(msg) && byDomain.size) {
        try {
          const dr = await ahrefsFreeDR(k, [...byDomain.keys()]);
          for (const [dom, v] of Object.entries(dr)) {
            const cur = byDomain.get(dom);
            if (cur) cur.dr = v;
          }
          drLicense = true;
        } catch {
          /* yoksay */
        }
        notes.push("Ahrefs ücretsiz anahtarla sadece Domain Rating geliyor; tam backlink listesi için Ahrefs Lite+ gerekir.");
      } else errors.push(msg);
    }
  }

  const payload: Payload = {
    site,
    sources,
    domains: [...byDomain.values()].sort((a, b) => (b.dr ?? -1) - (a.dr ?? -1) || b.links - a.links),
    pages,
    mentions,
    errors,
    notes,
    cachedAt: null,
    drLicense,
  };
  if (payload.domains.length || payload.mentions.length || !errors.length) await setBacklinkCache(user.id, key, payload);
  return NextResponse.json({ ...payload, cachedAt: new Date().toISOString() });
}
