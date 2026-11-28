import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getGeoOpportunities, saveGeoOpportunities, upsertActionItems } from "@/lib/db";
import { actionKey } from "@/lib/action-items";
import { loadReportData } from "@/lib/geo-report-data";
import { parseSummary, summaryFacts, summaryPrompt, type GeoSummary } from "@/lib/geo-summary";
import { QuotaError, runSmallAiJson } from "@/lib/ai-small";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 120;
const keyOf = (at: string) => `summary:${at}`;

/** GET — son test için kayıtlı özet (yoksa null). POST — üret ve kaydet (1 AI sorgusu, test başına bir kez). */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const d = await loadReportData(user.id);
  if (!d) return NextResponse.json({ summary: null });
  const summary = await getGeoOpportunities<GeoSummary>(user.id, d.domain, keyOf(d.createdAt));
  // Takip listesi bu özellikten önce üretilmiş özetler için de dolsun (aynı iş tekrar eklenmez).
  if (summary) await upsertActionItems(user.id, d.domain, summary.actions.map((x) => ({ title: x.action, why: x.why, impact: x.impact, effort: x.effort, key: actionKey(x.action) }))).catch(() => undefined);
  return NextResponse.json({ summary, createdAt: d.createdAt, diff: d.diff, prevAt: d.prevAt });
}

export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  if (!rateLimit(`geo-summary:${user.id}`, 10, 60 * 60 * 1000).allowed) return NextResponse.json({ error: "Saatte en fazla 10 özet üretilebilir." }, { status: 429 });
  const d = await loadReportData(user.id);
  if (!d || !d.report.answers) return NextResponse.json({ error: "Önce bir GEO testi çalıştır." }, { status: 400 });
  const cached = await getGeoOpportunities<GeoSummary>(user.id, d.domain, keyOf(d.createdAt));
  if (cached) return NextResponse.json({ summary: cached });
  try {
    const summary = parseSummary(await runSmallAiJson(user.id, summaryPrompt(summaryFacts(d.brand, d.report, d.diff, d.excerpts))));
    if (!summary) return NextResponse.json({ error: "Özet üretilemedi, tekrar dene." }, { status: 502 });
    await saveGeoOpportunities(user.id, d.domain, keyOf(d.createdAt), summary);
    // Öncelikli işler takip listesine girer (yapılıyor / yapıldı işaretlenebilsin).
    await upsertActionItems(user.id, d.domain, summary.actions.map((x) => ({ title: x.action, why: x.why, impact: x.impact, effort: x.effort, key: actionKey(x.action) }))).catch((e) => console.error("[geo-summary] işler kaydedilemedi", e));
    return NextResponse.json({ summary });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Özet üretilemedi" }, { status: e instanceof QuotaError ? 402 : 500 });
  }
}
