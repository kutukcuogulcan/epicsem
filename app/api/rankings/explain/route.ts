import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listRankKeywords, rankSerps } from "@/lib/db";
import { explainMove } from "@/lib/rank-explain";

/** GET /api/rankings/explain?id= — son iki kontroldeki Google ilk 10'una göre sıra değişiminin nedeni (ücretsiz). */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const id = Number(req.nextUrl.searchParams.get("id"));
  const kw = (await listRankKeywords(user.id)).find((k) => k.id === id);
  if (!kw) return NextResponse.json({ error: "Kelime bulunamadı" }, { status: 404 });
  const [cur, prev] = await rankSerps(user.id, id);
  if (!cur) return NextResponse.json({ explanation: null, top: [], paa: [], aiOverview: false });
  const explanation = explainMove(kw.domain, prev?.position ?? null, cur.position, prev?.serp ?? null, cur.serp);
  return NextResponse.json({ explanation, top: cur.serp.top, paa: cur.serp.paa, aiOverview: cur.serp.ai, checkedAt: cur.at, prevAt: prev?.at ?? null });
}
