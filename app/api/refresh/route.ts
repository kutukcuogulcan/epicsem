import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getActiveProject } from "@/lib/project-context";
import { findRefreshCandidates } from "@/lib/content-refresh";

/** GET /api/refresh — aktif projenin yenilenmesi gereken yazıları (AI kullanmaz). */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const project = await getActiveProject(user.id).catch(() => null);
  const domain = req.nextUrl.searchParams.get("domain") || project?.domain;
  if (!domain) return NextResponse.json({ items: [], domain: null });
  const items = await findRefreshCandidates(user.id, domain);
  return NextResponse.json({ items, domain });
}
