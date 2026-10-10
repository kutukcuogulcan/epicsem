import { NextResponse } from "next/server";
import { listRecentAuditRuns } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/** GET /api/audit/runs → /audit panosu için kullanıcının son denetimleri (eskiden yeniye). */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const runs = await listRecentAuditRuns(user.id);
  return NextResponse.json({ runs });
}
