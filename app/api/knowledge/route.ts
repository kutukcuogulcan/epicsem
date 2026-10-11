import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getBrandKnowledge, saveBrandKnowledge } from "@/lib/db";

/** GET/PUT /api/knowledge — marka bilgi bankası (AI yazarken kullanılır). */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  return NextResponse.json(await getBrandKnowledge(user.id));
}

export async function PUT(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const { content } = await req.json().catch(() => ({}));
  const text = typeof content === "string" ? content.slice(0, 20000) : "";
  await saveBrandKnowledge(user.id, text);
  return NextResponse.json({ ok: true, length: text.length });
}
