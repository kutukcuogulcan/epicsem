import * as cheerio from "cheerio";
import { runFast } from "@/lib/geo-providers";
import { extractJsonObject } from "@/lib/llm-json";

/**
 * Site Taraması'ndaki tek bir sayfa için somut düzeltme önerisi: sayfanın GERÇEK içeriğinden
 * yeni title, meta açıklama, H1, görsel alt metinleri, schema JSON-LD ve içerik ekleme
 * fikirleri. AI sağlayıcısı yoksa kural tabanlı (içerikten kırpılmış) öneri döner.
 */

export interface PageFixSuggestion {
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  altTexts: { src: string; alt: string }[];
  schemaJsonLd: string | null;
  contentIdeas: string[];
  notes: string[];
  source: "ai" | "kural";
  current: { title: string | null; metaDescription: string | null; h1: string | null };
}

const UA = "Mozilla/5.0 (compatible; EpicsemBot/1.0; +https://epicsem.com/bot)";

function cut(s: string, n: number) {
  if (s.length <= n) return s;
  const c = s.slice(0, n);
  const i = c.lastIndexOf(" ");
  return (i > n * 0.6 ? c.slice(0, i) : c).replace(/[,.;:\s]+$/, "") + "…";
}

export async function suggestPageFix(url: string, issues: string[]): Promise<PageFixSuggestion> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 12000);
  let html: string;
  try {
    const res = await fetch(url, { signal: c.signal, redirect: "follow", headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`Sayfa ${res.status} döndürdü`);
    html = await res.text();
  } catch (e) {
    throw new Error(e instanceof Error && e.message.startsWith("Sayfa") ? e.message : "Sayfa açılamadı.");
  } finally {
    clearTimeout(t);
  }

  const $ = cheerio.load(html);
  const host = new URL(url).hostname.replace(/^www\./, "");
  const current = {
    title: $("title").first().text().trim() || null,
    metaDescription: $('meta[name="description" i]').attr("content")?.trim() || null,
    h1: $("h1").first().text().replace(/\s+/g, " ").trim() || null,
  };
  const lang = $("html").attr("lang") || "tr";
  const headings = $("h2, h3")
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get()
    .filter(Boolean)
    .slice(0, 15);
  const noAlt = $("img")
    .filter((_, el) => $(el).attr("alt") === undefined)
    .map((_, el) => $(el).attr("src") || $(el).attr("data-src") || "")
    .get()
    .filter(Boolean)
    .slice(0, 8);
  const hasSchema = $('script[type="application/ld+json"]').length > 0;
  $("script, style, noscript, svg, nav, footer, header").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  const words = text ? text.split(" ").length : 0;

  const prompt = `Sen kıdemli bir teknik SEO uzmanısın. Aşağıdaki sayfa için, SADECE sayfadaki gerçek bilgilere dayanarak somut düzeltme önerileri yaz. Uydurma bilgi (fiyat, yıl, adres, istatistik) ekleme. Sayfanın dili: ${lang}. Önerileri sayfanın dilinde yaz.

URL: ${url}
Site: ${host}
Mevcut title: ${current.title ?? "(yok)"}
Mevcut meta açıklama: ${current.metaDescription ?? "(yok)"}
Mevcut H1: ${current.h1 ?? "(yok)"}
Ara başlıklar: ${headings.join(" | ") || "(yok)"}
Kelime sayısı: ${words}
Alt metni olmayan görseller: ${noAlt.join(", ") || "(yok)"}
Yapısal veri var mı: ${hasSchema ? "evet" : "hayır"}
Tespit edilen sorunlar: ${issues.join(", ") || "(yok)"}

Sayfa metni (kısaltılmış):
${text.slice(0, 3500)}

Yalnızca şu JSON nesnesini döndür:
{
  "title": "50-60 karakter, ana konu başta, marka sonda",
  "metaDescription": "140-160 karakter, fayda + çağrı içeren",
  "h1": "sayfanın ana konusunu anlatan tek başlık",
  "altTexts": [{"src": "görsel adresi (yukarıdaki listeden)", "alt": "görselin ne gösterdiğini anlatan 5-12 kelime (dosya adından ve bağlamdan çıkar)"}],
  "schemaJsonLd": "sayfa türüne uygun, sadece sayfadaki bilgilerle doldurulmuş JSON-LD (string olarak) ya da null",
  "contentIdeas": ["içerik yetersizse eklenecek 3-5 somut bölüm/soru başlığı"],
  "notes": ["bu sayfaya özel 1-3 kısa ek öneri"]
}`;

  try {
    const r = await runFast(prompt, 0.3);
    if (r?.text) {
      const j = extractJsonObject(r.text);
      const str = (v: any) => (typeof v === "string" && v.trim() ? v.trim() : null);
      return {
        title: str(j.title),
        metaDescription: str(j.metaDescription),
        h1: str(j.h1),
        altTexts: Array.isArray(j.altTexts) ? j.altTexts.filter((a: any) => a && typeof a.alt === "string").slice(0, 8).map((a: any) => ({ src: String(a.src ?? ""), alt: a.alt.trim() })) : [],
        schemaJsonLd: typeof j.schemaJsonLd === "string" ? j.schemaJsonLd.trim() || null : j.schemaJsonLd && typeof j.schemaJsonLd === "object" ? JSON.stringify(j.schemaJsonLd, null, 2) : null,
        contentIdeas: Array.isArray(j.contentIdeas) ? j.contentIdeas.filter((x: any) => typeof x === "string").slice(0, 6) : [],
        notes: Array.isArray(j.notes) ? j.notes.filter((x: any) => typeof x === "string").slice(0, 4) : [],
        source: "ai",
        current,
      };
    }
  } catch {
    // kural tabanlı yedeğe düş
  }

  // --- Kural tabanlı yedek (AI anahtarı yoksa) ---
  const base = current.h1 || current.title || headings[0] || host;
  const brand = host.split(".")[0];
  const firstSentence = text.split(/(?<=[.!?])\s/).find((x) => x.length > 60) ?? text;
  return {
    title: cut(`${base} | ${brand.charAt(0).toUpperCase() + brand.slice(1)}`, 60),
    metaDescription: firstSentence && firstSentence.length >= 50 ? cut(firstSentence, 155) : null,
    h1: current.h1 ? null : cut(current.title?.split(/[|\-–]/)[0].trim() || base, 70),
    altTexts: noAlt.map((src) => ({
      src,
      alt: decodeURIComponent(src.split("/").pop() ?? "").replace(/\.[a-z0-9]+(\?.*)?$/i, "").replace(/[-_]+/g, " ").trim() || "Görseli açıklayın",
    })),
    schemaJsonLd: hasSchema
      ? null
      : JSON.stringify({ "@context": "https://schema.org", "@type": "WebPage", name: current.title ?? base, url, description: current.metaDescription ?? undefined }, null, 2),
    contentIdeas: words < 200 ? headings.length ? headings.slice(0, 3).map((h) => `${h} — bu başlığı 2-3 paragrafla açın`) : ["Bu sayfa kimin için ve ne sunuyor?", "Sık sorulan 3 soru ve kısa cevapları", "Diğer seçeneklerden farkı"] : [],
    notes: ["AI anahtarı bağlı olmadığı için öneriler sayfadaki metinden kurallarla çıkarıldı."],
    source: "kural",
    current,
  };
}
