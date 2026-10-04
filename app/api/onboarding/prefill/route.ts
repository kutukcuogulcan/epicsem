import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchPagePrefillMeta } from "@/lib/content-fetch";
import { domainFromUrl, guessNameFromDomain } from "@/lib/brand-discovery";
import { countryFromRegions, countryFromTld } from "@/lib/country-map";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";

const bodySchema = z.object({ url: z.string().min(3) });

function normalizeLanguage(htmlLang: string | null): "tr" | "en" | null {
  if (!htmlLang) return null;
  const base = htmlLang.split("-")[0];
  if (base === "tr") return "tr";
  if (base === "en") return "en";
  return null;
}

/**
 * POST /api/onboarding/prefill — Kart: LLM'siz otomatik doldurma ("Add project details").
 *
 * Wizard'ın Step 1 ekranı URL alanından çıkıldığı (blur) anda bu endpoint'i çağırır — Kart
 * 1'in asıl zincirinden (app/api/onboarding/sessions, Tarama → Profil ‖ Rakipler → Topic'ler →
 * Promptlar; hepsi LLM'li, dakikalar sürebilir) TAMAMEN ayrı, paralel ve çok daha hafif bir
 * çağrı: tek bir sayfa fetch'i (lib/content-fetch.ts'in fetchPagePrefillMeta'sı, 6sn timeout),
 * sıfır model çağrısı. Sadece Marka adı/Ülke/Dil alanlarını saniyeler içinde doldurmak için —
 * asıl (LLM'li, çok daha doğru) marka profili zaten Step 2'de Kart 1 üzerinden ayrıca geliyor;
 * bu sadece ilk sürtünmeyi azaltan hızlı ve kaba bir tahmin, hiçbir yerde "kesin doğru" olarak
 * sunulmuyor (frontend bütün alanları düzenlenebilir bırakıyor).
 *
 * Site'ye hiç ulaşılamazsa (timeout/DNS/ağ hatası/4xx-5xx) hata FIRLATMAZ — 200 ile
 * reachable:false döner: domain/TLD'den çıkarılabilen tahminler (marka adı, ülke) sayfaya hiç
 * ihtiyaç duymadığı için yine de dönüyor, sadece sayfa-bağımlı alan (dil) null kalıyor.
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  const limitResult = rateLimit(`onboarding-prefill:${user.id}`, 40, 60 * 60 * 1000);
  if (!limitResult.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached — up to 40 calls per hour. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limitResult.resetAt)) } }
    );
  }

  let body;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }

  const domain = domainFromUrl(body.url);
  const domainNameGuess = guessNameFromDomain(domain);
  const tldCountry = countryFromTld(domain);

  try {
    const meta = await fetchPagePrefillMeta(body.url);
    return NextResponse.json({
      reachable: true,
      domain,
      finalUrl: meta.finalUrl,
      brandNameGuess: meta.ogSiteName || meta.title || domainNameGuess,
      languageGuess: normalizeLanguage(meta.htmlLang),
      countryGuess: tldCountry ?? countryFromRegions(meta.hreflangRegions),
    });
  } catch (err) {
    // err.message (örn. Node'un ağ hatası için verdiği ham "fetch failed", ya da DNS/timeout
    // metinleri) teknik ve İngilizce — kullanıcıya hiçbir zaman olduğu gibi gösterilmiyor.
    // HTTP durumu biliniyorsa (site cevap verdi ama 4xx/5xx döndürdü) o bilgi Türkçe bir
    // cümleye gömülüyor; aksi halde (DNS/timeout/bağlantı hatası) tek bir genel mesaj
    // kullanılıyor. Ham hata yine de sunucu loguna düşüyor, debug için.
    console.warn("onboarding prefill fetch failed:", body.url, err);
    const httpStatusMatch = err instanceof Error ? err.message.match(/returned HTTP (\d+)/) : null;
    const warning = httpStatusMatch
      ? `Site HTTP ${httpStatusMatch[1]} döndürdü — alanlar domain'den tahmin edildi, gözden geçirin.`
      : "Site'ye ulaşılamadı — alanlar domain'den tahmin edildi, gözden geçirin.";
    return NextResponse.json({
      reachable: false,
      domain,
      finalUrl: null,
      brandNameGuess: domainNameGuess,
      languageGuess: null,
      countryGuess: tldCountry,
      warning,
    });
  }
}
