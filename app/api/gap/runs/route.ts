import { NextResponse } from "next/server";
import { listRecentGapRuns } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/** GET /api/gap/runs → /gap panosu için son Gap Analysis koşuları. */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  return NextResponse.json({ runs: await listRecentGapRuns(user.id) });
}
