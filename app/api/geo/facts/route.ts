import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getBrandKnowledge } from "@/lib/db";
import { getActiveProject } from "@/lib/project-context";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { QuotaError, runSmallAiJson } from "@/lib/ai-small";
import { factCheckPrompt, keepVerified } from "@/lib/fact-check";
import { readableZodError } from "@/lib/zod-error";

export const maxDuration = 120;

const bodySchema = z.object({
  answers: z.array(z.object({ engine: z.string().max(40), prompt: z.string().max(500), text: z.string().max(20000) })).min(1).max(40),
});

/** POST → son GEO cevaplarını aktif projenin Bilgi Bankası'yla karşılaştırır (1 AI sorgusu). */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const lim = rateLimit(`facts:${user.id}`, 10, 60 * 60 * 1000);
  if (!lim.allowed) return NextResponse.json({ error: "Saatte en fazla 10 kontrol. Biraz sonra tekrar dene." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(lim.resetAt)) } });

  let body;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }
  const p = await getActiveProject(user.id);
  if (!p) return NextResponse.json({ error: "Önce bir proje seç." }, { status: 400 });
  const knowledge = (p.settings.knowledge ?? (await getBrandKnowledge(user.id)).content ?? "").trim();
  if (knowledge.length < 40) return NextResponse.json({ error: "no-knowledge" }, { status: 400 });

  // Uzun listede en çok bilgi taşıyan (en uzun) 12 cevap; tek AI sorgusuna sığsın.
  const answers = [...body.answers].sort((a, b) => b.text.length - a.text.length).slice(0, 12);
  try {
    const parsed = await runSmallAiJson(user.id, factCheckPrompt(p.name, knowledge, answers));
    return NextResponse.json({ checked: answers.length, issues: keepVerified(parsed.issues, answers, knowledge) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Kontrol yapılamadı";
    return NextResponse.json({ error: msg }, { status: err instanceof QuotaError ? 402 : 500 });
  }
}
