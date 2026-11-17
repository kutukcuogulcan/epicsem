import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { deleteContentDraft, getContentDraft, listContentDrafts, reviewContentDraft } from "@/lib/db";
import { getActiveProject } from "@/lib/project-context";
import { readableZodError } from "@/lib/zod-error";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  const idParam = req.nextUrl.searchParams.get("id");
  if (idParam) {
    const id = Number(idParam);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const draft = await getContentDraft(user.id, id);
    if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ draft });
  }

  // Varsayılan: aktif projenin yazıları (+ hiçbir projeye bağlanmamış eski yazılar). ?all=1 → hepsi.
  // ?limit=200 → takvim gibi daha geniş liste isteyen görünümler için (üst sınır 300).
  const limit = Math.min(300, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 60));
  const drafts = await listContentDrafts(user.id, Math.max(200, limit));
  if (req.nextUrl.searchParams.get("all") === "1") return NextResponse.json({ drafts: drafts.slice(0, limit) });
  const project = await getActiveProject(user.id).catch(() => null);
  if (!project) return NextResponse.json({ drafts: drafts.slice(0, limit), project: null });
  return NextResponse.json({ drafts: drafts.filter((d) => !d.site || d.site === project.domain).slice(0, limit), project: project.domain });
}

const patchSchema = z.object({
  id: z.number().int().positive(),
  approved: z.boolean().optional(),
  plannedFor: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

/** PATCH /api/content — Onay kuyruğu: onayla / onayı geri al, takvimde planlanan günü ayarla. AI kullanmaz. */
export async function PATCH(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }
  const draft = await reviewContentDraft(user.id, body.id, { approved: body.approved, plannedFor: body.plannedFor });
  if (!draft) return NextResponse.json({ error: "Yazı bulunamadı" }, { status: 404 });
  return NextResponse.json({ draft });
}

/** DELETE /api/content?id= — Onay kuyruğunda "Reddet": taslak Epicsem'den silinir (sitedeki yazıya dokunulmaz). */
export async function DELETE(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "Geçersiz id" }, { status: 400 });
  const ok = await deleteContentDraft(user.id, id);
  if (!ok) return NextResponse.json({ error: "Yazı bulunamadı" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
