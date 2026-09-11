import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { generateArticleFromBrief, generateArticleFromUrlInput } from "@/lib/content-generator";
import { getContentInput, markContentInputDrafted, markContentInputFailed, saveContentDraft } from "@/lib/db";
import { isDemoMode } from "@/lib/geo-providers";
import { checkQuota, consumeQuota, quotaExceededMessage } from "@/lib/usage-guard";

const bodySchema = z.object({ id: z.number() });

/** POST /api/content-inputs/generate — turns one queued Content Hub input into a real
 * draft, dispatching to the right grounded generator by input type. Same quota metric
 * and draft-only landing as the existing /api/content/generate. */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  const limitResult = rateLimit(`content-inputs-gen:${user.id}`, 20, 60 * 60 * 1000);
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

  const input = await getContentInput(user.id, parsed.id);
  if (!input) return NextResponse.json({ error: "Input bulunamadı" }, { status: 404 });

  const demoMode = isDemoMode();
  if (!demoMode) {
    const quota = await checkQuota(user.id, "contentGenerations", 1);
    if (!quota.allowed) {
      return NextResponse.json({ error: quotaExceededMessage("contentGenerations", quota, 1) }, { status: 402 });
    }
  }

  const brand = { name: input.brandName, domain: input.brandDomain };

  try {
    const article =
      input.type === "seo-gap" || input.type === "listicle"
        ? await generateArticleFromBrief(
            input.brief ?? { url: input.topic, verdict: "needs-work", reason: "", targetQuestions: [], suggestedHeadings: [], contentGaps: [] },
            brand,
            input.type === "listicle" ? "listicle" : "article"
          )
        : await generateArticleFromUrlInput(input.type, input.topic, brand);

    if (!demoMode) await consumeQuota(user.id, "contentGenerations", 1);
    const draft = await saveContentDraft(user.id, input.topic, article);
    await markContentInputDrafted(user.id, input.id, draft.id);
    return NextResponse.json({ draft });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Content generation failed";
    await markContentInputFailed(user.id, input.id, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
