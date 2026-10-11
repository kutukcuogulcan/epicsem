import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDraftCover } from "@/lib/db";

/** Taslak kapak görseli — sahibi oturumla, webhook alıcıları ?t=<token> ile görebilir. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cover = await getDraftCover(Number(id));
  if (!cover) return new NextResponse("Not found", { status: 404 });
  const token = req.nextUrl.searchParams.get("t");
  let allowed = !!token && token === cover.token;
  if (!allowed) {
    const user = await getCurrentUser().catch(() => null);
    allowed = !!user && user.id === cover.userId;
  }
  if (!allowed) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(cover.data), {
    headers: { "Content-Type": cover.mime, "Cache-Control": "private, max-age=3600" },
  });
}
