import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { isDemoMode, runFast } from "@/lib/geo-providers";
import { runForJsonObject } from "@/lib/llm-json";
import { getActiveProject } from "@/lib/project-context";
import { checkQuota, consumeQuota, quotaExceededMessage } from "@/lib/usage-guard";
import { readableZodError } from "@/lib/zod-error";

export const maxDuration = 60;

const bodySchema = z.object({
  seed: z.string().min(1).max(120),
  lang: z.string().max(5).default("tr"),
  keywords: z.array(z.string().min(1).max(120)).min(3).max(200),
});

export interface AiCluster {
  name: string;
  intent: "question" | "commercial" | "comparison" | "local" | "informational";
  title: string;
  keywords: string[];
}
export interface AiPrompt {
  prompt: string;
  keyword: string;
}

/**
 * POST /api/keywords/ai — Anahtar Kelime Planlayıcı'nın "AI ile kümele" butonu.
 * Bulunan kelimeleri ANLAMA göre konu kümelerine ayırır (her küme = bir yazı, önerilen başlıkla)
 * ve kelimeleri insanların ChatGPT/Gemini'ye soracağı doğal soru hâline (GEO prompt) çevirir.
 * Tek küçük AI çağrısı (hızlı model) → 1 AI motor sorgusu kotası. Kelime uydurmaz; yalnızca verilenleri gruplar.
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const lim = rateLimit(`kw-ai:${user.id}`, 20, 60 * 60 * 1000);
  if (!lim.allowed) return NextResponse.json({ error: "Saatlik sınıra ulaşıldı." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(lim.resetAt)) } });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }
  const kws = Array.from(new Set(body.keywords.map((k) => k.trim().toLocaleLowerCase("tr")))).slice(0, 200);
  const project = await getActiveProject(user.id).catch(() => null);
  const demo = isDemoMode();

  if (demo) {
    // Demo: yapay zekâ yok — basit kurallarla örnek çıktı.
    const clusters: AiCluster[] = [{ name: body.seed, intent: "informational", title: `${body.seed}: kapsamlı rehber`, keywords: kws.slice(0, 8) }];
    const prompts: AiPrompt[] = kws.slice(0, 6).map((k) => ({ keyword: k, prompt: `${k.charAt(0).toLocaleUpperCase("tr")}${k.slice(1)} hakkında ne önerirsin?` }));
    return NextResponse.json({ demo: true, clusters, prompts });
  }

  const quota = await checkQuota(user.id, "engineQueries", 1);
  if (!quota.allowed) return NextResponse.json({ error: quotaExceededMessage("engineQueries", quota, 1) }, { status: 402 });

  const tr = body.lang === "tr";
  const prompt = `Sen bir SEO ve GEO (yapay zekâ arama optimizasyonu) uzmanısın. Ana kelime: "${body.seed}".${project ? ` Marka: ${project.name} (${project.domain}).` : ""}
Aşağıdaki gerçek Google arama önerilerini kullan. YENİ KELİME UYDURMA; kümelerde yalnızca listedeki kelimeleri kullan.

Görev 1 — Kümeler: Kelimeleri ANLAMA göre (aynı arama niyeti, aynı sayfa ile cevaplanabilecek) 4–12 konu kümesine ayır. Her küme tek bir yazı/sayfa olmalı. Her küme için:
- name: kısa konu adı (2–4 kelime)
- intent: question | commercial | comparison | local | informational
- title: o kümedeki tüm kelimeleri kapsayan, tıklanası bir yazı başlığı (${tr ? "Türkçe" : "kelimelerin dilinde"}, en fazla 70 karakter)
- keywords: bu kümeye giren kelimeler (listeden, birebir)
Bir kelime yalnızca bir kümede olsun. Hiçbir kümeye uymayanları dışarıda bırakabilirsin.

Görev 2 — GEO soruları: İnsanların ChatGPT/Gemini/Perplexity'ye soracağı, marka önerisi ya da karşılaştırma isteyen 8–12 doğal, tam cümle soru yaz. Her biri listedeki bir kelimeden türesin (keyword alanına o kelimeyi yaz). Soruda marka adı geçmesin. ${tr ? "Türkçe yaz." : "Kelimelerin dilinde yaz."}

Kelimeler:
${kws.join("\n")}

Yalnızca şu JSON'u döndür:
{"clusters":[{"name":"","intent":"","title":"","keywords":[""]}],"prompts":[{"prompt":"","keyword":""}]}`;

  try {
    const { parsed, model } = await runForJsonObject(async (extra) => {
      const r = await runFast(prompt + extra, 0.3);
      if (!r) throw new Error("Yapay zekâ sağlayıcısı bağlı değil.");
      return r;
    });
    const norm = (s: string) => s.toLocaleLowerCase("tr").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const byNorm = new Map(kws.map((k) => [norm(k), k]));
    const rawClusters = Array.isArray(parsed.clusters) ? parsed.clusters : Array.isArray(parsed.topics) ? parsed.topics : [];
    const rawPrompts = Array.isArray(parsed.prompts) ? parsed.prompts : Array.isArray(parsed.questions) ? parsed.questions : [];
    const INTENTS = ["question", "commercial", "comparison", "local", "informational"];
    const used = new Set<string>();
    const clusters: AiCluster[] = rawClusters
      .map((c: Record<string, unknown>) => {
        const keywords = (Array.isArray(c.keywords) ? c.keywords : [])
          .map((k) => byNorm.get(norm(String(k))) ?? "")
          .filter((k) => k && !used.has(k));
        keywords.forEach((k) => used.add(k));
        return {
          name: String(c.name ?? "").slice(0, 60),
          intent: (INTENTS.includes(String(c.intent)) ? String(c.intent) : "informational") as AiCluster["intent"],
          title: String(c.title ?? "").slice(0, 90),
          keywords,
        };
      })
      .filter((c: AiCluster) => c.name && c.keywords.length)
      .sort((a: AiCluster, b: AiCluster) => b.keywords.length - a.keywords.length)
      .slice(0, 12);
    const prompts: AiPrompt[] = rawPrompts
      .map((p: unknown) => {
        const o = (typeof p === "string" ? { prompt: p } : (p ?? {})) as Record<string, unknown>;
        return { prompt: String(o.prompt ?? o.question ?? o.text ?? "").trim().slice(0, 200), keyword: String(o.keyword ?? "").trim().toLocaleLowerCase("tr") };
      })
      .filter((p: AiPrompt) => p.prompt.length >= 10)
      .slice(0, 12);
    if (!clusters.length && !prompts.length) throw new Error("Yapay zekâ kullanılabilir bir sonuç döndürmedi; tekrar dene.");
    await consumeQuota(user.id, "engineQueries", 1);
    return NextResponse.json({ clusters, prompts, meta: { model, rawClusters: rawClusters.length, rawPrompts: rawPrompts.length, keys: Object.keys(parsed).slice(0, 6) } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "AI analizi başarısız." }, { status: 500 });
  }
}
