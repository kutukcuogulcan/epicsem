import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { getCmsConnectionSecret, getContentDraft } from "@/lib/db";
import { publishDraftToConnection } from "@/lib/publish-draft";

const bodySchema = z.object({
  draftId: z.number(),
  connectionId: z.number(),
});

/** Always publishes as a draft (WordPress "draft" / Shopify "unpublished") — see
 * lib/wordpress.ts and lib/shopify.ts for why this isn't configurable per platform. */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  const limitResult = rateLimit(`content-publish:${user.id}`, 30, 60 * 60 * 1000);
  if (!limitResult.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limitResult.resetAt)) } }
    );
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }

  const draft = await getContentDraft(user.id, parsed.draftId);
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

  const connection = await getCmsConnectionSecret(user.id, parsed.connectionId);
  if (!connection) return NextResponse.json({ error: "CMS connection not found" }, { status: 404 });

  try {
    const result = await publishDraftToConnection(user.id, draft, connection);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Publish failed" },
      { status: 502 }
    );
  }
}
