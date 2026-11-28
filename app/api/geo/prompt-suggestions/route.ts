import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getGeoOpportunities, getLatestGeoRunFull, listMonitorSchedules, saveGeoOpportunities } from "@/lib/db";
import { getActiveProject } from "@/lib/project-context";
import { parseSuggestions, suggestionPrompt, type PromptSuggestion } from "@/lib/prompt-suggest";
import { QuotaError, runSmallAiJson } from "@/lib/ai-small";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 120;
const keyOf = (at: string) => `prompt-sugg:${at}`;

async function latest(userId: number) {
  const p = await getActiveProject(userId);
  const geo = p ? ((await getLatestGeoRunFull(userId, p.domain)) ?? (await getLatestGeoRunFull(userId, `www.${p.domain}`))) : null;
  return geo && !geo.demoMode && geo.runs.length ? { p: p!, geo } : null;
}

/** GET — son test için kayıtlı soru önerileri ve izlenen sabit soru seti (yoksa null). */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const l = await latest(user.id);
  if (!l) return NextResponse.json({ suggestions: null });
  const schedule = (await listMonitorSchedules(user.id)).find((s) => s.brandDomain === l.geo.brand.domain) ?? null;
  return NextResponse.json({
    suggestions: await getGeoOpportunities<PromptSuggestion[]>(user.id, l.geo.brand.domain, keyOf(l.geo.createdAt)),
    domain: l.geo.brand.domain,
    tracked: schedule?.prompts?.map((x) => x.text) ?? [],
    monitorActive: !!schedule?.active,
  });
}

/** POST — önerileri üret ve kaydet (1 AI sorgusu, test başına bir kez). */
export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  if (!rateLimit(`prompt-sugg:${user.id}`, 10, 60 * 60 * 1000).allowed) return NextResponse.json({ error: "Saatte en fazla 10 öneri üretilebilir." }, { status: 429 });
  const l = await latest(user.id);
  if (!l) return NextResponse.json({ error: "Önce gerçek bir GEO testi çalıştır." }, { status: 400 });
  const key = keyOf(l.geo.createdAt);
  const cached = await getGeoOpportunities<PromptSuggestion[]>(user.id, l.geo.brand.domain, key);
  if (cached) return NextResponse.json({ suggestions: cached });
  try {
    const competitors = (l.p.competitors.length ? l.p.competitors : l.geo.competitors).map((c) => c.name);
    const raw = await runSmallAiJson(user.id, suggestionPrompt(l.geo.brand.name, l.geo.runs, competitors, l.p.settings.language || "tr", l.p.aliases));
    const suggestions = parseSuggestions(raw, l.geo.brand.name, [...new Set(l.geo.runs.map((r) => r.promptText))], l.p.aliases);
    await saveGeoOpportunities(user.id, l.geo.brand.domain, key, suggestions);
    return NextResponse.json({ suggestions });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Öneriler üretilemedi" }, { status: e instanceof QuotaError ? 402 : 500 });
  }
}
