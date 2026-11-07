import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getBrandKnowledge, getClientSettings, saveBrandKnowledge, saveClientSettings } from "@/lib/db";
import { getActiveProject } from "@/lib/project-context";

/**
 * GET/PUT /api/knowledge — bilgi bankası. Aktif proje varsa o projenin bilgi bankası
 * (Proje ayarları ile aynı alan); yoksa kullanıcı düzeyindeki eski kayıt.
 */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const p = await getActiveProject(user.id);
  const legacy = await getBrandKnowledge(user.id);
  if (!p) return NextResponse.json({ ...legacy, project: null });
  return NextResponse.json({ content: p.settings.knowledge ?? legacy.content, updatedAt: null, project: { id: p.id, name: p.name, domain: p.domain } });
}

export async function PUT(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const { content } = await req.json().catch(() => ({}));
  const text = typeof content === "string" ? content.slice(0, 20000) : "";
  const p = await getActiveProject(user.id);
  if (p) {
    const cur = await getClientSettings(user.id, p.id);
    await saveClientSettings(user.id, p.id, { ...cur, knowledge: text });
  } else await saveBrandKnowledge(user.id, text);
  return NextResponse.json({ ok: true, length: text.length });
}
