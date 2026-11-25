import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getClient } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { autofillCompetitors } from "@/lib/competitor-autofill";

export const maxDuration = 120;

/** POST { id } — projenin boş olan rakiplerini ve alt markalarını bulup yazar (1 AI sorgusu, siteyle doğrulanır). */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  if (!rateLimit(`competitor-autofill:${user.id}`, 6, 60 * 60 * 1000).allowed) return NextResponse.json({ error: "Saatlik sınıra ulaştın." }, { status: 429 });
  const p = z.object({ id: z.number() }).safeParse(await req.json().catch(() => ({})));
  if (!p.success) return NextResponse.json({ error: "Proje gerekli." }, { status: 400 });
  const c = await getClient(user.id, p.data.id);
  if (!c) return NextResponse.json({ error: "Proje bulunamadı." }, { status: 404 });
  if (c.competitors.length && c.aliases.length) return NextResponse.json({ error: "Rakipler ve alt markalar zaten dolu." }, { status: 400 });
  await autofillCompetitors(user.id, c.id, c.domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""));
  const after = await getClient(user.id, c.id);
  return NextResponse.json({ competitors: after?.competitors ?? [], aliases: after?.aliases ?? [] });
}
