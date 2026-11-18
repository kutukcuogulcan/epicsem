import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { runFast } from "@/lib/geo-providers";
import { extractJsonObject } from "@/lib/llm-json";
import { projectContextBlock } from "@/lib/project-context";

export const maxDuration = 60;

const ACTIONS: Record<string, string> = {
  simplify: "Metni daha sade ve kolay okunur yaz; kısa cümleler kullan, anlamı koru.",
  rewrite: "Metni aynı bilgilerle, daha akıcı ve ikna edici biçimde yeniden yaz.",
  expand: "Metni yaklaşık iki katına genişlet: açıklama, örnek ve pratik detay ekle. Doğrulanamayan rakam/olgu uydurma; gerekirse [NEEDS: …] yer tutucu bırak.",
  shorten: "Metni anlamı koruyarak yaklaşık yarıya kısalt.",
  keyword: "Hedef anahtar kelimeyi (ve doğal varyasyonlarını) metne 1-2 kez doğal biçimde yerleştir; anahtar kelime doldurma yapma.",
  answer: "Metnin ilk cümlesini, başlıktaki soruya doğrudan ve tek cümlelik (6-30 kelime) bir cevap olacak şekilde yeniden düzenle; kalanını destekleyici açıklama olarak koru. (AI motorlarının alıntılayacağı 'cevap-önce' yapı.)",
  tone: "Metni markanın samimi ama profesyonel tonuyla yeniden yaz.",
  list: "Metni taranabilir bir markdown listesine çevir: varsa 1 cümlelik giriş, ardından her biri tek fikir taşıyan 3-8 madde. Adım sırası önemliyse numaralı liste (1.), değilse madde işareti (-) kullan. Maddeler kısa olsun; önemli terimi **kalın** yazabilirsin. Bilgi ekleme, bilgi atma.",
  table: "Metindeki bilgileri bir markdown tablosuna çevir: önce 1 cümlelik giriş, sonra başlık satırı ve | --- | ayırıcı satırı olan bir tablo (2-4 sütun, en az 2 satır). Sütunları karşılaştırılan özelliklere göre seç. Tabloda olmayan bilgiyi uydurma; boş hücreye \"—\" yaz.",
};

