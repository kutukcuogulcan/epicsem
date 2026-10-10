import { NextRequest, NextResponse } from "next/server";
import { getImportRun, listImportRuns } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/** GET /api/import/runs → son taramalar (özet); ?id= → tek taramanın tam sonucu. */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const idParam = req.nextUrl.searchParams.get("id");
  if (idParam) {
    const run = await getImportRun(user.id, Number(idParam));
    if (!run) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    return NextResponse.json(run);
  }
  return NextResponse.json({ runs: await listImportRuns(user.id, 30) });
}
