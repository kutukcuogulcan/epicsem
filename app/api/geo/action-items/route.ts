import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { listActionItems, listGeoRunHistory, setActionStatus } from "@/lib/db";
import { loadReportData } from "@/lib/geo-report-data";
import { sinceDone } from "@/lib/action-items";

/** Kendi markanın her testteki görünürlüğü (alt markalar yeniden sayılmış özetlerden). */
async function visibilityHistory(userId: number, domain: string) {
  return (await listGeoRunHistory(userId, domain, 60)).map((r) => ({
    createdAt: r.createdAt,
    visibility: (r.summaries.find((s) => s.domain === domain) ?? r.summaries[0])?.visibility ?? 0,
  }));
}

/** GET — aktif projenin takip edilen GEO işleri ve "yapıldı"dan sonraki görünürlük değişimi. */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const d = await loadReportData(user.id);
  if (!d) return NextResponse.json({ items: [] });
  const [items, hist] = await Promise.all([listActionItems(user.id, d.domain), visibilityHistory(user.id, d.domain)]);
  return NextResponse.json({ items: items.map((i) => ({ ...i, since: sinceDone(i, hist) })) });
}

const patchSchema = z.object({ id: z.number().int(), status: z.enum(["open", "doing", "done", "dismissed"]) });

/** PATCH {id, status} — "yapıldı"da o anki görünürlük kaydedilir (sonraki testlerle karşılaştırmak için). */
export async function PATCH(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const b = patchSchema.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  const vis = b.data.status === "done" ? ((await loadReportData(user.id))?.report.visibility ?? null) : null;
  const item = await setActionStatus(user.id, b.data.id, b.data.status, vis);
  if (!item) return NextResponse.json({ error: "İş bulunamadı" }, { status: 404 });
  return NextResponse.json({ item });
}
