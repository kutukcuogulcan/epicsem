import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getContentDraft, listContentDrafts } from "@/lib/db";
import { getActiveProject } from "@/lib/project-context";

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
  const drafts = await listContentDrafts(user.id, 200);
  if (req.nextUrl.searchParams.get("all") === "1") return NextResponse.json({ drafts: drafts.slice(0, 60) });
  const project = await getActiveProject(user.id).catch(() => null);
  if (!project) return NextResponse.json({ drafts: drafts.slice(0, 60), project: null });
  return NextResponse.json({ drafts: drafts.filter((d) => !d.site || d.site === project.domain).slice(0, 60), project: project.domain });
}
