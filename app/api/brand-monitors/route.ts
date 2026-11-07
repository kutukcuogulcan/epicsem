import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listBrandMonitors, listMonitorSchedules } from "@/lib/db";

/** GET /api/brand-monitors — GEO testi yapılmış her marka için son durum (Arvow "LLM Brand Monitors" listesi). */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const [monitors, schedules] = await Promise.all([listBrandMonitors(user.id), listMonitorSchedules(user.id)]);
  const by = new Map(schedules.map((s) => [s.brandDomain, s]));
  return NextResponse.json({ monitors: monitors.map((m) => ({ ...m, schedule: by.get(m.brandDomain) ?? null })) });
}
