import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { getLatestGeoRunFull, listDueMonitorSchedules, markMonitorRun } from "@/lib/db";
import { executeGeoRun } from "@/lib/geo-run";
import type { EngineId } from "@/types";

export const maxDuration = 300;

/** Bir markanın son testindeki prompt/motor/rakip setiyle testi yeniden çalıştırır. */
async function rerun(userId: number, domain: string) {
  const last = await getLatestGeoRunFull(userId, domain);
  if (!last || !last.runs.length) throw new Error("Bu marka için tekrar çalıştırılacak bir test yok — önce GEO testini bir kez çalıştır.");
  const seen = new Set<string>();
  const prompts: { text: string; topic: string }[] = [];
  for (const r of last.runs) {
    if (seen.has(r.promptText)) continue;
    seen.add(r.promptText);
    prompts.push({ text: r.promptText, topic: r.topic || "Genel" });
  }
  const engines = [...new Set(last.runs.map((r) => r.engine))] as EngineId[];
  const res = await executeGeoRun(userId, { brand: last.brand, competitors: last.competitors, prompts: prompts.slice(0, 10), engines });
  return { domain, prompts: prompts.length, engines: engines.length, demoMode: res.demoMode };
}

/**
 * POST /api/brand-monitors/run
 *  - GitHub Actions cron (x-cron-secret): sırası gelen tüm aktif monitörleri çalıştırır.
 *  - Oturumlu kullanıcı { domain }: "Şimdi çalıştır".
 */
export async function POST(req: NextRequest) {
  const isCron = !!process.env.CRON_SECRET && req.headers.get("x-cron-secret") === process.env.CRON_SECRET;
  if (isCron) {
    const due = await listDueMonitorSchedules();
    const results = [];
    for (const s of due) {
      try {
        results.push({ ok: true, ...(await rerun(s.userId, s.brandDomain)) });
        await markMonitorRun(s.userId, s.brandDomain, null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Çalıştırılamadı";
        console.error(`[brand-monitors/run] ${s.brandDomain}:`, msg);
        await markMonitorRun(s.userId, s.brandDomain, msg);
        results.push({ ok: false, domain: s.brandDomain, error: msg });
      }
    }
    return NextResponse.json({ checked: due.length, results });
  }

  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const lim = rateLimit(`monitor-run:${user.id}`, 10, 60 * 60 * 1000);
  if (!lim.allowed) return NextResponse.json({ error: "Saatte en fazla 10 monitör çalıştırılabilir." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(lim.resetAt)) } });
  const b = await req.json().catch(() => ({}));
  const domain = String(b.domain ?? "").toLowerCase().trim();
  if (!domain) return NextResponse.json({ error: "Marka alan adı gerekli." }, { status: 400 });
  try {
    return NextResponse.json(await rerun(user.id, domain));
  } catch (e) {
    const status = (e as { status?: number }).status ?? 400;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Çalıştırılamadı" }, { status });
  }
}
