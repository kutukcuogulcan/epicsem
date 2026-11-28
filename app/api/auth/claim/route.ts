import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSessionCookie, demoOwnerUser } from "@/lib/auth";

/** GET /api/auth/claim?key=… — sahibin tarayıcısını eski ortak hesaba (projelerinin olduğu) uzun süreli bağlar.
 * Anahtar Render'daki OWNER_CLAIM_KEY; tanımlı değilse uç nokta yok sayılır. */
export async function GET(req: NextRequest) {
  const want = process.env.OWNER_CLAIM_KEY ?? "";
  const got = req.nextUrl.searchParams.get("key") ?? "";
  const g = Buffer.from(got);
  const w = Buffer.from(want);
  const ok = w.length >= 24 && g.length === w.length && timingSafeEqual(g, w);
  if (!ok) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
  const owner = await demoOwnerUser();
  await createSessionCookie(owner.id, 3650);
  // Göreli yönlendirme: Render'ın arkasında req.url iç adres (localhost:10000) olur.
  return new NextResponse(null, { status: 303, headers: { Location: "/dashboard" } });
}
