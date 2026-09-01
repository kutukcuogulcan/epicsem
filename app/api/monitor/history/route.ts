import { NextRequest, NextResponse } from "next/server";
import { getMonitorCheckHistory } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/**
 * GET /api/monitor/history?pageId=123 -> chronological score history for the trend
 * chart on /monitor. Deliberately per-page rather than "all pages at once" — a page
 * ownership check happens inside getMonitorCheckHistory itself.
 */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  const pageId = Number(req.nextUrl.searchParams.get("pageId"));
  if (!pageId || Number.isNaN(pageId)) {
    return NextResponse.json({ error: "pageId query param is required" }, { status: 400 });
  }

  const history = getMonitorCheckHistory(user.id, pageId);
  return NextResponse.json({ history });
}
