import { NextRequest, NextResponse } from "next/server";
import { brandedCover } from "@/lib/covers";
import { rateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/auth";
import { ogimgImage } from "@/lib/integrations";

/**
 * GET /api/og?title=&brand=&domain= — 1200×630 paylaşım (Open Graph) görseli üretir (ShotOG mantığı).
 * Ücretsiz, AI yok. Önizleme ve indirme için; önbelleğe alınabilir.
 * &provider=ogimg → giriş yapmış kullanıcının ogimg bağlantısıyla şablonlu görsel (hata olursa markalı kapağa düşer).
 */
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  const rl = rateLimit(`og:${ip}`, 120, 60 * 60 * 1000);
  if (!rl.allowed) return new NextResponse("Too many requests", { status: 429 });
  const sp = req.nextUrl.searchParams;
  const title = (sp.get("title") ?? "").slice(0, 140) || "Başlık";
  const brand = (sp.get("brand") ?? "").slice(0, 60);
  const domain = (sp.get("domain") ?? "").slice(0, 100);
  let png: Buffer | null = null;
  let fallback = "";
  if (sp.get("provider") === "ogimg") {
    const user = await requireUser();
    if (user) {
      try {
        png = await ogimgImage(user.id, { title, siteName: brand });
      } catch (e) {
        fallback = e instanceof Error ? e.message : "ogimg hatası";
      }
    }
  }
  png ??= await brandedCover(title, brand, domain);
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": sp.get("provider") ? "private, max-age=3600" : "public, max-age=86400", ...(fallback ? { "X-Og-Fallback": encodeURIComponent(fallback) } : {}), ...(sp.get("download") ? { "Content-Disposition": `attachment; filename="paylasim-gorseli.png"` } : {}) },
  });
}
