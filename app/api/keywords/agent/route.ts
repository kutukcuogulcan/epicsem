import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { getActiveProject } from "@/lib/project-context";
import { runKeywordAgent } from "@/lib/keyword-agent";
import { quotaExceededMessage, refundQuota, reserveQuota } from "@/lib/usage-guard";
import { readableZodError } from "@/lib/zod-error";

export const maxDuration = 300;

const AGENT_QUERIES = 5;
const schema = z.object({
  seed: z.string().trim().min(2).max(80),
  keywords: z.array(z.object({ keyword: z.string().trim().min(2).max(120), intent: z.string().max(20), hits: z.number().int().min(0).max(1000) })).min(3).max(200),
});

/** POST {seed, keywords} → kelime agent'ı: kazanılabilirlik + içerik planı (Claude, web araması; 5 AI sorgusu). */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  let b: z.infer<typeof schema>;
  try {
    b = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: readableZodError(e) }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Kelime agent'ı için Claude (Anthropic) anahtarı gerekli — Entegrasyonlar'dan ekle." }, { status: 400 });
  const p = await getActiveProject(user.id);
  if (!p) return NextResponse.json({ error: "Önce bir proje seç." }, { status: 400 });
  const lim = rateLimit(`kw-agent:${user.id}`, 5, 60 * 60 * 1000);
  if (!lim.allowed) return NextResponse.json({ error: "Saatte en fazla 5 agent analizi." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(lim.resetAt)) } });
  const q = await reserveQuota(user.id, "engineQueries", AGENT_QUERIES);
  if (!q.allowed) return NextResponse.json({ error: quotaExceededMessage("engineQueries", q, AGENT_QUERIES) }, { status: 402 });
  try {
    const report = await runKeywordAgent(user.id, b.seed, b.keywords, { name: p.name, domain: p.domain }, (p.competitors ?? []).filter((c) => c.name).slice(0, 5));
    return NextResponse.json({ report });
  } catch (e) {
    await refundQuota(user.id, "engineQueries", AGENT_QUERIES).catch(() => {});
    return NextResponse.json({ error: e instanceof Error ? e.message : "Analiz yapılamadı" }, { status: 500 });
  }
}
