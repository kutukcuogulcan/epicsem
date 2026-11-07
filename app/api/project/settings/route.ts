import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { saveClientSettings, updateClient } from "@/lib/db";
import { getActiveProject } from "@/lib/project-context";
import { readableZodError } from "@/lib/zod-error";

/** GET → aktif proje + ayarları. PUT { name?, domain?, competitors?, settings } → kaydet. */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  try {
    return NextResponse.json({ project: await getActiveProject(user.id) });
  } catch (e) {
    console.error("[api/project/settings] GET failed:", e);
    return NextResponse.json({ error: "Proje ayarları alınamadı." }, { status: 500 });
  }
}

const str = (n: number) => z.string().max(n).optional();
const schema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  domain: z.string().trim().min(3).max(120).optional(),
  competitors: z.array(z.object({ name: z.string().trim().min(1).max(80), domain: z.string().trim().min(3).max(120) })).max(8).optional(),
  settings: z.object({
    description: str(1500),
    language: str(10),
    country: str(60),
    audience: str(1500),
    tone: z.enum(["professional", "friendly", "expert", "simple"]).optional(),
    address: z.enum(["siz", "sen"]).optional(),
    voiceNotes: str(1500),
    avoid: str(1000),
    products: str(3000),
    usps: str(1500),
    cta: str(300),
    knowledge: str(20000),
  }),
});

export async function PUT(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const p = await getActiveProject(user.id);
  if (!p) return NextResponse.json({ error: "Önce sol menüden bir proje seç ya da oluştur." }, { status: 400 });
  let b;
  try {
    b = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: readableZodError(e) }, { status: 400 });
  }
  try {
    if (b.name || b.domain || b.competitors) await updateClient(user.id, p.id, { name: b.name, domain: b.domain, competitors: b.competitors });
    await saveClientSettings(user.id, p.id, b.settings);
    return NextResponse.json({ project: await getActiveProject(user.id) });
  } catch (e) {
    console.error("[api/project/settings] PUT failed:", e);
    return NextResponse.json({ error: "Kaydedilemedi." }, { status: 500 });
  }
}
