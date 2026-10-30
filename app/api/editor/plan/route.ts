import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { isDemoMode, runFast } from "@/lib/geo-providers";
import { runForJsonObject } from "@/lib/llm-json";
import { getBrandKnowledge } from "@/lib/db";
import { knowledgeBlock } from "@/lib/knowledge-prompt";
import { rootHost } from "@/lib/backlinks";

export const maxDuration = 60;

export interface TopicIdea {
  title: string;
  angle: string;
  intent: "bilgi" | "karşılaştırma" | "satın alma" | "nasıl yapılır" | "liste";
  format: "article" | "listicle";
}
export interface OutlineSection {
  h2: string;
  h3: string[];
  note: string;
}

const LANG: Record<string, string> = { tr: "Türkçe", en: "English", de: "Deutsch" };

/**
 * POST /api/editor/plan — "Konudan yaz" sihirbazının ara adımları (içerik kotası harcamaz).
 *  { step: "topics", keyword, site?, language? }        → { topics: TopicIdea[] }
 *  { step: "outline", keyword, title, site?, language?, format? } → { outline: OutlineSection[], questions: string[] }
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const lim = rateLimit(`editor-plan:${user.id}`, 60, 60 * 60 * 1000);
  if (!lim.allowed) return NextResponse.json({ error: "Saatlik öneri sınırına ulaşıldı." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(lim.resetAt)) } });

  const b = await req.json().catch(() => ({}));
  const step = String(b.step ?? "");
  const keyword = String(b.keyword ?? "").trim().slice(0, 120);
  const title = String(b.title ?? "").trim().slice(0, 200);
  const site = rootHost(String(b.site ?? ""));
  const lang = LANG[b.language] ?? "Türkçe";
  const format = b.format === "listicle" ? "listicle" : "article";
  if (keyword.length < 2) return NextResponse.json({ error: "Anahtar kelime yaz." }, { status: 400 });

  const kb = knowledgeBlock((await getBrandKnowledge(user.id)).content);
  const brandLine = site ? `Marka sitesi: ${site}.` : "";

  if (step === "topics") {
    if (isDemoMode()) return NextResponse.json({ topics: demoTopics(keyword), demo: true });
    const prompt = `Sen bir SEO ve GEO (yapay zekâ arama motorlarında alıntılanma) içerik stratejistisin. Hedef anahtar kelime: "${keyword}". ${brandLine}
Bu anahtar kelime için 6 farklı blog yazısı konusu öner. Her biri farklı bir arama niyeti ya da açı olsun (ör. nasıl yapılır rehberi, karşılaştırma, liste, satın alma rehberi, sık yapılan hatalar, yeni başlayanlar için). Başlıklar ${lang}, 50-65 karakter, doğal ve tıklanabilir olsun; anahtar kelimeyi ya da yakın varyasyonunu içersin. Clickbait ve yıl uydurma yok.
Yalnızca şu JSON'u döndür:
{"topics":[{"title":"…","angle":"bu yazının neyi farklı ele aldığı, tek cümle","intent":"bilgi|karşılaştırma|satın alma|nasıl yapılır|liste","format":"article|listicle"}]}${kb}`;
    try {
      const { parsed } = await runForJsonObject(async (extra) => {
        const r = await runFast(prompt + extra, 0.8);
        if (!r) throw new Error("Yapay zekâ sağlayıcısı yok.");
        return r;
      });
      const topics: TopicIdea[] = (Array.isArray(parsed.topics) ? parsed.topics : [])
        .filter((t: any) => t && t.title)
        .slice(0, 8)
        .map((t: any) => ({
          title: String(t.title).slice(0, 120),
          angle: String(t.angle ?? "").slice(0, 240),
          intent: (["bilgi", "karşılaştırma", "satın alma", "nasıl yapılır", "liste"].includes(t.intent) ? t.intent : "bilgi") as TopicIdea["intent"],
          format: t.format === "listicle" ? "listicle" : "article",
        }));
      if (!topics.length) throw new Error("Konu önerisi gelmedi, tekrar dene.");
      return NextResponse.json({ topics });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Konu önerileri alınamadı." }, { status: 500 });
    }
  }

  if (step === "outline") {
    if (title.length < 3) return NextResponse.json({ error: "Önce bir konu seç." }, { status: 400 });
    if (isDemoMode()) return NextResponse.json({ ...demoOutline(keyword, title), demo: true });
    const prompt = `Sen bir SEO ve GEO içerik editörüsün. ${brandLine}
Yazı başlığı: "${title}"
Hedef anahtar kelime: "${keyword}"
Biçim: ${format === "listicle" ? "liste yazısı (her madde bir ## başlık)" : "makale"}
Bu yazı için ${lang} bir içerik planı çıkar:
- 5-8 adet ## (H2) bölüm. Başlıkların çoğu insanların Google'a ya da ChatGPT'ye soracağı soru biçiminde olsun; ilk bölüm konuyu doğrudan cevaplasın.
- Gerekiyorsa her bölüme 0-3 adet ### (H3) alt başlık.
- Her bölüm için yazara tek cümlelik not: o bölümde ne anlatılmalı.
- Ayrıca SSS bölümü için 4-5 gerçekçi soru.
Yalnızca şu JSON'u döndür:
{"outline":[{"h2":"…","h3":["…"],"note":"…"}],"questions":["…"]}${kb}`;
    try {
      const { parsed } = await runForJsonObject(async (extra) => {
        const r = await runFast(prompt + extra, 0.6);
        if (!r) throw new Error("Yapay zekâ sağlayıcısı yok.");
        return r;
      });
      const outline: OutlineSection[] = (Array.isArray(parsed.outline) ? parsed.outline : [])
        .filter((s: any) => s && s.h2)
        .slice(0, 12)
        .map((s: any) => ({ h2: String(s.h2).slice(0, 160), h3: (Array.isArray(s.h3) ? s.h3 : []).map(String).filter(Boolean).slice(0, 4), note: String(s.note ?? "").slice(0, 240) }));
      const questions = (Array.isArray(parsed.questions) ? parsed.questions : []).map(String).filter(Boolean).slice(0, 6);
      if (!outline.length) throw new Error("Plan gelmedi, tekrar dene.");
      return NextResponse.json({ outline, questions });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Plan alınamadı." }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Bilinmeyen adım." }, { status: 400 });
}

function demoTopics(k: string): TopicIdea[] {
  return [
    { title: `${k}: Adım Adım Rehber`, angle: "Konuyu baştan sona, yeni başlayan biri için anlatır.", intent: "nasıl yapılır", format: "article" },
    { title: `${k} İçin 7 Pratik İpucu`, angle: "Hızlı uygulanabilir maddeler halinde öneriler.", intent: "liste", format: "listicle" },
    { title: `${k} Yaparken Sık Yapılan 5 Hata`, angle: "Hatalar ve nasıl kaçınılacağı.", intent: "bilgi", format: "listicle" },
    { title: `${k}: Seçenekleri Karşılaştırdık`, angle: "Alternatiflerin artı ve eksileri, tabloyla.", intent: "karşılaştırma", format: "article" },
    { title: `${k} Nedir, Neden Önemlidir?`, angle: "Temel tanım ve önemi; AI cevaplarına uygun kısa cevaplar.", intent: "bilgi", format: "article" },
    { title: `${k} Satın Alma Rehberi`, angle: "Karar verirken nelere bakılmalı, kontrol listesi.", intent: "satın alma", format: "article" },
  ];
}

function demoOutline(k: string, t: string): { outline: OutlineSection[]; questions: string[] } {
  return {
    outline: [
      { h2: `${k} nedir?`, h3: [], note: "İlk cümlede kısa ve net tanım ver." },
      { h2: `${k} neden önemli?`, h3: ["Kimler için önemli?"], note: "Faydaları somut örneklerle anlat." },
      { h2: `${k} nasıl yapılır?`, h3: ["1. Hazırlık", "2. Uygulama", "3. Kontrol"], note: "Adımları numaralı liste ile ver." },
      { h2: "Sık yapılan hatalar nelerdir?", h3: [], note: "3-5 hata ve çözümü." },
      { h2: `${t} — özet`, h3: [], note: "Ana fikirleri 3 maddede topla." },
    ],
    questions: [`${k} ne kadar sürer?`, `${k} için ne gerekir?`, `${k} pahalı mı?`, `${k} evde yapılabilir mi?`],
  };
}
