import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { analyzeSerp, serpAvailable } from "@/lib/serp";

const schema = z.object({ keyword: z.string().trim().min(2).max(120), gl: z.string().max(4).default("tr"), hl: z.string().max(5).default("tr") });

/** POST /api/keywords/serp — Google ilk sayfa rakip analizi (ContentSwift mantığı). SerpApi: 1 arama. */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  if (!serpAvailable()) return NextResponse.json({ error: "SERP analizi için SerpApi anahtarı gerekli (yönetici Render'a SERPAPI_API_KEY eklemeli).", needsKey: true }, { status: 400 });
  const rl = rateLimit(`kw-serp:${user.id}`, 20, 60 * 60 * 1000);
  if (!rl.allowed) return NextResponse.json({ error: "Saatlik SERP analizi sınırına ulaştın." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rl.resetAt)) } });
  let p;
  try {
    p = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }
  try {
    return NextResponse.json(await analyzeSerp(p.keyword, { gl: p.gl, hl: p.hl }));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "SERP analizi başarısız" }, { status: 502 });
  }
}
