import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { checkQuota, consumeQuota, quotaExceededMessage } from "@/lib/usage-guard";
import { isDemoMode, runFast } from "@/lib/geo-providers";
import { extractJsonArray } from "@/lib/llm-json";
import { generatePersonaPrompts, PERSONAS } from "@/lib/persona-prompts";

const bodySchema = z.object({
  brand: z.string().trim().max(80).default(""),
  category: z.string().trim().min(2, "Ürün/hizmet kategorisini yazın").max(80),
  city: z.string().trim().max(40).optional(),
  competitors: z.array(z.string().trim().max(80)).max(6).default([]),
  personaIds: z.array(z.string()).max(10).default([]),
  customPersonas: z.array(z.string().trim().max(80)).max(4).default([]),
});

/**
 * POST /api/geo/persona-prompts — persona sorularını AI ile zenginleştirir (1 prompt önerisi kredisi).
 * Ücretsiz kalıp üretimi tarayıcıda yapılır (lib/persona-prompts.ts); bu uç nokta yalnızca
 * kullanıcı "✦ AI ile zenginleştir"e bastığında çağrılır. Anahtar yoksa kalıplara düşer.
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const rl = rateLimit(`persona-prompts:${user.id}`, 20, 60 * 60 * 1000);
  if (!rl.allowed) return NextResponse.json({ error: "Çok fazla istek — biraz sonra tekrar dene." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rl.resetAt)) } });

  let p;
  try {
    p = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }
  const personas = [
    ...PERSONAS.filter((x) => p.personaIds.includes(x.id)).map((x) => ({ label: x.label, description: x.description })),
    ...p.customPersonas.filter(Boolean).map((c) => ({ label: c.slice(0, 40), description: c })),
  ];
  if (!personas.length) return NextResponse.json({ error: "En az bir persona seçin" }, { status: 400 });

  const fallback = () => generatePersonaPrompts({ category: p.category, brand: p.brand, competitors: p.competitors, city: p.city, personaIds: p.personaIds, customPersonas: p.customPersonas });
  if (isDemoMode()) return NextResponse.json({ prompts: fallback(), ai: false, demoMode: true });

  const quota = await checkQuota(user.id, "promptSuggestions", 1);
  if (!quota.allowed) return NextResponse.json({ error: quotaExceededMessage("promptSuggestions", quota, 1) }, { status: 402 });

  const prompt = [
    `You generate realistic questions that real people type into AI assistants (ChatGPT, Gemini, Perplexity) when looking for: "${p.category}"${p.city ? ` in ${p.city}` : ""}.`,
    `Write in Turkish, in natural everyday language, the way each persona below would actually ask. Mix discovery questions (no brand named) and comparison questions. Do NOT name "${p.brand || "the brand"}" in more than one question per persona.${p.competitors.length ? ` Competitors you may mention in comparisons: ${p.competitors.join(", ")}.` : ""}`,
    "Personas:",
    ...personas.map((x) => `- ${x.label}: ${x.description}`),
    "",
    'Return ONLY a JSON array, 5 items per persona: [{"persona": "<persona label exactly as given>", "text": "<question>"}]',
  ].join("\n");

  try {
    const res = await runFast(prompt, 0.8);
    if (!res) return NextResponse.json({ prompts: fallback(), ai: false });
    const arr = extractJsonArray(res.text)
      .map((x: any) => ({ persona: String(x?.persona ?? "").slice(0, 40), text: String(x?.text ?? "").trim() }))
      .filter((x: { text: string }) => x.text.length > 8 && x.text.length < 220);
    await consumeQuota(user.id, "promptSuggestions", 1);
    return NextResponse.json({ prompts: arr.length ? arr : fallback(), ai: arr.length > 0 });
  } catch {
    return NextResponse.json({ prompts: fallback(), ai: false });
  }
}
