import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getLatestGeoRunFull, listGeoRunHistory } from "@/lib/db";
import type { GeoRunResult } from "@/types";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * GET /api/brand-monitors/:domain — monitör detayı: son koşunun prompt × motor cevapları,
 * motor bazında görünürlük ve duygu, zaman içinde görünürlük, cevaplarda geçen markalar.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ domain: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const domain = decodeURIComponent((await ctx.params).domain).toLowerCase();
  const [full, history] = await Promise.all([getLatestGeoRunFull(user.id, domain), listGeoRunHistory(user.id, domain, 60)]);
  if (!full) {
    // Eski koşular cevap metnini saklamıyordu: sadece özet ve zaman çizelgesi gösterilir.
    const last = history[history.length - 1];
    if (!last) return NextResponse.json({ error: "Bu marka için kayıtlı GEO testi yok." }, { status: 404 });
    const o = last.summaries.find((s) => s.domain === domain) ?? last.summaries[0];
    return NextResponse.json({
      brand: { name: last.brandName, domain },
      lastRunAt: last.createdAt,
      demoMode: last.demoMode,
      visibility: o?.visibility ?? 0,
      sentiment: o?.avgSentiment ?? null,
      summaries: last.summaries,
      sources: [],
      prompts: [],
      engines: [],
      legacy: true,
      timeline: history.map((h) => {
        const x = h.summaries.find((s) => s.domain === domain) ?? h.summaries[0];
        return { at: h.createdAt, visibility: x ? x.visibility : 0, sentiment: x?.avgSentiment ?? null };
      }),
    });
  }

  const brands = full.summaries.map((s) => ({ name: s.brand, domain: s.domain }));
  const mentionsIn = (r: GeoRunResult) =>
    brands
      .filter((b) => b.name && new RegExp(`(^|[^\\p{L}])${esc(b.name)}([^\\p{L}]|$)`, "iu").test(r.responseText))
      .map((b) => b.name);

  // Prompt bazında grupla
  const byPrompt = new Map<string, GeoRunResult[]>();
  for (const r of full.runs) byPrompt.set(r.promptText, [...(byPrompt.get(r.promptText) ?? []), r]);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const prompts = [...byPrompt.entries()].map(([text, rs]) => ({
    text,
    topic: rs[0].topic,
    branded: rs[0].branded,
    visibility: rs.filter((r) => r.mentioned).length / rs.length,
    sentiment: avg(rs.map((r) => r.sentiment).filter((s): s is number => s != null)),
    mentions: [...new Set(rs.flatMap(mentionsIn))],
    responses: rs.map((r) => ({
      engine: r.engine,
      model: r.model,
      mentioned: r.mentioned,
      position: r.position,
      sentiment: r.sentiment,
      text: r.responseText,
      mentions: mentionsIn(r),
      citations: r.citations.slice(0, 8),
    })),
  }));

  // Motor bazında
  const byEngine = new Map<string, GeoRunResult[]>();
  for (const r of full.runs) byEngine.set(r.engine, [...(byEngine.get(r.engine) ?? []), r]);
  const engines = [...byEngine.entries()].map(([engine, rs]) => ({
    engine,
    visibility: rs.filter((r) => r.mentioned).length / rs.length,
    sentiment: avg(rs.map((r) => r.sentiment).filter((s): s is number => s != null)),
    total: rs.length,
  }));

  const timeline = history.map((h) => {
    const own = h.summaries.find((s) => s.domain === domain) ?? h.summaries[0];
    return { at: h.createdAt, visibility: own ? own.visibility : 0, sentiment: own?.avgSentiment ?? null };
  });
  const own = full.summaries.find((s) => s.domain === domain) ?? full.summaries[0];

  return NextResponse.json({
    brand: full.brand,
    lastRunAt: full.createdAt,
    demoMode: full.demoMode,
    visibility: own?.visibility ?? 0,
    sentiment: own?.avgSentiment ?? null,
    summaries: full.summaries,
    sources: full.sourceDistribution.slice(0, 30),
    prompts,
    engines,
    timeline,
  });
}
