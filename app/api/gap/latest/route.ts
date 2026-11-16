import { NextRequest, NextResponse } from "next/server";
import { getLatestGapRun } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/** GET /api/gap/latest?domain= → bu domain için en son Gap Analysis koşusu (yoksa run: null). */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const domain = req.nextUrl.searchParams.get("domain") ?? "";
  if (!domain.trim()) return NextResponse.json({ run: null });
  return NextResponse.json({ run: await getLatestGapRun(user.id, domain) });
}
