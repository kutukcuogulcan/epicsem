import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { getGeoOpportunities, getGeoRunForCompare, getLatestGeoRunFull, saveGeoOpportunities } from "@/lib/db";
import { generateChange, type ChangeReport } from "@/lib/geo-change";
import { QuotaError } from "@/lib/ai-small";

export const maxDuration = 120;

const host = (d: string) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
// Rapor tablosunu paylaşır; anahtar "change:<son test zamanı>".
const keyOf = (runAt: string) => `change:${runAt}`;

/** GET ?domain= → son test için kayıtlı "ne değişti" (yoksa null). POST {domain} → üret (değişiklik varsa 1 AI sorgusu). */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const last = await getLatestGeoRunFull(user.id, host(req.nextUrl.searchParams.get("domain") ?? "") || undefined);
  if (!last) return NextResponse.json({ report: null });
  return NextResponse.json({ report: await getGeoOpportunities<ChangeReport>(user.id, last.brand.domain, keyOf(last.createdAt)) });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const lim = rateLimit(`geo-change:${user.id}`, 10, 60 * 60 * 1000);
  if (!lim.allowed) return NextResponse.json({ error: "Saatte en fazla 10 özet. Biraz sonra tekrar dene." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(lim.resetAt)) } });
  const { domain } = await req.json().catch(() => ({}));
  const last = await getLatestGeoRunFull(user.id, typeof domain === "string" && domain ? host(domain) : undefined);
  if (!last || !last.runs.length) return NextResponse.json({ error: "Önce bir GEO testi çalıştır." }, { status: 400 });
  try {
    const prev = await getGeoRunForCompare(user.id, last.brand.domain, last.createdAt);
    const report = await generateChange(user.id, last, prev, last.brand, last.competitors.filter((c) => c.name));
    await saveGeoOpportunities(user.id, last.brand.domain, keyOf(last.createdAt), report);
    return NextResponse.json({ report });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Özet çıkarılamadı";
    return NextResponse.json({ error: msg }, { status: e instanceof QuotaError ? 402 : 500 });
  }
}
