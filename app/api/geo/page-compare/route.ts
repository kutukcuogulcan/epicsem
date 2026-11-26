import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { blockedReason, safeFetch } from "@/lib/safe-fetch";
import { outline, missingHeadings, suggestOwnUrls } from "@/lib/page-compare";
import { discoverSiteUrls } from "@/lib/site-urls";
import { getActiveProject } from "@/lib/project-context";
import { rateLimit } from "@/lib/rate-limit";

const UA = "Mozilla/5.0 (compatible; EpicsemBot/1.0; +https://epicsem-web.onrender.com)";
const schema = z.object({ rival: z.string().url(), own: z.string().url().optional() });

async function load(url: string) {
  const r = await safeFetch(url, { redirect: "follow", headers: { "User-Agent": UA } }, { timeoutMs: 15_000, maxBytes: 5_000_000 });
  const b = blockedReason(r);
  if (b) throw new Error(`${url}: ${b}`);
  if (!r.ok) throw new Error(`${url} açılamadı (HTTP ${r.status})`);
  return outline(await r.text(), url);
}
const strip = ({ text: _t, ...o }: ReturnType<typeof outline>) => o;

/** POST /api/geo/page-compare {rival, own?} — rakip sayfası ile kendi sayfanın yapısı (AI yok, ücretsiz).
 * own verilmezse aktif projenin sitemap'inden en yakın sayfalar önerilir ve ilki karşılaştırılır. */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  if (!rateLimit(`page-compare:${user.id}`, 30, 60 * 60 * 1000).allowed) return NextResponse.json({ error: "Saatlik sınıra ulaştın." }, { status: 429 });
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Geçerli bir rakip adresi gerekli" }, { status: 400 });
  try {
    const rival = await load(p.data.rival);
    let suggestions: string[] = [];
    let ownUrl = p.data.own;
    if (!ownUrl) {
      const proj = await getActiveProject(user.id);
      if (proj) suggestions = suggestOwnUrls(rival, (await discoverSiteUrls(proj.domain, 20_000)).urls);
      ownUrl = suggestions[0];
    }
    const own = ownUrl ? await load(ownUrl) : null;
    return NextResponse.json({ rival: strip(rival), own: own && strip(own), missing: own ? missingHeadings(rival, own) : [], suggestions });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sayfa açılamadı" }, { status: 502 });
  }
}
