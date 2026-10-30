import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { setBacklinkCache } from "@/lib/db";
import { rootHost } from "@/lib/backlinks";
import { parseBacklinkCsv } from "@/lib/free-backlinks";

/**
 * POST { site, csv, fileName? } — Search Console / Bing / Ahrefs Webmaster Tools / Semrush'tan
 * indirilen link listesini içe aktarır. DELETE ?site= içe aktarılanı siler.
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const rl = rateLimit(`backlink-import:${user.id}`, 20, 60 * 60 * 1000);
  if (!rl.allowed) return NextResponse.json({ error: "Saatlik içe aktarma sınırına ulaştın." }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  const site = rootHost(String(b.site ?? ""));
  const csv = String(b.csv ?? "");
  if (!site) return NextResponse.json({ error: "Önce siteni yaz." }, { status: 400 });
  if (!csv.trim()) return NextResponse.json({ error: "CSV dosyası boş." }, { status: 400 });
  if (csv.length > 5_000_000) return NextResponse.json({ error: "Dosya çok büyük (en fazla 5 MB)." }, { status: 400 });
  try {
    const r = parseBacklinkCsv(csv, site);
    await setBacklinkCache(user.id, `import:${site}`, { ...r, fileName: b.fileName ? String(b.fileName).slice(0, 120) : null });
    return NextResponse.json({ ok: true, domains: r.domains.length, rows: r.rows, tool: r.tool });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "CSV okunamadı." }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const site = rootHost(req.nextUrl.searchParams.get("site") ?? "");
  if (!site) return NextResponse.json({ error: "Site gerekli." }, { status: 400 });
  // Boş içe aktarma kaydı = silinmiş sayılır (cache tablosu üzerinden).
  await setBacklinkCache(user.id, `import:${site}`, { domains: [], tool: "", rows: 0, fileName: null });
  return NextResponse.json({ ok: true });
}
