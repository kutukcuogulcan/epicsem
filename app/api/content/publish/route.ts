import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { getCmsConnectionSecret, getContentDraft } from "@/lib/db";
import { publishDraftToConnection } from "@/lib/publish-draft";
import { getActiveProject } from "@/lib/project-context";

const bodySchema = z.object({
  draftId: z.number(),
  connectionId: z.number(),
  /** draft: sitede taslak (varsayılan) · publish: hemen yayınla · schedule: ileri tarihe zamanla */
  mode: z.enum(["draft", "publish", "schedule"]).default("draft"),
  scheduleAt: z.string().optional(),
  toc: z.boolean().optional(),
  schema: z.boolean().optional(),
  slug: z.string().max(120).optional(),
});

/**
 * POST — taslağı bağlı siteye gönderir. Hiçbir AI çağrısı yapmaz, kota harcamaz.
 * Yazıda doldurulmamış [NEEDS: …] alanı varsa "publish"/"schedule" seçilse bile taslak gider (downgraded: true).
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  const limitResult = rateLimit(`content-publish:${user.id}`, 30, 60 * 60 * 1000);
  if (!limitResult.allowed) {
    return NextResponse.json({ error: "Saatlik yayın sınırına ulaşıldı." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limitResult.resetAt)) } });
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }

  let scheduleAt: string | null = null;
  if (parsed.mode === "schedule") {
    const t = new Date(parsed.scheduleAt ?? "").getTime();
    if (!Number.isFinite(t)) return NextResponse.json({ error: "Yayın tarihi ve saati seç." }, { status: 400 });
    if (t < Date.now() + 5 * 60 * 1000) return NextResponse.json({ error: "Zamanlama en az 5 dakika sonrası olmalı." }, { status: 400 });
    if (t > Date.now() + 366 * 864e5) return NextResponse.json({ error: "En fazla 1 yıl sonrasına zamanlanabilir." }, { status: 400 });
    scheduleAt = new Date(t).toISOString();
  }

  const draft = await getContentDraft(user.id, parsed.draftId);
  if (!draft) return NextResponse.json({ error: "Yazı bulunamadı" }, { status: 404 });
  const connection = await getCmsConnectionSecret(user.id, parsed.connectionId);
  if (!connection) return NextResponse.json({ error: "Site bağlantısı bulunamadı" }, { status: 404 });
  const project = await getActiveProject(user.id, draft.site ?? null).catch(() => null);

  try {
    const result = await publishDraftToConnection(user.id, draft, connection, parsed.mode === "schedule" ? "future" : parsed.mode, {
      scheduleAt,
      toc: parsed.toc,
      schema: parsed.schema,
      slug: parsed.slug,
      brandName: project?.name,
    });
    return NextResponse.json({ ok: true, ...result, scheduledAt: scheduleAt });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gönderilemedi" }, { status: 502 });
  }
}
