import { NextRequest, NextResponse } from "next/server";
import { brandedCover } from "@/lib/covers";
import { rateLimit } from "@/lib/rate-limit";

/**
 * GET /api/og?title=&brand=&domain= — 1200×630 paylaşım (Open Graph) görseli üretir (ShotOG mantığı).
 * Ücretsiz, AI yok. Önizleme ve indirme için; önbelleğe alınabilir.
 */
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  const rl = rateLimit(`og:${ip}`, 120, 60 * 60 * 1000);
  if (!rl.allowed) return new NextResponse("Too many requests", { status: 429 });
  const sp = req.nextUrl.searchParams;
  const title = (sp.get("title") ?? "").slice(0, 140) || "Başlık";
  const brand = (sp.get("brand") ?? "").slice(0, 60);
  const domain = (sp.get("domain") ?? "").slice(0, 100);
  const png = await brandedCover(title, brand, domain);
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400", ...(sp.get("download") ? { "Content-Disposition": `attachment; filename="paylasim-gorseli.png"` } : {}) },
  });
}
