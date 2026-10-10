import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { importPageAsMarkdown } from "@/lib/editor-import";

/** POST /api/editor/import { url } → sayfanın içeriği markdown olarak (AI yok, ücretsiz). */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const { url } = await req.json().catch(() => ({}));
  const u = typeof url === "string" ? url.trim() : "";
  if (!u) return NextResponse.json({ error: "Sayfa adresi gerekli." }, { status: 400 });
  try {
    return NextResponse.json(await importPageAsMarkdown(/^https?:\/\//i.test(u) ? u : `https://${u}`));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "İçerik alınamadı" }, { status: 400 });
  }
}
