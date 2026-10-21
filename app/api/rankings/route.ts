import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";
import { addRankKeywords, deleteRankKeyword, getIntegration, listRankKeywords, rankHistory } from "@/lib/db";
import { serpKeyFor } from "@/lib/integrations";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const [keywords, history, serpKey, sb] = await Promise.all([listRankKeywords(user.id), rankHistory(user.id), serpKeyFor(user.id), getIntegration(user.id, "serpbear")]);
  return NextResponse.json({ keywords, history, serpAvailable: !!serpKey, serpbearAvailable: !!(sb?.config.baseUrl && sb.secrets.apiKey) });
}

const addSchema = z.object({
  domain: z.string().trim().min(3).max(200).transform((d) => d.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase()),
  keywords: z.array(z.string().trim().min(2).max(120)).min(1).max(100),
  gl: z.string().trim().max(4).default("tr"),
});

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  let p;
  try {
    p = addSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }
  const existing = await listRankKeywords(user.id);
  if (existing.length + p.keywords.length > 300) return NextResponse.json({ error: "En fazla 300 kelime takip edilebilir." }, { status: 400 });
  const added = await addRankKeywords(user.id, p.domain, Array.from(new Set(p.keywords.map((k) => k.toLocaleLowerCase("tr")))), p.gl.toLowerCase());
  return NextResponse.json({ added });
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const ids: number[] = Array.isArray(body?.ids) ? body.ids.map(Number) : [Number(body?.id)];
  for (const id of ids.filter(Number.isInteger)) await deleteRankKeyword(user.id, id);
  return NextResponse.json({ ok: true });
}
