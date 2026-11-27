import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getGeoRunForCompare, getLatestGeoRunFull } from "@/lib/db";
import { diffRuns } from "@/lib/geo-diff";
import { toCells } from "@/lib/geo-change";
import { getActiveProject } from "@/lib/project-context";
import { buildGeoReport } from "@/lib/geo-report";

/** GET /api/geo/report — aktif projenin son GEO testinden "Neden önerilmiyorum?" raporu (AI yok, ücretsiz). */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const p = await getActiveProject(user.id);
  const geo = p ? ((await getLatestGeoRunFull(user.id, p.domain)) ?? (await getLatestGeoRunFull(user.id, `www.${p.domain}`))) : await getLatestGeoRunFull(user.id);
  if (!geo) return NextResponse.json({ report: null });
  // Proje ayarlarındaki güncel rakipler ve alt markalar; yoksa testteki rakipler.
  const own = { name: geo.brand.name, domain: geo.brand.domain, aliases: p?.aliases ?? [] };
  const rivals = p?.competitors.length ? p.competitors : geo.competitors;
  // Önceki testle fark (aynı soru × motor çiftleri; tercihen ≥6 gün önceki test). Kodla, AI yok.
  const prev = await getGeoRunForCompare(user.id, geo.brand.domain, geo.createdAt);
  const diff = prev ? diffRuns(toCells(prev.runs, own, rivals), toCells(geo.runs, own, rivals)) : null;
  return NextResponse.json({ report: buildGeoReport(geo.runs, own, rivals), brand: own.name, domain: geo.brand.domain, createdAt: geo.createdAt, demo: geo.demoMode, prevAt: prev?.createdAt ?? null, diff });
}
