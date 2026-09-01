import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { generateArticleFromBrief } from "@/lib/content-generator";
import { saveContentDraft } from "@/lib/db";

// Mirrors lib/content-brief.ts's ContentBrief shape — sent inline by the client since
// briefs are computed on the fly by /api/gap and never persisted on their own.
const bodySchema = z.object({
  url: z.string().min(1),
  verdict: z.enum(["blocked", "invisible", "cited", "needs-work"]),
  reason: z.string(),
  targetQuestions: z.array(z.string()).default([]),
  suggestedHeadings: z.array(z.string()).default([]),
  contentGaps: z.array(z.string()).default([]),
  brandName: z.string().min(1),
  brandDomain: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  const limitResult = rateLimit(`content-gen:${user.id}`, 20, 60 * 60 * 1000);
  if (!limitResult.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached — up to 20 article generations per hour. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limitResult.resetAt)) } }
    );
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }

  try {
    const article = await generateArticleFromBrief(
      {
        url: parsed.url,
        verdict: parsed.verdict,
        reason: parsed.reason,
        targetQuestions: parsed.targetQuestions,
        suggestedHeadings: parsed.suggestedHeadings,
        contentGaps: parsed.contentGaps,
      },
      { name: parsed.brandName, domain: parsed.brandDomain }
    );
    const draft = saveContentDraft(user.id, parsed.url, article);
    return NextResponse.json({ draft });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Content generation failed" },
      { status: 500 }
    );
  }
}
