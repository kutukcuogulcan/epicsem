import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getBacklinkCache, getIntegration, setBacklinkCache } from "@/lib/db";
import { bingSites } from "@/lib/bing";
import { ahrefsFreeDR, ahrefsRefDomains, bingBacklinks, rootHost, type RefDomain } from "@/lib/backlinks";

interface Payload {
  site: string;
  sources: { bing: boolean; ahrefs: boolean };
  domains: RefDomain[];
  pages: { url: string; count: number }[];
  errors: string[];
  cachedAt: string | null;
  drLicense: boolean;
}

/** GET /api/backlinks?site=domain.com[&refresh=1] — Bing + Ahrefs'ten sitene link veren alan adları. */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const site = rootHost(req.nextUrl.searchParams.get("site") ?? "");
  const [bingI, ahrefsI] = await Promise.all([getIntegration(user.id, "bing"), getIntegration(user.id, "ahrefs")]);
  const sources = { bing: !!bingI?.secrets.apiKey, ahrefs: !!ahrefsI?.secrets.apiKey };
  if (!site) return NextResponse.json({ sources });
  if (!sources.bing && !sources.ahrefs) return NextResponse.json({ site, sources, domains: [], pages: [], errors: [], cachedAt: null });

  const key = `all:${site}:${+sources.bing}${+sources.ahrefs}`;
  if (req.nextUrl.searchParams.get("refresh") !== "1") {
    const c = await getBacklinkCache<Payload>(user.id, key);
    if (c) return NextResponse.json({ ...c.data, cachedAt: c.createdAt });
  }
  const rl = rateLimit(`backlinks:${user.id}`, 10, 60 * 60 * 1000);
  if (!rl.allowed) return NextResponse.json({ error: "Saatte en fazla 10 backlink yenilemesi yapılabilir." }, { status: 429 });

  const errors: string[] = [];
  const byDomain = new Map<string, RefDomain>();
  let pages: { url: string; count: number }[] = [];

  if (sources.bing) {
    try {
      const all = await bingSites(bingI!.secrets.apiKey);
      const match = all.find((s) => rootHost(s.url) === site);
      if (!match) errors.push(`Bing Webmaster hesabında ${site} yok — siteyi Bing'e ekleyip doğrula.`);
      else {
        const b = await bingBacklinks(bingI!.secrets.apiKey, match.url);
        pages = b.pages;
        for (const d of b.domains) byDomain.set(d.domain, d);
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
        byDomain.set(d.domain, cur ? { ...d, anchors: cur.anchors, sampleUrl: cur.sampleUrl, targets: cur.targets, links: Math.max(d.links, cur.links) } : d);
      }
      drLicense = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ahrefs hatası";
      // Ücretsiz anahtar: liste gelmez ama Bing'den gelen alan adlarına DR eklenebilir.
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
        errors.push("Ahrefs ücretsiz anahtarla sadece Domain Rating geliyor; tam backlink listesi için Ahrefs Lite+ gerekir.");
      } else errors.push(msg);
    }
  }

  const payload: Payload = {
    site,
    sources,
    domains: [...byDomain.values()].sort((a, b) => (b.dr ?? -1) - (a.dr ?? -1) || b.links - a.links),
    pages,
    errors,
    cachedAt: null,
    drLicense,
  };
  if (payload.domains.length || !errors.length) await setBacklinkCache(user.id, key, payload);
  return NextResponse.json({ ...payload, cachedAt: new Date().toISOString() });
}
