import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { getGeoOpportunities, getLatestGeoRunFull, saveGeoOpportunities } from "@/lib/db";
import { projectContextBlock } from "@/lib/project-context";
import { generateBrief, type ContentBrief } from "@/lib/geo-brief";
import type { OpportunityReport } from "@/lib/geo-opportunities";
import { QuotaError } from "@/lib/ai-small";

export const maxDuration = 120;

/** POST {domain, index} → analist fırsatı için içerik brief'i (1 AI sorgusu); rapora kaydedilir, ikinci istekte kayıttan gelir. */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const lim = rateLimit(`geo-brief:${user.id}`, 20, 60 * 60 * 1000);
  if (!lim.allowed) return NextResponse.json({ error: "Saatte en fazla 20 brief. Biraz sonra tekrar dene." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(lim.resetAt)) } });
  const b = await req.json().catch(() => ({}));
  const index = Number(b?.index);
  const last = await getLatestGeoRunFull(user.id, typeof b?.domain === "string" && b.domain ? b.domain : undefined);
  if (!last) return NextResponse.json({ error: "Önce bir GEO testi çalıştır." }, { status: 400 });
  const report = await getGeoOpportunities<OpportunityReport>(user.id, last.brand.domain, last.createdAt);
  const opp = Number.isInteger(index) ? (report?.opportunities[index] as (OpportunityReport["opportunities"][number] & { brief?: ContentBrief }) | undefined) : undefined;
  if (!report || !opp) return NextResponse.json({ error: "Bu fırsat bulunamadı; analizi yenile." }, { status: 404 });
  if (opp.brief) return NextResponse.json({ brief: opp.brief });
  try {
    const context = (await projectContextBlock(user.id, last.brand.domain).catch(() => "")).trim();
    opp.brief = await generateBrief(user.id, opp, last.runs, last.brand, last.competitors.filter((c) => c.name), context);
    await saveGeoOpportunities(user.id, last.brand.domain, last.createdAt, report);
    return NextResponse.json({ brief: opp.brief });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Brief üretilemedi";
    return NextResponse.json({ error: msg }, { status: e instanceof QuotaError ? 402 : 500 });
  }
}
