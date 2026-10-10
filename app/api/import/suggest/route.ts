import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { suggestPageFix } from "@/lib/page-fix-suggest";

export const maxDuration = 60;

/** POST /api/import/suggest { url, issues[] } → tek sayfa için somut düzeltme önerisi. */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const limit = rateLimit(`page-suggest:${user.id}`, 40, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Saatte en fazla 40 öneri üretilebilir." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limit.resetAt)) } });
  }
  const body = await req.json().catch(() => ({}));
  const url = typeof body.url === "string" ? body.url : "";
  if (!/^https?:\/\//i.test(url)) return NextResponse.json({ error: "Geçerli bir sayfa adresi gerekli." }, { status: 400 });
  const issues = Array.isArray(body.issues) ? body.issues.filter((x: unknown) => typeof x === "string").slice(0, 30) : [];
  try {
    return NextResponse.json(await suggestPageFix(url, issues));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Öneri üretilemedi" }, { status: 400 });
  }
}
