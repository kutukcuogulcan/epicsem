import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { setSourceType } from "@/lib/db";
import { getActiveProject } from "@/lib/project-context";

const TYPES = ["Corporate", "Retail", "Editorial", "Government", "Reference", "UGC", "Other"] as const;
const schema = z.object({ domain: z.string().trim().min(3).max(200), type: z.enum(TYPES).nullable() });

/** POST {domain, type} — aktif projede bir kaynağın tipini elle değiştir (null: otomatiğe dön). Eski testler yeniden hesaplanır. */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const b = schema.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Geçersiz kaynak tipi" }, { status: 400 });
  const p = await getActiveProject(user.id);
  if (!p) return NextResponse.json({ error: "Önce bir proje seç" }, { status: 400 });
  await setSourceType(user.id, p.id, b.data.domain, b.data.type);
  return NextResponse.json({ ok: true });
}
