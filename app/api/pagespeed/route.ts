import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { getIntegration } from "@/lib/db";
import { runPageSpeed } from "@/lib/pagespeed";

/** GET /api/pagespeed?url=&strategy=mobile|desktop — gerçek kullanıcı (CrUX) + laboratuvar hız verisi. */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const rl = rateLimit(`psi:${user.id}`, 40, 60 * 60 * 1000);
  if (!rl.allowed) return NextResponse.json({ error: "Saatlik hız ölçümü sınırına ulaştın." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rl.resetAt)) } });
  const url = req.nextUrl.searchParams.get("url") ?? "";
  if (/^https?:\/\/(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.)/i.test(url)) return NextResponse.json({ error: "Yerel adresler Google tarafından ölçülemez." }, { status: 400 });
  if (!/^https?:\/\/[^/\s]+\.[^/\s]+/.test(url)) return NextResponse.json({ error: "Geçerli bir adres gir (https://…)." }, { status: 400 });
  const strategy = req.nextUrl.searchParams.get("strategy") === "desktop" ? "desktop" : "mobile";
  const i = await getIntegration(user.id, "google_psi").catch(() => null);
  try {
    return NextResponse.json(await runPageSpeed(url, { strategy, apiKey: i?.secrets.apiKey }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ölçüm başarısız" }, { status: 502 });
  }
}
