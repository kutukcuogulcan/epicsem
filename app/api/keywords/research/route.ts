import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { researchKeywords } from "@/lib/keyword-research";
import { serpAvailable } from "@/lib/serp";

const schema = z.object({
  seed: z.string().trim().min(2, "Bir anahtar kelime yazın").max(80),
  lang: z.string().trim().max(5).default("tr"),
  country: z.string().trim().max(4).default("TR"),
  depth: z.enum(["quick", "deep"]).default("deep"),
});

/** POST /api/keywords/research — Google önerilerinden anahtar kelime keşfi. AI yok, ücretsiz. */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const rl = rateLimit(`kw-research:${user.id}`, 40, 60 * 60 * 1000);
  if (!rl.allowed) return NextResponse.json({ error: "Çok fazla arama — biraz sonra tekrar dene." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rl.resetAt)) } });
  let p;
  try {
    p = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }
  const result = await researchKeywords(p.seed, { lang: p.lang, country: p.country, depth: p.depth });
  return NextResponse.json({ ...result, serpAvailable: serpAvailable() });
}

export async function GET() {
  return NextResponse.json({ serpAvailable: serpAvailable() });
}
