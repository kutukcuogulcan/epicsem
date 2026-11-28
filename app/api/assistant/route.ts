import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listKnownSites } from "@/lib/db";
import { answer, ASSISTANT_SUGGESTIONS } from "@/lib/seo-assistant";
import { aiAnswer } from "@/lib/assistant-ai";
import { isDemoMode } from "@/lib/geo-providers";
import { rateLimit } from "@/lib/rate-limit";

/** GET → bilinen siteler + örnek sorular. POST { message, site } → AI cevabı (projenin gerçek verileriyle, 1 AI sorgusu); olmazsa kural tabanlı cevap. */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  return NextResponse.json({ sites: await listKnownSites(user.id), suggestions: ASSISTANT_SUGGESTIONS });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const message = typeof b.message === "string" ? b.message.slice(0, 500) : "";
  const site = typeof b.site === "string" && b.site.trim() ? b.site.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "") : null;
  // Serbest soru AI ile, projenin gerçek verileriyle cevaplanır (1 AI sorgusu); AI yoksa/kota bittiyse kural tabanlı cevap.
  if (site && message.trim().length >= 3 && !isDemoMode() && rateLimit(`assistant-ai:${user.id}`, 30, 60 * 60 * 1000).allowed) {
    try {
      return NextResponse.json(await aiAnswer(user.id, message, site));
    } catch (e) {
      console.warn("[assistant] AI cevabı yok, kural tabanlıya düşülüyor:", e instanceof Error ? e.message : e);
    }
  }
  return NextResponse.json(await answer(user.id, message, site));
}
