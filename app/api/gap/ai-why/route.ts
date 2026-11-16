import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchPageSummary } from "@/lib/content-fetch";
import { isDemoMode } from "@/lib/geo-providers";
import { readableZodError } from "@/lib/zod-error";
import { guardSmallAi, QuotaError, runSmallAiJson, str } from "@/lib/ai-small";

export const maxDuration = 60;

const bodySchema = z.object({
  brand: z.object({ name: z.string().min(1).max(120), domain: z.string().min(3).max(200) }),
  rival: z.object({ name: z.string().min(1).max(120), domain: z.string().min(3).max(200), visibility: z.number().min(0).max(1) }),
  ownVisibility: z.number().min(0).max(1).nullable(),
  lostQuestions: z.array(z.string().max(300)).max(15).default([]),
});

/**
 * POST /api/gap/ai-why — "Rakip neden önde?" Rakibin ve markanın ana sayfasını okuyup,
 * AI motorlarının rakibi neden daha çok önerdiğine dair somut farkları ve yapılacakları çıkarır.
 * Yalnızca sayfalarda görülenle konuşur; 1 AI motor sorgusu.
 */
export async function POST(req: NextRequest) {
  const g = await guardSmallAi("gap-why");
  if (g instanceof NextResponse) return g;
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }
  if (isDemoMode())
    return NextResponse.json({
      demo: true,
      result: { summary: `Demo mod: ${body.rival.name} sitesinin neden önde olduğu burada özetlenir.`, differences: [{ them: "Fiyat sayfası var", you: "Fiyat bilgisi yok" }], todo: ["Gerçek anahtar tanımlanınca siteye özel adımlar burada görünür."] },
    });

  const [own, rival] = await Promise.all([fetchPageSummary(body.brand.domain).catch(() => null), fetchPageSummary(body.rival.domain).catch(() => null)]);
  if (!rival) return NextResponse.json({ error: `${body.rival.domain} okunamadı.` }, { status: 502 });

  const prompt = `Sen bir GEO (yapay zekâ arama optimizasyonu) uzmanısın. ChatGPT/Gemini/Claude gibi motorlar "${body.rival.name}" markasını %${Math.round(body.rival.visibility * 100)} oranında öneriyor, "${body.brand.name}" ise %${Math.round((body.ownVisibility ?? 0) * 100)}.
Aşağıda iki markanın ana sayfası var. AI motorlarının rakibi neden daha çok önerdiğini, SAYFALARDA GÖRÜLEN somut farklara dayanarak açıkla. Uydurma; sayfada olmayan şeyi iddia etme. Türkçe yaz.
${body.lostQuestions.length ? `Markanın kaybettiği sorular:\n${body.lostQuestions.map((q) => `- ${q}`).join("\n")}\n` : ""}
RAKİP (${body.rival.domain}) — başlık: ${rival.title ?? ""} · açıklama: ${rival.metaDescription ?? ""}
Metin: ${rival.bodyText.slice(0, 3500)}

MARKA (${body.brand.domain}) — başlık: ${own?.title ?? "(okunamadı)"} · açıklama: ${own?.metaDescription ?? ""}
Metin: ${(own?.bodyText ?? "").slice(0, 3500)}

Yalnızca şu JSON'u döndür:
{"summary":"2–3 cümlelik özet: rakip neden önde","differences":[{"them":"rakipte olan (kısa)","you":"markada durum (kısa)"}],"todo":["markanın bu hafta yapabileceği somut adım"]}
differences en fazla 5, todo en fazla 5.`;
  try {
    const p = await runSmallAiJson(g.userId, prompt);
    const result = {
      summary: str(p.summary, 600) ?? "",
      differences: (Array.isArray(p.differences) ? p.differences : []).map((d: any) => ({ them: str(d?.them, 200) ?? "", you: str(d?.you, 200) ?? "" })).filter((d: any) => d.them).slice(0, 5),
      todo: (Array.isArray(p.todo) ? p.todo : []).map((t: unknown) => str(t, 300)).filter(Boolean).slice(0, 5),
    };
    return NextResponse.json({ result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Analiz başarısız." }, { status: e instanceof QuotaError ? 402 : 500 });
  }
}
