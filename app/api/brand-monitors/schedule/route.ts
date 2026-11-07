import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { setMonitorSchedule } from "@/lib/db";

/** PUT { domain, active?, intervalDays? } — monitörün otomatik çalışmasını aç/kapat, sıklığını ayarla. */
export async function PUT(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const domain = String(b.domain ?? "").toLowerCase().trim();
  if (!domain) return NextResponse.json({ error: "Marka alan adı gerekli." }, { status: 400 });
  const intervalDays = b.intervalDays == null ? undefined : Number(b.intervalDays);
  if (intervalDays != null && ![1, 3, 7, 14, 30].includes(intervalDays)) return NextResponse.json({ error: "Geçersiz sıklık." }, { status: 400 });
  try {
    const s = await setMonitorSchedule(user.id, domain, { active: typeof b.active === "boolean" ? b.active : undefined, intervalDays });
    return NextResponse.json({ schedule: s });
  } catch (e) {
    console.error("[brand-monitors/schedule] failed:", e);
    return NextResponse.json({ error: "Kaydedilemedi." }, { status: 500 });
  }
}
