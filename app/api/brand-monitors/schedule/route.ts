import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getLatestGeoRunFull, listMonitorSchedules, setMonitorSchedule } from "@/lib/db";
import { getActiveProject } from "@/lib/project-context";
import { buildGeoReport } from "@/lib/geo-report";
import { pickTrackedPrompts } from "@/lib/tracked-prompts";

/** Otomatik izlemenin varsayılan sabit soru sayısı (5 / 10 / 20 seçilebilir): soru × bağlı motor kadar sorgu / çalışma. */
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
    // promptCount verilirse soru seti o sayıyla yeniden seçilir (soru sayısını artır/azalt).
    const count = [5, 10, 20].includes(Number(b.promptCount)) ? Number(b.promptCount) : null;
    let prompts: { text: string; topic: string }[] | undefined;
    const pick = async (n: number) => {
      const last = await getLatestGeoRunFull(user.id, domain);
      if (!last?.runs.length) return undefined;
      const proj = await getActiveProject(user.id, domain).catch(() => null);
      const own = { ...last.brand, aliases: proj?.aliases ?? [] };
      return pickTrackedPrompts(last.runs, buildGeoReport(last.runs, own, proj?.competitors.length ? proj.competitors : last.competitors), n);
    };
    if (count || (b.active === true && !(await listMonitorSchedules(user.id)).find((x) => x.brandDomain === domain)?.prompts)) prompts = await pick(count ?? TRACKED_PROMPTS);
    // addPrompt: önerilen bir soruyu sabit izleme setine ekle (en fazla 20; aynısı tekrar eklenmez).
    const add = b.addPrompt && typeof b.addPrompt.text === "string" && b.addPrompt.text.trim().length >= 8 ? { text: b.addPrompt.text.trim().slice(0, 300), topic: String(b.addPrompt.topic ?? "Genel").slice(0, 60) } : null;
    if (add && !prompts) {
      // Set henüz seçilmemişse önce en önemli sorular seçilir, öneri onlara eklenir (tek soruluk set kalmasın).
      const cur = (await listMonitorSchedules(user.id)).find((x) => x.brandDomain === domain)?.prompts ?? (await pick(TRACKED_PROMPTS)) ?? [];
      if (cur.some((x) => x.text === add.text)) prompts = cur;
      else if (cur.length >= 20) return NextResponse.json({ error: "İzleme setinde en fazla 20 soru olabilir." }, { status: 400 });
      else prompts = [...cur, add];
    }
    const s = await setMonitorSchedule(user.id, domain, { active: typeof b.active === "boolean" ? b.active : undefined, intervalDays, prompts });
    return NextResponse.json({ schedule: s });
  } catch (e) {
    console.error("[brand-monitors/schedule] failed:", e);
    return NextResponse.json({ error: "Kaydedilemedi." }, { status: 500 });
  }
}
