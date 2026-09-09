import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runArticleAudit } from "@/lib/article-audit";
import { requireUser } from "@/lib/auth";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { isDemoMode } from "@/lib/geo-providers";
import { checkQuota, consumeQuota, quotaExceededMessage } from "@/lib/usage-guard";

const bodySchema = z.object({ url: z.string().min(3) });

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  const limitResult = rateLimit(`article-writer:${user.id}`, 20, 60 * 60 * 1000);
  if (!limitResult.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached — up to 20 article-writer runs per hour. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limitResult.resetAt)) } }
    );
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Body must be { url: string }" }, { status: 400 });
  }

  // Article Writer runs a real LLM call (unlike the free, deterministic /audit tool),
  // so it draws from the same contentGenerations quota as /api/content/generate.
  const demoMode = isDemoMode();
  if (!demoMode) {
    const quota = await checkQuota(user.id, "contentGenerations", 1);
    if (!quota.allowed) {
      return NextResponse.json({ error: quotaExceededMessage("contentGenerations", quota, 1) }, { status: 402 });
    }
  }

  try {
    const result = await runArticleAudit(parsed.url);
    if (!demoMode) await consumeQuota(user.id, "contentGenerations", 1);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Article Writer analizi başarısız oldu" },
      { status: 500 }
    );
  }
}
