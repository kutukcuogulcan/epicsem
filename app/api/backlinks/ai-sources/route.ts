import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getBacklinkCache, getLatestGeoRunFull, setBacklinkCache } from "@/lib/db";
import { rootHost } from "@/lib/backlinks";
import { classifyDomain, classifyUrlType } from "@/lib/geo-engine";
import { aggregateSources, outreachPlan, type AiSource } from "@/lib/ai-source-outreach";
import { blockedReason, safeFetch } from "@/lib/safe-fetch";
import { trLower } from "@/lib/text-match";
import { isRetailSource } from "@/lib/source-type";
import { getActiveProject } from "@/lib/project-context";
import type { SourceDomainType } from "@/types";

export const maxDuration = 60;
const MAX_PAGES = 10;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Sayfayı açıp takip edilen markaların geçip geçmediğine ve sitene link olup olmadığına bakar (kodla). */
async function readPage(url: string, brands: { name: string; domain: string; aliases?: string[] }[], own: string) {
  try {
    const r = await safeFetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; EpicsemBot/1.0)", "Accept-Language": "tr,en;q=0.8" } }, { timeoutMs: 10_000, maxBytes: 3_000_000 });
    if (!r.ok || blockedReason(r)) return null;
    const html = await r.text();
    const text = trLower(html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "));
    if (text.length < 300) return null;
    const named = brands.filter((b) => [b.name, ...(b.aliases ?? [])].some((n) => n && new RegExp(`(^|[^\\p{L}])${esc(trLower(n))}([^\\p{L}]|$)`, "u").test(text))).map((b) => b.name);
    const linksYou = new RegExp(`href\\s*=\\s*["']?(https?:)?//([a-z0-9-]+\\.)*${esc(own)}`, "i").test(html);
    return { named, linksYou };
  } catch {
    return null;
  }
}

/** GET /api/backlinks/ai-sources?site= — AI'ın GEO testinde gösterdiği dış siteler: kim anılıyor, sen var mısın, nasıl ulaşılır (ücretsiz). */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const site = rootHost(req.nextUrl.searchParams.get("site") ?? "");
  if (!site) return NextResponse.json({ error: "Site gerekli." }, { status: 400 });
  const geo = (await getLatestGeoRunFull(user.id, site)) ?? (await getLatestGeoRunFull(user.id, `www.${site}`));
  if (!geo || geo.demoMode) return NextResponse.json({ items: [], needsGeo: true });
  const rivals = geo.competitors.map((c) => c.domain);
  // Şirket sitesindeki blog / liste / karşılaştırma yazısı editoryal içeriktir (ulaşma yolu: listeye eklenmeyi iste).
  // Elle verilen tip (proje ayarı) ve e-ticaret kuralı GEO kaynak dağılımıyla aynı; mağazanın liste sayfası da mağazadır.
  const proj = await getActiveProject(user.id, site).catch(() => null);
  const overrides = proj?.settings.sourceTypes ?? {};
  const classify = (d: string, url: string): SourceDomainType => {
    const forced = overrides[d.toLowerCase().replace(/^www\./, "")];
    if (forced) return forced;
    const t = classifyDomain(d, site, rivals);
    if ((t === "Corporate" || t === "Other") && isRetailSource(d, [url])) return "Retail";
    return (t === "Corporate" || t === "Other") && ["Listicle", "Comparison", "Alternative", "HowTo", "Article"].includes(classifyUrlType(url, t)) ? "Editorial" : t;
  };
  const sources: AiSource[] = aggregateSources(geo.runs, site, rivals, classify).slice(0, MAX_PAGES);
  // Önbellekte yalnızca sayfa okumaları (plan metni her seferinde güncel kurallarla hesaplanır).
  const key = `ai-src:v2:${site}:${geo.createdAt}`; // v2: alt markalar da aranır
  // Alt markalar (Pro Plan, Felix…) da markanın anılması sayılır.
  const brands = [{ ...geo.brand, aliases: proj?.aliases ?? [] }, ...geo.competitors];
  const cached = await getBacklinkCache<{ pages: Awaited<ReturnType<typeof readPage>>[] }>(user.id, key, 24 * 14);
  const pages = cached?.data.pages?.length === sources.length ? cached.data.pages : await Promise.all(sources.map((s) => readPage(s.url, brands, site)));
  if (!cached) await setBacklinkCache(user.id, key, { pages });
  const items = sources.map((s, i) => {
    const p = pages[i];
    const page = p ? { rivals: p.named.filter((n) => n !== geo.brand.name), you: p.named.includes(geo.brand.name), linksYou: p.linksYou } : null;
    return { ...s, page, plan: outreachPlan(s.type, page) };
  });
  return NextResponse.json({ items, geoAt: geo.createdAt });
}
