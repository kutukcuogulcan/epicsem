import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { findImages } from "@/lib/article-enrich";

/** GET /api/editor/images?q=a&q=b — Openverse'ten ticari kullanıma açık lisanslı görsel önerisi (AI yok, ücretsiz). */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const lim = rateLimit(`editor-img:${user.id}`, 60, 60 * 60 * 1000);
  if (!lim.allowed) return NextResponse.json({ error: "Çok fazla istek." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(lim.resetAt)) } });
  const qs = req.nextUrl.searchParams.getAll("q").map((q) => q.trim().slice(0, 60)).filter(Boolean).slice(0, 3);
  if (!qs.length) return NextResponse.json({ images: [] });
  const images = await findImages(qs, 4).catch(() => []);
  return NextResponse.json({ images });
}
