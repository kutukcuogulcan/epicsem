import { NextRequest, NextResponse } from "next/server";
import { crawlSiteBulk } from "@/lib/site-bulk-crawler";
import { saveImportRun } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";

export const maxDuration = 180;

/** POST /api/import/crawl { url, maxPages? } → Epicsem'in kendi tarayıcısıyla tüm-site teknik tarama. */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  const limit = rateLimit(`site-crawl:${user.id}`, 10, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Saatte en fazla 10 site taraması yapılabilir — biraz sonra tekrar dene." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limit.resetAt)) } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) return NextResponse.json({ error: "Bir site adresi gir." }, { status: 400 });
  const maxPages = Math.min(500, Math.max(10, Number(body.maxPages) || 150));

  try {
    const result = await crawlSiteBulk(url, maxPages);
    let id: number | null = null;
    try {
      id = await saveImportRun(user.id, result);
    } catch (e) {
      console.error("site crawl save failed:", e);
    }
    return NextResponse.json({ ...result, id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Tarama başarısız oldu" }, { status: 400 });
  }
}
