import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { getGeoOpportunities, getLatestGeoRunFull, saveGeoOpportunities } from "@/lib/db";
import { generateOpportunities, type OpportunityReport } from "@/lib/geo-opportunities";
import { QuotaError } from "@/lib/ai-small";

export const maxDuration = 120;

const host = (d: string) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

/** GET ?domain= → son test için kayıtlı analist raporu (yoksa null). POST {domain} → üret (1 AI sorgusu) ve kaydet. */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const domain = host(req.nextUrl.searchParams.get("domain") ?? "");
  const last = await getLatestGeoRunFull(user.id, domain || undefined);
  if (!last) return NextResponse.json({ report: null, runAt: null });
  return NextResponse.json({ report: await getGeoOpportunities<OpportunityReport>(user.id, last.brand.domain, last.createdAt), runAt: last.createdAt });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const lim = rateLimit(`geo-opps:${user.id}`, 10, 60 * 60 * 1000);
  if (!lim.allowed) return NextResponse.json({ error: "Saatte en fazla 10 analiz. Biraz sonra tekrar dene." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(lim.resetAt)) } });
  const { domain } = await req.json().catch(() => ({}));
  const last = await getLatestGeoRunFull(user.id, typeof domain === "string" && domain ? host(domain) : undefined);
  if (!last || !last.runs.length) return NextResponse.json({ error: "Önce bir GEO testi çalıştır." }, { status: 400 });
  try {
    const report = await generateOpportunities(user.id, last.createdAt, last.runs, last.brand, last.competitors.filter((c) => c.name));
    if (report.status === "ready") await saveGeoOpportunities(user.id, last.brand.domain, last.createdAt, report);
    return NextResponse.json({ report, runAt: last.createdAt });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Analiz yapılamadı";
    return NextResponse.json({ error: msg }, { status: e instanceof QuotaError ? 402 : 500 });
  }
}
