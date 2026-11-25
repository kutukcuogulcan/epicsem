import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listPromptHistory } from "@/lib/db";

/** GET ?domain=&days= — prompt başına son N gündeki bütün testlerin toplamı (cevap, anılma, test sayısı). AI yok. */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ history: {} });
  const domain = (req.nextUrl.searchParams.get("domain") ?? "").trim(); // /api/overview ile aynı: kayıttaki biçimiyle
  const days = Math.min(90, Math.max(1, Number(req.nextUrl.searchParams.get("days")) || 30));
  if (!domain) return NextResponse.json({ history: {} });
  return NextResponse.json({ history: await listPromptHistory(user.id, domain, days), days });
}
