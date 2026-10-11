import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getLatestGeoRunFull } from "@/lib/db";

/** GET /api/geo/latest[?domain=] — son GEO testinin ayrıntıları (rakip kartları ve fırsatlar için). */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const domain = req.nextUrl.searchParams.get("domain") || undefined;
  return NextResponse.json({ run: await getLatestGeoRunFull(user.id, domain) });
}
