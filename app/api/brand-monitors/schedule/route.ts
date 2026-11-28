import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getLatestGeoRunFull, listMonitorSchedules, setMonitorSchedule } from "@/lib/db";
import { getActiveProject } from "@/lib/project-context";
import { buildGeoReport } from "@/lib/geo-report";
import { pickTrackedPrompts } from "@/lib/tracked-prompts";

/** Otomatik izlemenin sabit soru sayısı: haftada 5 soru × bağlı motorlar (2 motorda ayda ~40 sorgu). */
const TRACKED_PROMPTS = 5;

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
    // İzleme açılırken sabit soru seti seçilir (bir kez): her otomatik testte aynı 5 soru sorulur, trend gerçek değişimi gösterir.
    let prompts: { text: string; topic: string }[] | undefined;
    if (b.active === true && !(await listMonitorSchedules(user.id)).find((x) => x.brandDomain === domain)?.prompts) {
      const last = await getLatestGeoRunFull(user.id, domain);
      if (last?.runs.length) {
        const proj = await getActiveProject(user.id, domain).catch(() => null);
        const own = { ...last.brand, aliases: proj?.aliases ?? [] };
        prompts = pickTrackedPrompts(last.runs, buildGeoReport(last.runs, own, proj?.competitors.length ? proj.competitors : last.competitors), TRACKED_PROMPTS);
      }
    }
    const s = await setMonitorSchedule(user.id, domain, { active: typeof b.active === "boolean" ? b.active : undefined, intervalDays, prompts });
    return NextResponse.json({ schedule: s });
  } catch (e) {
    console.error("[brand-monitors/schedule] failed:", e);
    return NextResponse.json({ error: "Kaydedilemedi." }, { status: 500 });
  }
}
