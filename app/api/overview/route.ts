import { NextRequest, NextResponse } from "next/server";
import { listGeoBrands, listGeoRunsForOverview } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/** GET /api/overview?brand=domain → /geo panosu için Peec tarzı Genel bakış verisi. */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const brands = await listGeoBrands(user.id);
  const wanted = req.nextUrl.searchParams.get("brand");
  const selected = brands.find((b) => b.brandDomain === wanted) ?? brands[0];
  const runs = selected ? await listGeoRunsForOverview(user.id, selected.brandDomain, 90) : [];
  return NextResponse.json({ brands, selectedDomain: selected?.brandDomain ?? null, runs });
}
