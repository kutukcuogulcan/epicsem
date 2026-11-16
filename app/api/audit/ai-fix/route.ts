import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { fetchPageSummary } from "@/lib/content-fetch";
import { isDemoMode, runFast } from "@/lib/geo-providers";
import { runForJsonObject } from "@/lib/llm-json";
import { projectContextBlock } from "@/lib/project-context";
import { checkQuota, consumeQuota, quotaExceededMessage } from "@/lib/usage-guard";
import { readableZodError } from "@/lib/zod-error";

export const maxDuration = 60;

const bodySchema = z.object({
  url: z.string().min(4).max(500),
  issues: z.array(z.object({ title: z.string().max(200), detail: z.string().max(400).optional(), category: z.string().max(40) })).max(30).default([]),
});

export interface AiFixResult {
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  directAnswer: string | null;
  faq: { q: string; a: string }[];
  fixes: { issue: string; fix: string }[];
}

/**
 * POST /api/audit/ai-fix — Site Denetimi'nin "AI ile düzeltme yaz" butonu.
 * Sayfanın kendi içeriğini okuyup bulunan sorunlar için siteye özel, kopyalanabilir metinler üretir:
 * yeni title, meta açıklama, H1, doğrudan cevap paragrafı, SSS ve sorun başına kısa düzeltme talimatı.
 * Sayfada olmayan bilgi (fiyat, rakam, ödül) uydurmaz. 1 AI motor sorgusu kotası.
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const lim = rateLimit(`audit-ai:${user.id}`, 20, 60 * 60 * 1000);
  if (!lim.allowed) return NextResponse.json({ error: "Saatlik sınıra ulaşıldı." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(lim.resetAt)) } });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }

  let page;
  try {
    page = await fetchPageSummary(body.url);
  } catch (e) {
    return NextResponse.json({ error: `Sayfa okunamadı: ${e instanceof Error ? e.message : "hata"}` }, { status: 502 });
  }

  if (isDemoMode()) {
    const r: AiFixResult = {
      title: page.title ? `${page.title.slice(0, 50)} | Örnek` : "Örnek başlık",
      metaDescription: "Demo mod: gerçek anahtar tanımlanınca sayfanın içeriğinden meta açıklama yazılır.",
      h1: null,
      directAnswer: "Demo mod: burada sayfanın ana sorusuna 2–3 cümlelik doğrudan cevap önerisi görünür.",
      faq: [],
      fixes: body.issues.slice(0, 3).map((i) => ({ issue: i.title, fix: "Demo mod: siteye özel düzeltme talimatı burada görünür." })),
    };
    return NextResponse.json({ demo: true, result: r });
  }

  const quota = await checkQuota(user.id, "engineQueries", 1);
  if (!quota.allowed) return NextResponse.json({ error: quotaExceededMessage("engineQueries", quota, 1) }, { status: 402 });

  const ctx = await projectContextBlock(user.id).catch(() => "");
  const prompt = `Sen kıdemli bir SEO ve GEO (yapay zekâ arama) uzmanısın. Aşağıdaki sayfa için denetimde bulunan sorunlara SİTEYE ÖZEL, kopyalanıp kullanılabilir düzeltmeler yaz.
KURALLAR: Yalnızca sayfada yazan ya da marka bilgisinde verilen bilgileri kullan. Fiyat, rakam, ödül, müşteri sayısı UYDURMA. Sayfanın dilinde yaz (Türkçe sayfaysa Türkçe). Kısa ve net ol.
${ctx}
Sayfa: ${page.url}
Mevcut title: ${page.title ?? "(yok)"}
Mevcut meta açıklama: ${page.metaDescription ?? "(yok)"}
Sayfa metni (kısaltılmış): ${(page.bodyText ?? "").slice(0, 6000)}

Denetimde bulunan sorunlar:
${body.issues.map((i, n) => `${n + 1}. [${i.category}] ${i.title}${i.detail ? ` — ${i.detail}` : ""}`).join("\n") || "(liste yok; genel iyileştirme öner)"}

Yalnızca şu JSON'u döndür:
{"title":"50–60 karakter, ana kelime başta, marka sonda (gerek yoksa null)","metaDescription":"140–155 karakter, fayda + çağrı (gerek yoksa null)","h1":"tek, net H1 önerisi (gerek yoksa null)","directAnswer":"sayfanın ana sorusuna 2–3 cümlelik doğrudan cevap paragrafı; sayfanın en üstüne konacak","faq":[{"q":"","a":"20–50 kelime"}],"fixes":[{"issue":"sorunun başlığı (listeden)","fix":"bu siteye özel 1–3 cümlelik somut düzeltme talimatı"}]}
faq en fazla 4 madde, yalnızca sayfa içeriğinden cevaplanabilenler. fixes listedeki önemli sorunlar için, en fazla 8.`;

  try {
    const { parsed } = await runForJsonObject(async (extra) => {
      const r = await runFast(prompt + extra, 0.3);
      if (!r) throw new Error("Yapay zekâ sağlayıcısı bağlı değil.");
      return r;
    });
    const s = (v: unknown, n: number) => (typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null" ? v.trim().slice(0, n) : null);
    const result: AiFixResult = {
      title: s(parsed.title, 90),
      metaDescription: s(parsed.metaDescription, 200),
      h1: s(parsed.h1, 120),
      directAnswer: s(parsed.directAnswer, 700),
      faq: (Array.isArray(parsed.faq) ? parsed.faq : [])
        .map((f: Record<string, unknown>) => ({ q: s(f?.q, 200) ?? "", a: s(f?.a, 500) ?? "" }))
        .filter((f: { q: string; a: string }) => f.q && f.a)
        .slice(0, 4),
      fixes: (Array.isArray(parsed.fixes) ? parsed.fixes : [])
        .map((f: Record<string, unknown>) => ({ issue: s(f?.issue, 200) ?? "", fix: s(f?.fix, 600) ?? "" }))
        .filter((f: { issue: string; fix: string }) => f.issue && f.fix)
        .slice(0, 8),
    };
    await consumeQuota(user.id, "engineQueries", 1);
    return NextResponse.json({ result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Düzeltmeler yazılamadı." }, { status: 500 });
  }
}
