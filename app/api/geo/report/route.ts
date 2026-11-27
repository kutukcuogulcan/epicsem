import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { loadReportData } from "@/lib/geo-report-data";

/** GET /api/geo/report — aktif projenin son GEO testinden kodla rapor ve önceki testle fark (AI yok). */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  return NextResponse.json((await loadReportData(user.id)) ?? { report: null });
}
