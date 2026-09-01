import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getContentDraft, listContentDrafts } from "@/lib/db";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  const idParam = req.nextUrl.searchParams.get("id");
  if (idParam) {
    const id = Number(idParam);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const draft = getContentDraft(user.id, id);
    if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ draft });
  }

  return NextResponse.json({ drafts: listContentDrafts(user.id) });
}
