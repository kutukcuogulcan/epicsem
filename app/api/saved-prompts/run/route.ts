import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { EngineId } from "@/types";
import { ALL_ENGINES, runPromptAcrossEngines } from "@/lib/geo-engine";
import { isDemoMode } from "@/lib/geo-providers";
import { getSavedPrompt, updateSavedPromptResult } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { checkQuota, consumeQuota, quotaExceededMessage } from "@/lib/usage-guard";

const bodySchema = z.object({
  id: z.number(),
  engines: z.array(z.enum(["openai", "anthropic", "google", "perplexity", "deepseek", "xai", "meta", "microsoft"])).min(1).default(ALL_ENGINES),
});

/** POST /api/saved-prompts/run — re-runs ONE saved prompt (the table's per-row "Çalıştır"
 * button), across whichever engines the caller passes. Same underlying engine call and
 * quota metric as a full /api/geo batch test — the only difference is prompt count is
 * always 1, and the aggregated result is written back onto the saved_prompts row instead
 * of a new geo_runs history entry. */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  const limitResult = rateLimit(`saved-prompt-run:${user.id}`, 40, 60 * 60 * 1000);
  if (!limitResult.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached — up to 40 prompt re-runs per hour. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limitResult.resetAt)) } }
    );
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }

  const prompt = await getSavedPrompt(user.id, parsed.id);
  if (!prompt) return NextResponse.json({ error: "Prompt bulunamadı" }, { status: 404 });

  const engines = parsed.engines as EngineId[];
  const demoMode = isDemoMode();
  if (!demoMode) {
    const quota = await checkQuota(user.id, "engineQueries", engines.length);
    if (!quota.allowed) {
      return NextResponse.json({ error: quotaExceededMessage("engineQueries", quota, engines.length) }, { status: 402 });
    }
  }

  const runs = await runPromptAcrossEngines(
    prompt.promptText,
    { name: prompt.brandName, domain: prompt.brandDomain },
    prompt.competitors,
    engines,
    prompt.topic
  );
  if (!demoMode) await consumeQuota(user.id, "engineQueries", engines.length);

  const mentionedCount = runs.filter((r) => r.mentioned).length;
  const visibility = Math.round((mentionedCount / runs.length) * 100);
  const sentiments = runs.map((r) => r.sentiment).filter((s): s is number => s != null);
  const sentiment = sentiments.length ? Math.round(sentiments.reduce((a, b) => a + b, 0) / sentiments.length) : null;

  const updated = await updateSavedPromptResult(user.id, parsed.id, {
    visibility,
    sentiment,
    mentioned: mentionedCount > 0,
  });

  return NextResponse.json({ demoMode, prompt: updated, runs });
}