/**
 * POST /api/editor/ai — AI SEO Editör'ün yapay zekâ eylemleri (yalnızca kullanıcı düğmeye basınca).
 * { action, text, keyword?, instruction?, title?, doc? }
 *  - simplify/rewrite/expand/shorten/keyword/answer/tone/custom → { text }
 *  - faq → { text } (markdown SSS bölümü)
 *  - meta → { title, metaDescription }
 *  - assistant → { text } (tüm belge, markdown)
 *  - continue → { text, finished } (yarıda kesilen yazının devamı; yalnızca eklenecek kısım)
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const lim = rateLimit(`editor-ai:${user.id}`, 80, 60 * 60 * 1000);
  if (!lim.allowed) return NextResponse.json({ error: "Saatlik AI düzenleme sınırına ulaşıldı." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(lim.resetAt)) } });

  const b = await req.json().catch(() => ({}));
  const action = String(b.action ?? "");
  const text = String(b.text ?? "").slice(0, 12000);
  const doc = String(b.doc ?? "").slice(0, 24000);
  const keyword = String(b.keyword ?? "").slice(0, 100);
  const instruction = String(b.instruction ?? "").slice(0, 2500);
  const title = String(b.title ?? "").slice(0, 200);

  const rules = `Kurallar: Metnin dilinde yaz (Türkçe ise Türkçe). Uydurma bilgi, istatistik, fiyat, tarih ekleme. Markdown biçimini koru (başlık, liste, **kalın**, [link](url)). Linkleri ve görselleri silme. Sadece sonucu döndür; açıklama, giriş cümlesi, tırnak veya kod bloğu ekleme.`;
  let prompt: string;
  if (action === "meta") {
    prompt = `Aşağıdaki yazı için SEO title (50-60 karakter, anahtar kelime başta) ve meta açıklama (140-160 karakter, fayda + çağrı) yaz. Hedef anahtar kelime: "${keyword || "(yok)"}". Yalnızca şu JSON'u döndür: {"title":"…","metaDescription":"…"}\n\nYAZI:\n${doc.slice(0, 8000)}`;
  } else if (action === "faq") {
    prompt = `Aşağıdaki yazıya eklenecek bir "Sık Sorulan Sorular" bölümü yaz: "## Sık Sorulan Sorular" başlığı, ardından 4-6 soru "### Soru?" ve her birinin altında 1-3 cümlelik doğrudan cevap. Sorular kullanıcıların ChatGPT/Google'a soracağı gibi olsun ve cevaplar SADECE yazıdaki bilgilere dayansın. Hedef anahtar kelime: "${keyword}". ${rules}\n\nYAZI:\n${doc.slice(0, 12000)}`;
  } else if (action === "continue") {
    if (!doc.trim()) return NextResponse.json({ error: "Yazı boş." }, { status: 400 });
    const tail = doc.length > 9000 ? doc.slice(doc.length - 9000) : doc;
    prompt = `Aşağıdaki makale yarıda kesildi. Makaleyi TAM kaldığı yerden devam ettirerek bitir (gerekirse yarım kalan cümleyi tamamlayarak başla). Daha önce yazılanı tekrar etme, baştan başlama, başlık ekleme. Eksik kalan bölümleri, henüz yoksa "Sık sorulan sorular" bölümünü (3-5 soru, ### soru başlıkları) ve kısa bir "ne yapmalı" özetini yaz. Bittiğinde son satıra yalnızca ===END=== yaz. Hedef anahtar kelime: "${keyword || "(yok)"}". Makale başlığı: "${title}". ${rules}\n\nMAKALENİN ŞU ANA KADARKİ ${tail === doc ? "TAMAMI" : "SON KISMI"}:\n${tail}`;
  } else if (action === "assistant") {
    if (!instruction) return NextResponse.json({ error: "Talimat yazın." }, { status: 400 });
    prompt = `Sen bir SEO/GEO editörüsün. Aşağıdaki makaleye şu talimatı uygula: "${instruction}". Hedef anahtar kelime: "${keyword}". Makalenin TAMAMINI güncellenmiş haliyle döndür. ${rules}\n\nMAKALE:\n${doc}`;
  } else {
    const how = action === "custom" ? instruction : ACTIONS[action];
    if (!how) return NextResponse.json({ error: "Bilinmeyen işlem" }, { status: 400 });
    if (!text.trim()) return NextResponse.json({ error: "Metin boş." }, { status: 400 });
    prompt = `Görev: ${how}\nHedef anahtar kelime: "${keyword || "(yok)"}"\nMakale başlığı: "${title}"\n${rules}\n\nDÜZENLENECEK METİN:\n${text}`;
  }

  prompt += await projectContextBlock(user.id);
  const r = await runFast(prompt, 0.5).catch(() => null);
  if (!r?.text) return NextResponse.json({ error: "AI şu an yanıt vermedi (API anahtarı tanımlı mı?)." }, { status: 503 });
  if (action === "continue") {
    // Baştaki boşluk korunur: kelime sınırını o gösterir.
    const raw = r.text.replace(/^\s*```(?:markdown|md)?[ \t]*\n/i, "").replace(/\n?```\s*$/, "");
    const end = raw.match(/^\s*===\s*END\s*===\s*$/m);
    const text = (end && end.index != null ? raw.slice(0, end.index) : raw).replace(/\s+$/, "");
    if (!text.trim()) return NextResponse.json({ error: "AI devam metni üretmedi, tekrar deneyin." }, { status: 502 });
    return NextResponse.json({ text, finished: Boolean(end) && !r.truncated, model: r.model });
  }
  const clean = r.text.replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/, "").trim();
  if (action === "meta") {
    try {
      const j = extractJsonObject(clean);
      return NextResponse.json({ title: String(j.title ?? ""), metaDescription: String(j.metaDescription ?? "") });
    } catch {
      return NextResponse.json({ error: "AI yanıtı okunamadı, tekrar deneyin." }, { status: 502 });
    }
  }
  return NextResponse.json({ text: clean, model: r.model });
}
