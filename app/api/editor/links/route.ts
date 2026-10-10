import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getLatestCrawlPages } from "@/lib/db";

/** GET /api/editor/links?domain= → o alan adının son Site Taraması'ndaki sayfalar (iç link önerisi için, AI yok). */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const d = (req.nextUrl.searchParams.get("domain") ?? "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim();
  if (!d) return NextResponse.json({ pages: [] });
  return NextResponse.json({ pages: await getLatestCrawlPages(user.id, d) });
}
