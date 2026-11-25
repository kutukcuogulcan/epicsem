import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { getBacklinkCache, setBacklinkCache } from "@/lib/db";
import { getActiveProject } from "@/lib/project-context";
import { checkDomain } from "@/lib/agent-readiness";
import type { DomainReadiness } from "@/lib/agent-readiness-types";

export const maxDuration = 120;

const host = (d: string) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

/** GET — önbellekteki son sonuç (ücretsiz). POST {refresh?} — proje sitesi + en fazla 6 rakip için AI ajan hazırlık seviyesi (AI yok). */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ results: null });
  const p = await getActiveProject(user.id).catch(() => null);
  if (!p) return NextResponse.json({ results: null });
  const c = await getBacklinkCache<DomainReadiness[]>(user.id, `ready1:${host(p.domain)}`, 24 * 7);
  return NextResponse.json({ results: c?.data ?? null, cachedAt: c?.createdAt ?? null });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const b = z.object({ refresh: z.boolean().optional() }).parse(await req.json().catch(() => ({})));
  const p = await getActiveProject(user.id).catch(() => null);
  if (!p) return NextResponse.json({ error: "Önce bir proje seç." }, { status: 400 });
  const key = `ready1:${host(p.domain)}`;
  if (!b.refresh) {
    const c = await getBacklinkCache<DomainReadiness[]>(user.id, key, 24);
    if (c) return NextResponse.json({ results: c.data, cachedAt: c.createdAt });
  }
  const lim = rateLimit(`readiness:${user.id}`, 8, 60 * 60 * 1000);
  if (!lim.allowed) return NextResponse.json({ error: "Saatte en fazla 8 kontrol yapılabilir." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(lim.resetAt)) } });
  const targets = [{ domain: host(p.domain), brand: p.name, own: true }, ...p.competitors.slice(0, 6).map((c) => ({ domain: host(c.domain), brand: c.name, own: false }))].filter(
    (t, i, a) => t.domain && a.findIndex((x) => x.domain === t.domain) === i
  );
  const results = await Promise.all(targets.map((t) => checkDomain(t.domain, t.brand, t.own).catch(() => ({ domain: t.domain, brand: t.brand, own: t.own, level: 0, next: null, checks: [], checkedAt: new Date().toISOString(), error: "Kontrol edilemedi" }) as DomainReadiness)));
  await setBacklinkCache(user.id, key, results).catch(() => {});
  return NextResponse.json({ results, cachedAt: new Date().toISOString() });
}
