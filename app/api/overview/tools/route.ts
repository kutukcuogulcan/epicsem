import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { campaignsOverview, clientsOverview, localOverview, monitorOverview } from "@/lib/db";

/** GET /api/overview/tools?tool=monitor|campaigns|local|clients → araç sayfasının pano verisi. */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const tool = req.nextUrl.searchParams.get("tool");
  if (tool === "monitor") return NextResponse.json(await monitorOverview(user.id));
  if (tool === "campaigns") return NextResponse.json(await campaignsOverview(user.id));
  if (tool === "local") return NextResponse.json(await localOverview(user.id));
  if (tool === "clients") return NextResponse.json(await clientsOverview(user.id));
  return NextResponse.json({ error: "Bilinmeyen araç" }, { status: 400 });
}
