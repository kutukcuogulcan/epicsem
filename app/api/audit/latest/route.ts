import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getLatestAuditForHost } from "@/lib/db";

/** GET /api/audit/latest?domain=ornek.com → o sitenin en son denetimi (tam sonuç) ve skor geçmişi. */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const domain = (req.nextUrl.searchParams.get("domain") ?? "").trim();
  if (!domain) return NextResponse.json({ latest: null });
  return NextResponse.json({ latest: await getLatestAuditForHost(user.id, domain) });
}
