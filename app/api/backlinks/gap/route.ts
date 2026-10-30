import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getBacklinkCache, getIntegration, setBacklinkCache } from "@/lib/db";
import { ahrefsLinkGap, rootHost, type GapDomain } from "@/lib/backlinks";

/** POST /api/backlinks/gap { site, competitors[] } — rakiplere link verip sana vermeyen siteler (Ahrefs). */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const ahrefsI = await getIntegration(user.id, "ahrefs");
  if (!ahrefsI?.secrets.apiKey) return NextResponse.json({ error: "Link fırsatları için Ahrefs bağlantısı gerekli.", needsKey: true }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const site = rootHost(String(b.site ?? ""));
  const comps: string[] = (Array.isArray(b.competitors) ? b.competitors : []).map((c: unknown) => rootHost(String(c))).filter(Boolean).slice(0, 4);
  if (!site || !comps.length) return NextResponse.json({ error: "Site ve en az bir rakip gerekli." }, { status: 400 });
  const key = `gap:${site}:${[...comps].sort().join(",")}`;
  if (!b.refresh) {
    const c = await getBacklinkCache<{ gaps: GapDomain[]; checked: string[] }>(user.id, key);
    if (c) return NextResponse.json({ ...c.data, cachedAt: c.createdAt });
  }
  const rl = rateLimit(`backlink-gap:${user.id}`, 6, 60 * 60 * 1000);
  if (!rl.allowed) return NextResponse.json({ error: "Saatte en fazla 6 rakip karşılaştırması yapılabilir." }, { status: 429 });
  try {
    const r = await ahrefsLinkGap(ahrefsI.secrets.apiKey, site, comps);
    await setBacklinkCache(user.id, key, r);
    return NextResponse.json({ ...r, cachedAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ahrefs hatası" }, { status: 502 });
  }
}
