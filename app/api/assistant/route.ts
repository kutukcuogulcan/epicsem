import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listKnownSites } from "@/lib/db";
import { answer, ASSISTANT_SUGGESTIONS } from "@/lib/seo-assistant";

/** GET → bilinen siteler + örnek sorular. POST { message, site } → kural tabanlı cevap (AI yok, ücretsiz). */
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
  const site = typeof b.site === "string" && b.site.trim() ? b.site.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "") : null;
  return NextResponse.json(await answer(user.id, message, site));
}
