import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { createImpactTrack, deleteImpactTrack, getImpactTrack, listImpactTracks, listSavedPrompts, updateImpactTrack } from "@/lib/db";
import { getActiveProject, projectContextBlock } from "@/lib/project-context";
import { rootHost } from "@/lib/backlinks";
import { generateRelatedPrompts, measureImpact, summarizeImpact } from "@/lib/impact";
import { PROVIDERS } from "@/lib/geo-providers";
import { QuotaError } from "@/lib/ai-small";
import { readableZodError } from "@/lib/zod-error";
import type { EngineId } from "@/types";

export const maxDuration = 300;

/** Ölçümde kullanılacak motorlar: anahtarı tanımlı gerçek motorlar (Meta/Copilot hariç; onların API'si yok). */
const liveEngines = (): EngineId[] => (["openai", "anthropic", "google", "perplexity", "deepseek", "xai"] as EngineId[]).filter((e) => PROVIDERS[e].isConfigured());

async function ctx(userId: number) {
  const project = await getActiveProject(userId).catch(() => null);
  if (!project) return null;
  const domain = rootHost(project.domain);
  return {
    project,
    domain,
    brand: { name: project.name || domain.split(".")[0], domain },
    competitors: (project.competitors ?? []).slice(0, 5).map((c) => ({ name: c.name, domain: rootHost(c.domain) })),
  };
}

/** GET → aktif projenin etki takipleri ve önce/sonra özetleri. */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const c = await ctx(user.id);
  if (!c) return NextResponse.json({ error: "Önce bir proje seç." }, { status: 400 });
  const tracks = await listImpactTracks(user.id, c.domain);
  return NextResponse.json({ domain: c.domain, engines: liveEngines(), tracks: tracks.map((t) => ({ ...t, summary: summarizeImpact(t, c.domain) })) });
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("suggest"), target: z.string().trim().min(5).max(200), keyword: z.string().trim().max(120).optional() }),
  z.object({
    action: z.literal("create"),
    kind: z.enum(["article", "offpage"]),
    title: z.string().trim().min(2).max(200),
    ref: z.string().trim().max(300).optional(),
    target: z.string().trim().min(5).max(200),
    prompts: z.array(z.object({ text: z.string().trim().min(5).max(200), intent: z.string().max(20), source: z.enum(["target", "generated", "library"]) })).min(1).max(12),
    done: z.boolean().optional(),
  }),
  z.object({ action: z.literal("done"), id: z.number().int() }),
  z.object({ action: z.literal("measure"), id: z.number().int() }),
]);

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  let b: z.infer<typeof schema>;
  try {
    b = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: readableZodError(e) }, { status: 400 });
  }
  const c = await ctx(user.id);
  if (!c) return NextResponse.json({ error: "Önce bir proje seç." }, { status: 400 });

  try {
    if (b.action === "suggest") {
      const lim = rateLimit(`impact-suggest:${user.id}`, 30, 60 * 60 * 1000);
      if (!lim.allowed) return NextResponse.json({ error: "Saatlik sınıra ulaşıldı." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(lim.resetAt)) } });
      const [context, library] = await Promise.all([projectContextBlock(user.id, c.domain).catch(() => ""), listSavedPrompts(user.id, c.domain).catch(() => [])]);
      const prompts = await generateRelatedPrompts(user.id, {
        target: b.target,
        keyword: b.keyword,
        brand: c.brand.name,
        context: context || `${c.brand.name} (${c.domain})`,
        library: library.map((p) => p.promptText),
        language: c.project.settings?.language,
      });
      return NextResponse.json({ prompts });
    }

    if (b.action === "create") {
      const lim = rateLimit(`impact-measure:${user.id}`, 12, 60 * 60 * 1000);
      if (!lim.allowed) return NextResponse.json({ error: "Saatte en fazla 12 ölçüm yapılabilir." }, { status: 429 });
      const engines = liveEngines();
      const baseline = await measureImpact(user.id, { prompts: b.prompts, engines, brand: c.brand, competitors: c.competitors });
      const t = await createImpactTrack(user.id, {
        domain: c.domain,
        kind: b.kind,
        title: b.title,
        ref: b.ref ?? null,
        targetPrompt: b.target,
        prompts: b.prompts,
        engines,
        baseline,
        doneAt: b.done ? new Date().toISOString() : null,
      });
      return NextResponse.json({ track: { ...t, summary: summarizeImpact(t, c.domain) } });
    }

    const t = await getImpactTrack(user.id, b.id);
    if (!t || t.domain !== c.domain) return NextResponse.json({ error: "Takip bulunamadı." }, { status: 404 });

    if (b.action === "done") {
      await updateImpactTrack(user.id, t.id, { doneAt: new Date().toISOString() });
    } else {
      const lim = rateLimit(`impact-measure:${user.id}`, 12, 60 * 60 * 1000);
      if (!lim.allowed) return NextResponse.json({ error: "Saatte en fazla 12 ölçüm yapılabilir." }, { status: 429 });
      const check = await measureImpact(user.id, { prompts: t.prompts, engines: t.engines, brand: c.brand, competitors: c.competitors });
      // İş tamamlanmadan yapılan ölçüm başlangıç ölçümünü günceller; sonrası "sonra" ölçümü olarak eklenir.
      if (!t.doneAt) await updateImpactTrack(user.id, t.id, { baseline: check });
      else await updateImpactTrack(user.id, t.id, { checks: [...t.checks, check].slice(-6) });
    }
    const fresh = (await getImpactTrack(user.id, t.id))!;
    return NextResponse.json({ track: { ...fresh, summary: summarizeImpact(fresh, c.domain) } });
  } catch (e) {
    const status = (e as { status?: number }).status ?? (e instanceof QuotaError ? 402 : 500);
    return NextResponse.json({ error: e instanceof Error ? e.message : "İşlem başarısız" }, { status });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });
  await deleteImpactTrack(user.id, id);
  return NextResponse.json({ ok: true });
}
