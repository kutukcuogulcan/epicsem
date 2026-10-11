import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { getCmsConnectionSecret } from "@/lib/db";
import { applyFixesToWordpress, wpPluginInstalled } from "@/lib/wp-apply";

export const maxDuration = 60;

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

/**
 * POST /api/import/apply { connectionId, pageUrl, fixes } → düzeltmeleri WordPress'e yazar (AI yok).
 * GET  /api/import/apply?connectionId= → Epicsem Connector eklentisi kurulu mu?
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const lim = rateLimit(`wp-apply:${user.id}`, 60, 60 * 60 * 1000);
  if (!lim.allowed) return NextResponse.json({ error: "Saatlik uygulama sınırına ulaşıldı." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(lim.resetAt)) } });

  const b = await req.json().catch(() => ({}));
  const conn = await getCmsConnectionSecret(user.id, Number(b.connectionId));
  if (!conn) return NextResponse.json({ error: "Bağlantı bulunamadı." }, { status: 404 });
  if (conn.platform !== "wordpress") return NextResponse.json({ error: "Şimdilik sadece WordPress bağlantılarına uygulanabiliyor." }, { status: 400 });
  const pageUrl = str(b.pageUrl, 2000);
  if (!pageUrl) return NextResponse.json({ error: "Sayfa adresi gerekli." }, { status: 400 });

  const fx = b.fixes ?? {};
  const fixes = {
    seoTitle: str(fx.seoTitle, 200),
    metaDescription: str(fx.metaDescription, 400),
    h1: str(fx.h1, 300),
    schemaJsonLd: str(fx.schemaJsonLd, 20000),
    altTexts: Array.isArray(fx.altTexts)
      ? fx.altTexts.filter((x: any) => x && typeof x.src === "string" && typeof x.alt === "string" && x.alt.trim()).slice(0, 30).map((x: any) => ({ src: x.src, alt: x.alt.trim().slice(0, 250) }))
      : [],
    ogImage:
      fx.ogImage && typeof fx.ogImage.title === "string" && fx.ogImage.title.trim()
        ? { title: fx.ogImage.title.trim().slice(0, 140), brand: String(fx.ogImage.brand ?? "").slice(0, 60), domain: String(fx.ogImage.domain ?? "").slice(0, 100) }
        : undefined,
  };
  try {
    return NextResponse.json(await applyFixesToWordpress({ siteUrl: conn.siteUrl, username: conn.authIdentifier, appPassword: conn.authSecret, pageUrl, fixes }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "WordPress'e yazılamadı" }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const conn = await getCmsConnectionSecret(user.id, Number(req.nextUrl.searchParams.get("connectionId")));
  if (!conn || conn.platform !== "wordpress") return NextResponse.json({ pluginInstalled: false });
  return NextResponse.json({ pluginInstalled: await wpPluginInstalled(conn.siteUrl) });
}
