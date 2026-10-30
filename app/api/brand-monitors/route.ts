import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listBrandMonitors } from "@/lib/db";

/** GET /api/brand-monitors — GEO testi yapılmış her marka için son durum (Arvow "LLM Brand Monitors" listesi). */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  return NextResponse.json({ monitors: await listBrandMonitors(user.id) });
}
