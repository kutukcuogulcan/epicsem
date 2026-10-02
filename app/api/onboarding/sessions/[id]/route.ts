import { NextRequest, NextResponse } from "next/server";
import { getOnboardingSession } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/** GET /api/onboarding/sessions/:id — the wizard's poll endpoint. Kabul kriteri: "Sayfa
 * yenilendiğinde kullanıcı kaldığı adımdan devam eder" — the wizard carries this id in the
 * URL's query string and just calls this again on mount, so the whole chain's current state
 * (every step's status/result/error) comes back in one shot regardless of whether the chain
 * is still running server-side or already finished while the tab was closed. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  const { id } = await params;
  const sessionId = Number(id);
  if (!Number.isInteger(sessionId)) {
    return NextResponse.json({ error: "Geçersiz oturum id" }, { status: 400 });
  }

  const session = await getOnboardingSession(user.id, sessionId);
  if (!session) return NextResponse.json({ error: "Oturum bulunamadı" }, { status: 404 });

  return NextResponse.json({ session });
}
