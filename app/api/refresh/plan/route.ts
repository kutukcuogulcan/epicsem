import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { brandContextFor, guardSmallAi, QuotaError, runSmallAiJson, str } from "@/lib/ai-small";
import { fetchPageSummary } from "@/lib/content-fetch";
import { getContentDraft } from "@/lib/db";
import { isDemoMode } from "@/lib/geo-providers";
import { readableZodError } from "@/lib/zod-error";

export const maxDuration = 60;

const schema = z.object({
  url: z.string().max(500).nullable().optional(),
  draftId: z.number().int().nullable().optional(),
  title: z.string().max(300),
  signals: z.array(z.string().max(400)).max(10).default([]),
  keywords: z.array(z.string().max(120)).max(10).default([]),
  prompts: z.array(z.string().max(300)).max(5).default([]),
});

export interface RefreshPlan {
  summary: string;
  title: string | null;
  metaDescription: string | null;
  changes: { where: string; what: string }[];
  newSections: { heading: string; points: string[] }[];
  faq: { q: string; a: string }[];
}

/**
 * POST /api/refresh/plan — bir yazı için "yenileme planı": neyi değiştir, hangi bölümleri ekle, SSS.
 * Yazının mevcut metnini okur, sıralama/AI sinyallerine göre yazar. Rakam uydurmaz. 1 AI motor sorgusu.
 */
export async function POST(req: NextRequest) {
  const g = await guardSmallAi("refresh-plan");
  if (g instanceof NextResponse) return g;
  let b: z.infer<typeof schema>;
  try {
    b = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: readableZodError(e) }, { status: 400 });
  }

  let text = "";
  let site = b.url ?? "";
  if (b.draftId) {
    const d = await getContentDraft(g.userId, b.draftId);
    if (d) {
      text = d.article.bodyMarkdown;
      site = d.publishedPostUrl ?? d.site ?? site;
    }
  }
  if (!text && b.url) {
    try {
      const p = await fetchPageSummary(b.url);
      text = p.bodyText ?? "";
    } catch (e) {
      return NextResponse.json({ error: `Sayfa okunamadı: ${e instanceof Error ? e.message : "hata"}` }, { status: 502 });
    }
  }

  if (isDemoMode()) {
    const plan: RefreshPlan = {
      summary: "Demo mod: gerçek anahtar tanımlanınca yazının metni ve sinyaller okunarak yenileme planı çıkarılır.",
      title: null,
      metaDescription: null,
      changes: b.signals.slice(0, 3).map((s) => ({ where: "Genel", what: `Demo: ${s}` })),
      newSections: [{ heading: "Örnek yeni bölüm", points: ["Demo maddesi"] }],
      faq: [],
    };
    return NextResponse.json({ demo: true, plan });
  }

  const ctx = site ? await brandContextFor(g.userId, site) : "";
  const prompt = `Sen kıdemli bir SEO ve GEO (yapay zekâ arama) editörüsün. Aşağıdaki yayındaki yazı için YENİLEME PLANI çıkar.
KURALLAR: Yazının dilinde yaz. Rakam, fiyat, ödül, tarih UYDURMA; güncel veri gerekiyorsa "[güncel veri ekle: ...]" diye belirt. Kısa, uygulanabilir maddeler yaz.
${ctx}
Başlık: ${b.title}
Adres: ${b.url ?? "(yok)"}
Hedef kelimeler (sıra): ${b.keywords.join(", ") || "(yok)"}
Markanın AI cevaplarında ANILMADIĞI sorular: ${b.prompts.join(" | ") || "(yok)"}
Tespit edilen sorunlar: ${b.signals.join(" | ") || "(yok)"}
Mevcut metin (kısaltılmış):
${text.slice(0, 7000) || "(metin okunamadı)"}

Yalnızca şu JSON'u döndür:
{"summary":"2 cümle: neden yenilenmeli ve en önemli değişiklik","title":"gerekirse yeni başlık, yoksa null","metaDescription":"gerekirse 140-155 karakter, yoksa null","changes":[{"where":"hangi bölüm/paragraf","what":"somut değişiklik"}],"newSections":[{"heading":"eklenecek H2","points":["madde"]}],"faq":[{"q":"AI sorularına uygun soru","a":"30-50 kelime, yalnızca metinden ya da marka bilgisinden cevap"}]}
changes en fazla 6, newSections en fazla 3, faq en fazla 4 (AI'da anılmayan sorulara öncelik ver).`;

  try {
    const p = await runSmallAiJson(g.userId, prompt);
    const arr = (v: unknown) => (Array.isArray(v) ? v : []);
    const plan: RefreshPlan = {
      summary: str(p.summary, 600) ?? "",
      title: str(p.title, 120),
      metaDescription: str(p.metaDescription, 200),
      changes: arr(p.changes)
        .map((c: any) => ({ where: str(c?.where, 120) ?? "Genel", what: str(c?.what, 500) ?? "" }))
        .filter((c: { what: string }) => c.what)
        .slice(0, 6),
      newSections: arr(p.newSections)
        .map((s: any) => ({ heading: str(s?.heading, 140) ?? "", points: arr(s?.points).map((x: unknown) => str(x, 240)).filter(Boolean).slice(0, 5) as string[] }))
        .filter((s: { heading: string }) => s.heading)
        .slice(0, 3),
      faq: arr(p.faq)
        .map((f: any) => ({ q: str(f?.q, 200) ?? "", a: str(f?.a, 500) ?? "" }))
        .filter((f: { q: string; a: string }) => f.q && f.a)
        .slice(0, 4),
    };
    return NextResponse.json({ plan });
  } catch (e) {
    if (e instanceof QuotaError) return NextResponse.json({ error: e.message }, { status: 402 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Plan yazılamadı." }, { status: 500 });
  }
}
