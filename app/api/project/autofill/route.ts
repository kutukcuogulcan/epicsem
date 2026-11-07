import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { fetchPageSummary } from "@/lib/content-fetch";
import { isDemoMode, runFast } from "@/lib/geo-providers";
import { runForJsonObject } from "@/lib/llm-json";
import { getActiveProject } from "@/lib/project-context";

export const maxDuration = 60;

/**
 * POST — aktif projenin ana sayfasını okuyup marka ayarları için öneri çıkarır
 * (açıklama, hedef kitle, ton, ürünler, avantajlar, CTA). Kaydetmez; kullanıcı formda düzenleyip kaydeder.
 * Küçük bir AI çağrısı; içerik kotasından düşmez, saatte 10 ile sınırlı.
 */
export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const lim = rateLimit(`project-autofill:${user.id}`, 10, 60 * 60 * 1000);
  if (!lim.allowed) return NextResponse.json({ error: "Saatlik sınıra ulaşıldı." }, { status: 429 });
  const p = await getActiveProject(user.id);
  if (!p) return NextResponse.json({ error: "Önce bir proje seç." }, { status: 400 });

  let page;
  try {
    page = await fetchPageSummary(p.domain);
  } catch (e) {
    return NextResponse.json({ error: `Site okunamadı (${p.domain}): ${e instanceof Error ? e.message : "hata"}` }, { status: 502 });
  }
  if (isDemoMode()) {
    return NextResponse.json({
      demo: true,
      suggestion: {
        description: page.metaDescription || page.title || "",
        audience: "",
        tone: "professional",
        address: "siz",
        products: "",
        usps: "",
        cta: "",
      },
    });
  }
  const prompt = `Aşağıdaki web sitesi ana sayfasına bakarak bu markanın içerik üretiminde kullanılacak marka ayarlarını Türkçe çıkar. SADECE sayfada görülen ya da açıkça çıkarılabilen bilgileri yaz; emin olmadığın alanı boş bırak. Rakam, ödül, fiyat uydurma.
Site: ${p.domain}
Başlık: ${page.title ?? ""}
Meta açıklama: ${page.metaDescription ?? ""}
Sayfa metni (kısaltılmış): ${(page.bodyText ?? "").slice(0, 5000)}

Yalnızca şu JSON'u döndür:
{"description":"markanın ne yaptığı, 1-2 cümle","audience":"hedef kitle, 1-2 cümle","tone":"professional|friendly|expert|simple","address":"siz|sen","products":"ana ürün/hizmetler, virgülle","usps":"öne çıkan avantajlar, virgülle","cta":"sitede kullanılan çağrı ifadesi"}`;
  try {
    const { parsed } = await runForJsonObject(async (extra) => {
      const r = await runFast(prompt + extra, 0.3);
      if (!r) throw new Error("Yapay zekâ sağlayıcısı yok.");
      return r;
    });
    const pick = (k: string, n: number) => (typeof parsed[k] === "string" ? String(parsed[k]).slice(0, n) : "");
    return NextResponse.json({
      suggestion: {
        description: pick("description", 600),
        audience: pick("audience", 600),
        tone: ["professional", "friendly", "expert", "simple"].includes(parsed.tone) ? parsed.tone : "professional",
        address: parsed.address === "sen" ? "sen" : "siz",
        products: pick("products", 1200),
        usps: pick("usps", 800),
        cta: pick("cta", 200),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Öneri çıkarılamadı." }, { status: 500 });
  }
}
