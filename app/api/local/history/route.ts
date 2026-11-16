import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listLocalGenerations } from "@/lib/db";

/** GET /api/local/history?kind=gbp-post|review-reply&business= → üretilen taslakların geçmişi. */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const kind = req.nextUrl.searchParams.get("kind") === "review-reply" ? "review-reply" : "gbp-post";
  const business = req.nextUrl.searchParams.get("business")?.trim() || null;
  return NextResponse.json({ items: await listLocalGenerations(user.id, kind, business) });
}
