import type { SeoAuditResult, SeoIssueResult } from "@/types";

/**
 * Site Denetimi sonuçlarını kullanıcıya anlaşılır hale getirir (AI'sız, istemci tarafında çalışır):
 *  - Türkçe başlık / açıklama / düzeltme talimatı (eski kayıtlar dahil)
 *  - Neden önemli, etki ve efor, düzeltince kazanılacak puan
 *  - Kopyalanıp yapıştırılabilir hazır kod (robots.txt, llms.txt, canonical, lang, şema iskeleti…)
 *  - "Önce bunları düzelt" sıralaması ve puan dökümü
 */

export type Effort = "Kolay" | "Orta" | "Zor";
export interface IssueInsight {
  key: string;
  title: string;
  detail: string;
  recommendation: string;
  why: string;
  impact: 1 | 2 | 3;
  effort: Effort;
  /** Yapay zekâ görünürlüğünü (GEO/AXO) doğrudan etkiler mi? */
  geo: boolean;
  /** Düzeltince Teknik SEO puanına tahmini katkı. */
  gain: number;
  snippet: { label: string; lang: string; code: string } | null;
}

interface Rule {
  re: RegExp;
  key: string;
  title: (m: RegExpMatchArray) => string;
  rec: string;
  why: string;
  impact: 1 | 2 | 3;
  effort: Effort;
  geo?: boolean;
}

const RULES: Rule[] = [
  { re: /^Page returned HTTP (\d+)/, key: "http", title: (m) => `Sayfa HTTP ${m[1]} döndürüyor`, rec: "Adresin hem kullanıcılara hem tarayıcılara 200 (OK) döndürdüğünden emin ol; yönlendirme varsa son adrese doğrudan link ver.", why: "200 dönmeyen sayfa ne Google'da sıralanır ne de AI motorlarında kaynak olarak kullanılır.", impact: 3, effort: "Orta", geo: true },
  { re: /^Page could not be fetched/, key: "fetch", title: () => "Sayfa açılamadı", rec: "Alan adının erişilebilir olduğunu, güvenlik duvarının/WAF'ın botları engellemediğini ve DNS'in herkese açık çözüldüğünü kontrol et.", why: "Açılamayan sayfayı hiçbir arama ya da AI tarayıcısı okuyamaz.", impact: 3, effort: "Orta", geo: true },
  { re: /^Missing <title> tag/, key: "title-missing", title: () => "Title etiketi yok", rec: "50–60 karakterlik, ana kelimeyle başlayan, sayfaya özgü bir <title> ekle.", why: "Title, hem Google'ın hem AI motorlarının sayfayı özetlerken kullandığı en güçlü sinyaldir.", impact: 3, effort: "Kolay", geo: true },
  { re: /^Title tag is long/, key: "title-long", title: () => "Title çok uzun", rec: "Title'ı 60 karakterin altına indir; önemli kelimeleri başa al.", why: "Uzun title arama sonuçlarında kesilir, tıklama oranı düşer.", impact: 1, effort: "Kolay" },
  { re: /^Missing meta description/, key: "meta-missing", title: () => "Meta açıklama yok", rec: "140–160 karakterlik, sayfanın faydasını anlatan ve çağrı içeren bir meta açıklama yaz.", why: "Sayfada daha net bir özet yoksa AI motorları ve Google bu metni doğrudan kullanır.", impact: 2, effort: "Kolay", geo: true },
  { re: /^No canonical tag/, key: "canonical", title: () => "Canonical etiketi yok", rec: "Sayfanın kendisini gösteren bir canonical etiketi ekle.", why: "Aynı içeriğin farklı adreslerde (parametreli, www'li/www'siz) görünmesinden doğan kopya içerik karışıklığını önler.", impact: 1, effort: "Kolay" },
  { re: /^No H1 found/, key: "h1-missing", title: () => "H1 başlığı yok", rec: "Sayfanın ana konusunu söyleyen tek ve net bir H1 ekle.", why: "Google ve LLM'ler sayfanın konusunu ilk olarak H1'den anlar.", impact: 2, effort: "Kolay", geo: true },
  { re: /^Multiple H1 tags \((\d+)\)/, key: "h1-multi", title: (m) => `Birden fazla H1 var (${m[1]})`, rec: "Sayfada tek H1 bırak; diğer başlıkları H2/H3 yap.", why: "Birden fazla H1, sayfanın ana konusunu bulanıklaştırır.", impact: 1, effort: "Kolay" },
  { re: /^Thin content/, key: "thin", title: () => "İçerik zayıf (az metin)", rec: "Konuyu eksiksiz cevaplayan metin ekle: tanım, nasıl yapılır, karşılaştırma, SSS. İçeriğin JavaScript ile sonradan yüklenmediğinden emin ol.", why: "AI motorları soruyu tek başına cevaplayan, yeterince derin sayfaları alıntılar.", impact: 3, effort: "Zor", geo: true },
  { re: /^Content may not lead with a direct answer/, key: "answer-first", title: () => "Sayfa doğrudan cevapla başlamıyor", rec: "Sayfanın en üstüne konuyu 1–2 cümlede doğrudan cevaplayan bir paragraf koy, ayrıntıyı sonra ver.", why: "ChatGPT, Gemini ve Google AI Overviews en çok sayfanın başındaki net cevap paragrafını alıntılar.", impact: 2, effort: "Kolay", geo: true },
  { re: /^No structured data \(JSON-LD\) found/, key: "schema-missing", title: () => "Yapısal veri (JSON-LD) yok", rec: "Sayfa türüne uygun Organization / Article / Product / LocalBusiness / FAQPage şeması ekle.", why: "Yapısal veri, AI tarayıcılarının ve Google'ın bilgiyi (fiyat, adres, yazar, tarih) güvenle çıkarmasının en net yoludur.", impact: 3, effort: "Orta", geo: true },
  { re: /^No FAQPage schema/, key: "faq-schema", title: () => "FAQPage şeması yok", rec: "Sayfa sık sorulan soruları cevaplıyorsa onları FAQPage şemasıyla işaretle.", why: "Soru-cevap yapısı AI cevaplarında doğrudan alıntılanmaya en uygun formattır.", impact: 2, effort: "Kolay", geo: true },
  { re: /^No <html lang> attribute/, key: "lang", title: () => "Sayfa dili belirtilmemiş", rec: "<html> etiketine dil ekle (Türkçe için lang=\"tr\").", why: "Arama motorları ve AI tarayıcıları içeriği doğru dil/ülke kitlesine bununla yönlendirir; hreflang da buna dayanır.", impact: 1, effort: "Kolay" },
  { re: /^Turkish page with no hreflang alternates/, key: "hreflang", title: () => "Türkçe sayfada hreflang yok", rec: "Site başka dillerde de yayın yapıyorsa her dil için hreflang ve x-default ekle.", why: "Dil sürümleri birbirinin kopyası sanılmaz, Türk kullanıcıya doğru sayfa gösterilir.", impact: 1, effort: "Orta" },
  { re: /^No robots\.txt found/, key: "robots-missing", title: () => "robots.txt yok", rec: "Hangi arama ve AI botlarının siteye girebileceğini açıkça belirleyen bir robots.txt ekle.", why: "robots.txt yoksa AI botlarına izin verip vermediğini kontrol edemezsin; sitemap'i de buradan bildirirsin.", impact: 1, effort: "Kolay", geo: true },
  { re: /^(\d+) AI search\/citation crawler\(s\) blocked/, key: "ai-blocked", title: (m) => `${m[1]} AI arama/alıntı botu robots.txt ile engelli`, rec: "ChatGPT, Claude, Perplexity ve Google AI Overviews'da kaynak olarak görünmek istiyorsan bu botların Disallow kuralını kaldır.", why: "Bu botlar engelliyse sayfan AI cevaplarında hiç kaynak gösterilemez; GEO'nun ilk şartı budur.", impact: 3, effort: "Kolay", geo: true },
  { re: /^(\d+) AI training crawler\(s\) blocked/, key: "ai-training", title: (m) => `${m[1]} AI eğitim botu engelli`, rec: "Bu yalnızca model eğitimini engeller; alıntılanmanı etkilemez. Bilinçli bir tercihse dokunma.", why: "Eğitim botları (GPTBot, Google-Extended vb.) cevaplarda kaynak göstermez; engellemek görünürlüğü doğrudan düşürmez.", impact: 1, effort: "Kolay", geo: true },
  { re: /^(\d+) JSON-LD block\(s\) could not be parsed/, key: "schema-broken", title: (m) => `${m[1]} JSON-LD bloğu bozuk`, rec: "Bloğu validator.schema.org ya da Google Zengin Sonuç Testi'nde doğrula, sözdizimi hatasını düzelt.", why: "Bozuk JSON-LD'nin tamamı arama ve AI tarayıcıları tarafından yok sayılır.", impact: 3, effort: "Kolay", geo: true },
  { re: /^Structured data is incomplete \((\d+)\)/, key: "schema-incomplete", title: (m) => `Yapısal veri eksik (${m[1]} alan)`, rec: "Eksik özellikleri doldur (fiyat, yazar, tarih, adres, görsel…).", why: "Eksik şema zengin sonuç alamaz; AI motorları alıntılayacağı bilgiyi bulamaz.", impact: 2, effort: "Orta", geo: true },
  { re: /^(\d+) of (\d+) images have no alt attribute/, key: "img-alt", title: (m) => `${m[2]} görselden ${m[1]} tanesinde alt metin yok`, rec: "İçerik görsellerine kısa, açıklayıcı alt metin ekle (süs görsellerinde alt=\"\").", why: "Arama ve AI motorları görselleri alt metinle anlar; erişilebilirlik için de zorunludur.", impact: 1, effort: "Kolay" },
  { re: /^(\d+) images without width\/height/, key: "img-size", title: (m) => `${m[1]} görselde genişlik/yükseklik yok`, rec: "Görsellere width ve height (ya da CSS aspect-ratio) ver.", why: "Boyutsuz görseller yüklenirken sayfayı kaydırır (CLS), Core Web Vitals puanını düşürür.", impact: 1, effort: "Kolay" },
  { re: /^No lazy-loaded images/, key: "img-lazy", title: () => "Görseller geç yüklenmiyor (lazy yok)", rec: "Ekranın altındaki görsellere loading=\"lazy\" ekle (üstteki ana görsel hariç).", why: "Ana içerik daha hızlı yüklenir; hız hem sıralamayı hem kullanıcıyı etkiler.", impact: 1, effort: "Kolay" },
  { re: /^No internal links on the page/, key: "no-internal", title: () => "Sayfada iç link yok", rec: "İlgili sayfalara açıklayıcı bağlantı metniyle link ver.", why: "İç linkler tarayıcıların sayfaları bulmasını ve otoritenin dağılmasını sağlar; AI motorları da bağlamı linklerden kurar.", impact: 2, effort: "Kolay", geo: true },
  { re: /^(\d+) broken internal link\(s\)/, key: "broken-links", title: (m) => `${m[1]} kırık iç link`, rec: "4xx/5xx dönen linkleri düzelt ya da kaldır.", why: "Kırık linkler tarama bütçesini harcar, kullanıcıyı ve AI tarayıcılarını çıkmaza sokar.", impact: 2, effort: "Kolay" },
  { re: /^(\d+) internal links point to redirects/, key: "redirect-links", title: (m) => `${m[1]} iç link yönlendirmeye gidiyor`, rec: "Linkleri doğrudan son adrese güncelle.", why: "Her yönlendirme kullanıcı ve tarayıcı için ekstra adım ve hız kaybıdır.", impact: 1, effort: "Kolay" },
  { re: /^(\d+) links have no anchor text/, key: "empty-anchor", title: (m) => `${m[1]} linkte bağlantı metni yok`, rec: "Her linke görünür metin ya da aria-label ver.", why: "Tarayıcılar ve ekran okuyucular linkin nereye gittiğini metinden anlar.", impact: 1, effort: "Kolay" },
  { re: /^No sitemap\.xml found/, key: "sitemap-missing", title: () => "sitemap.xml bulunamadı", rec: "XML site haritası yayınla ve robots.txt'ye ekle.", why: "Site haritası, arama ve AI tarayıcılarının tüm sayfalarını bulmasını kolaylaştırır.", impact: 2, effort: "Orta", geo: true },
  { re: /^Sitemap is empty/, key: "sitemap-empty", title: () => "Site haritası boş", rec: "Site haritasının indekslenebilir tüm sayfaları listelediğinden emin ol.", why: "Boş site haritası tarayıcılara hiçbir sayfa bildirmez.", impact: 2, effort: "Orta" },
  { re: /^Sitemap contains broken URLs \((\d+) of (\d+)/, key: "sitemap-broken", title: (m) => `Site haritasında kırık adres var (${m[2]} örnekten ${m[1]})`, rec: "Silinen sayfaları site haritasından çıkar; yalnızca 200 dönen adresler kalsın.", why: "Kırık adresler tarayıcıların site haritasına güvenini azaltır.", impact: 2, effort: "Kolay" },
  { re: /^Sitemap contains redirecting URLs \((\d+) of (\d+)/, key: "sitemap-redirect", title: (m) => `Site haritasında yönlenen adres var (${m[2]} örnekten ${m[1]})`, rec: "Yönlenen adresleri hedef adresleriyle değiştir.", why: "Site haritası yalnızca son, indekslenebilir adresleri içermeli.", impact: 1, effort: "Kolay" },
  { re: /^Sitemap not referenced in robots\.txt/, key: "sitemap-robots", title: () => "Site haritası robots.txt'de yok", rec: "robots.txt'ye Sitemap satırı ekle.", why: "Search Console kullanmayan AI tarayıcıları site haritasını robots.txt'den bulur.", impact: 1, effort: "Kolay", geo: true },
  { re: /^No llms\.txt file/, key: "llms", title: () => "llms.txt dosyası yok", rec: "Markanın kısa özetini ve en önemli sayfaların linklerini içeren bir llms.txt ekle.", why: "LLM'lere sitenin temiz bir haritasını veren, yükselen bir standarttır; GEO için ucuz bir kazanım.", impact: 1, effort: "Kolay", geo: true },
  { re: /^No author shown/, key: "author", title: () => "Yazar bilgisi yok", rec: "Gerçek bir yazar adı, kısa biyografi ve yazar sayfası linki göster; Article şemasına author ekle.", why: "Deneyim ve uzmanlık (E-E-A-T) sinyalleri hem Google sıralamasını hem AI motorlarının kaynağa güvenini etkiler.", impact: 2, effort: "Orta", geo: true },
  { re: /^No published\/updated date/, key: "date", title: () => "Yayın / güncelleme tarihi yok", rec: "Görünür yayın ve son güncelleme tarihi göster; şemaya datePublished/dateModified ekle.", why: "AI motorları zamana duyarlı sorularda güncel kaynakları tercih eder.", impact: 2, effort: "Kolay", geo: true },
  { re: /^No sources cited in the content/, key: "citations", title: () => "İçerikte kaynak gösterilmemiş", rec: "Önemli iddialar için 2–3 güvenilir kaynağa (araştırma, resmi veri) link ver.", why: "Kaynaklı istatistik içeren sayfalar AI cevaplarında belirgin şekilde daha sık alıntılanır.", impact: 2, effort: "Orta", geo: true },
  { re: /^No About\/Contact link found/, key: "about", title: () => "Hakkımızda / İletişim linki yok", rec: "Footer'a Hakkımızda ve İletişim sayfalarının linkini ekle.", why: "Açık sahiplik ve iletişim bilgisi arama ve AI motorları için temel güven sinyalidir.", impact: 1, effort: "Kolay", geo: true },
];

const DETAIL_TR: [RegExp, string][] = [
  [/^Fetching (.+) did not return a 200 OK response\.$/, "$1 adresi 200 (OK) yanıtı vermedi."],
  [/^No <title> element was found in the page <head>\.$/, "Sayfanın <head> bölümünde <title> bulunamadı."],
  [/^Title is (\d+) characters: (.*)$/, "Title $1 karakter: $2"],
  [/^No <meta name="description"> tag found\.$/, "<meta name=\"description\"> etiketi bulunamadı."],
  [/^No <link rel="canonical"> found\.$/, "<link rel=\"canonical\"> bulunamadı."],
  [/^The page has zero <h1> elements\.$/, "Sayfada hiç <h1> yok."],
  [/^More than one <h1> can dilute topical clarity\.$/, "Birden fazla <h1> sayfanın ana konusunu bulanıklaştırır."],
  [/^Approx\. (\d+) words of visible text\.$/, "Görünür metin yaklaşık $1 kelime."],
  [/^The opening ~150 words don't show an obvious definitional\/answer pattern\.$/, "Sayfanın ilk ~150 kelimesinde net bir tanım/cevap cümlesi görünmüyor."],
  [/^No <script type="application\/ld\+json"> blocks detected\.$/, "Sayfada <script type=\"application/ld+json\"> bloğu yok."],
  [/^FAQPage structured data was not detected\.$/, "FAQPage yapısal verisi bulunamadı."],
  [/^The page doesn't declare a language via <html lang="\.\.\.">\.$/, "Sayfa <html lang=\"...\"> ile dil belirtmiyor."],
  [/^lang="tr" is declared but no <link rel="alternate" hreflang="\.\.\."> tags were found\.$/, "lang=\"tr\" var ama hreflang alternatifi yok."],
  [/^A missing robots\.txt is not an error.*$/, "robots.txt olmaması hata değildir ama AI botlarına açıkça izin verip engelleyemezsin."],
  [/^The JSON inside .*$/, "JSON-LD içindeki JSON geçersiz (fazla virgül, kaçışsız tırnak, içinde HTML vb.). Tarayıcılar bloğun tamamını yok sayar."],
  [/^Images without explicit dimensions shift the layout while loading\.$/, "Boyutu belirtilmemiş görseller yüklenirken sayfa düzenini kaydırır."],
  [/^(\d+) images, none with loading="lazy"\.$/, "$1 görsel var, hiçbirinde loading=\"lazy\" yok."],
  [/^The page doesn't link to any other page on the same site\.$/, "Sayfa aynı sitedeki başka hiçbir sayfaya link vermiyor."],
  [/^Some internal links go through a 3xx redirect before reaching the final page\.$/, "Bazı iç linkler son sayfaya ulaşmadan önce 3xx yönlendirmeden geçiyor."],
  [/^Links with no visible text, aria-label or image alt\.$/, "Görünür metni, aria-label'ı ya da görsel alt metni olmayan linkler."],
  [/^Checked (.+)\.$/, "Kontrol edilen adresler: $1."],
  [/^robots\.txt has no Sitemap: line\.$/, "robots.txt'de Sitemap: satırı yok."],
  [/^(.+)\/llms\.txt was not found\.$/, "$1/llms.txt bulunamadı."],
  [/^No author byline, meta author or schema author found on this article-like page\.$/, "Makale benzeri bu sayfada yazar adı, meta author ya da şemada author bulunamadı."],
  [/^No <time datetime>, article:published_time or schema datePublished found\.$/, "<time datetime>, article:published_time ya da şemada datePublished bulunamadı."],
  [/^The main content area has no links to external sources\.$/, "Ana içerikte dış kaynaklara hiç link yok."],
  [/^The page doesn't link to an About or Contact page\.$/, "Sayfa Hakkımızda ya da İletişim sayfasına link vermiyor."],
];

const trDetail = (d: string) => {
  for (const [re, to] of DETAIL_TR) if (re.test(d)) return d.replace(re, to);
  return d.replace(/\(training\)/g, "(eğitim)").replace(/, training\)/g, ", eğitim)");
};

const LOST: Record<string, number> = { critical: 20, warning: 8, info: 2, pass: 0 };
const SEO_CATS = new Set(["meta", "headings", "schema", "crawlability", "content", "performance", "images", "links"]);

const origin = (u: string) => {
  try {
    return new URL(u).origin;
  } catch {
    return "https://example.com";
  }
};

function snippetFor(key: string, r: SeoAuditResult): IssueInsight["snippet"] {
  const o = origin(r.url);
  const host = o.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  const brand = host.split(".")[0].replace(/^./, (c) => c.toLocaleUpperCase("tr"));
  switch (key) {
    case "ai-blocked":
    case "robots-missing": {
      const blocked = r.meta.aiBotAccess.filter((b) => !b.allowed && b.role !== "training").map((b) => b.bot);
      const bots = blocked.length ? blocked : ["OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "ClaudeBot", "Google-Extended"];
      return {
        label: key === "ai-blocked" ? "robots.txt — AI alıntı botlarına izin ver (bu satırları Disallow kurallarının ÜSTÜNE ekle)" : "Örnek robots.txt",
        lang: "txt",
        code: `${bots.map((b) => `User-agent: ${b}\nAllow: /`).join("\n\n")}\n\nUser-agent: *\nAllow: /\n\nSitemap: ${r.meta.sitemap?.url ?? `${o}/sitemap.xml`}`,
      };
    }
    case "sitemap-robots":
      return { label: "robots.txt'nin en altına ekle", lang: "txt", code: `Sitemap: ${r.meta.sitemap?.url ?? `${o}/sitemap.xml`}` };
    case "llms":
      return {
        label: `${o}/llms.txt olarak yayınla (köşeli parantezleri doldur)`,
        lang: "md",
        code: `# ${brand}\n\n> ${r.meta.description ?? `[${brand} ne yapar? 1–2 cümlelik net özet]`}\n\n## Önemli sayfalar\n\n- [Ana sayfa](${o}/): ${r.meta.title ?? brand}\n- [Hizmetler](${o}/[hizmetler]): [kısa açıklama]\n- [Hakkımızda](${o}/[hakkimizda]): [kim olduğunuz, deneyim]\n- [İletişim](${o}/[iletisim]): [adres, telefon]\n\n## Sık sorulanlar\n\n- [Blog / SSS](${o}/[blog]): [en çok sorulan konular]`,
      };
    case "canonical":
      return { label: "<head> içine ekle", lang: "html", code: `<link rel="canonical" href="${r.url.replace(/[?#].*$/, "")}" />` };
    case "lang":
      return { label: "<html> etiketini şöyle değiştir", lang: "html", code: `<html lang="tr">` };
    case "hreflang":
      return { label: "<head> içine, her dil sürümü için", lang: "html", code: `<link rel="alternate" hreflang="tr" href="${r.url}" />\n<link rel="alternate" hreflang="en" href="${o}/en/[sayfa]" />\n<link rel="alternate" hreflang="x-default" href="${r.url}" />` };
    case "title-missing":
    case "title-long":
      return { label: "<head> içine (köşeli parantezi doldur, 50–60 karakter)", lang: "html", code: `<title>[Ana kelime] – [fayda / ayırt edici bilgi] | ${brand}</title>` };
    case "h1-missing":
      return { label: "Sayfanın ana başlığı", lang: "html", code: `<h1>${r.meta.title?.split(/[|–-]/)[0].trim() ?? "[Sayfanın ana konusu]"}</h1>` };
    case "img-lazy":
      return { label: "Ekranın altındaki görseller için", lang: "html", code: `<img src="gorsel.jpg" alt="[açıklama]" width="800" height="450" loading="lazy" decoding="async" />` };
    case "img-size":
      return { label: "Her görsele gerçek boyutunu ver", lang: "html", code: `<img src="gorsel.jpg" alt="[açıklama]" width="1200" height="675" />\n\n/* ya da CSS ile */\nimg { aspect-ratio: 16 / 9; height: auto; }` };
    case "author":
    case "date":
      return {
        label: "Article şeması — <head> içine (köşeli parantezleri doldur)",
        lang: "html",
        code: `<script type="application/ld+json">\n${JSON.stringify(
          {
            "@context": "https://schema.org",
            "@type": "Article",
            headline: r.meta.title ?? "[Başlık]",
            author: { "@type": "Person", name: "[Yazar adı]", url: `${o}/[yazar-sayfasi]` },
            publisher: { "@type": "Organization", name: brand, url: o },
            datePublished: "[YYYY-MM-DD]",
            dateModified: new Date().toISOString().slice(0, 10),
            mainEntityOfPage: r.url,
          },
          null,
          2
        )}\n</script>`,
      };
    case "sitemap-missing":
      return { label: `${o}/sitemap.xml (çoğu CMS bunu otomatik üretir; WordPress'te Yoast/Rank Math)`, lang: "xml", code: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${o}/</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod></url>\n  <url><loc>${o}/[sayfa]</loc></url>\n</urlset>` };
    case "answer-first":
      return { label: "Sayfanın en üstüne konacak cevap paragrafı kalıbı", lang: "txt", code: `[Konu], [kime/ne için] [ne işe yarayan] bir [hizmet/ürün/yöntem]dir. ${brand} olarak [somut fayda + kanıt: süre, sayı, kapsam] sağlıyoruz. [1 cümle: nasıl başlanır / sonraki adım].` };
    default:
      return null;
  }
}

export function insightFor(issue: SeoIssueResult, r: SeoAuditResult): IssueInsight {
  const rule = RULES.find((x) => x.re.test(issue.title));
  const m = rule ? issue.title.match(rule.re)! : null;
  const key = rule?.key ?? "other";
  const lost = SEO_CATS.has(issue.category) ? LOST[issue.severity] ?? 0 : 0;
  return {
    key,
    title: rule && m ? rule.title(m) : issue.title,
    detail: trDetail(issue.detail),
    recommendation: rule?.rec ?? issue.recommendation,
    why: rule?.why ?? "",
    impact: rule?.impact ?? (issue.severity === "critical" ? 3 : issue.severity === "warning" ? 2 : 1),
    effort: rule?.effort ?? "Orta",
    geo: rule?.geo ?? issue.category === "ai-crawlability",
    gain: Math.round(lost + (lost ? 4 : 0)),
    snippet: snippetFor(key, r),
  };
}

/** "Önce bunları düzelt": etki × (puan kazancı + GEO bonusu) / efor. */
export function quickWins(r: SeoAuditResult, n = 5): (IssueInsight & { issue: SeoIssueResult })[] {
  const eff = { Kolay: 1, Orta: 2, Zor: 3 } as const;
  return r.issues
    .filter((i) => i.severity !== "pass")
    .map((i) => ({ ...insightFor(i, r), issue: i }))
    .map((x) => ({ x, s: (x.impact * 10 + x.gain + (x.geo ? 8 : 0)) / eff[x.effort] }))
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((y) => y.x);
}

/** Teknik SEO puanının kategori bazlı dökümü (başlangıç 70; geçen kontrol +4, kritik −20, uyarı −8, bilgi −2). */
export function scoreBreakdown(r: SeoAuditResult): { category: string; lost: number; gained: number; issues: number }[] {
  const by = new Map<string, { lost: number; gained: number; issues: number }>();
  for (const i of r.issues) {
    if (!SEO_CATS.has(i.category)) continue;
    const e = by.get(i.category) ?? { lost: 0, gained: 0, issues: 0 };
    if (i.severity === "pass") e.gained += 4;
    else {
      e.lost += LOST[i.severity];
      e.issues++;
    }
    by.set(i.category, e);
  }
  return [...by.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.lost - a.lost);
}

/** Düzeltilebilir tüm sorunlar giderilirse tahmini Teknik SEO puanı. */
export function potentialScore(r: SeoAuditResult): number {
  const fixable = r.issues.filter((i) => SEO_CATS.has(i.category) && i.severity !== "pass");
  return Math.min(100, r.score + fixable.reduce((s, i) => s + LOST[i.severity] + 4, 0));
}

/* ------------------------------------------------------------------ */
/* Katman puanları: SEO · AXO · AEO · GEO hazırlığı                    */
/* ------------------------------------------------------------------ */

export type PillarKey = "seo" | "axo" | "aeo" | "geo";

export interface PillarCheck {
  label: string;
  /** 0–1 arası (kısmi puan), null = bu taramada ölçülmedi (eski kayıt) — puana katılmaz. */
  score: number | null;
  weight: number;
  /** Ne bulundu (kısa, kullanıcıya gösterilir). */
  found: string;
  /** İlgili sorunun anahtarı (insightFor key) — çekmeceden sorunun ayrıntısına gitmek için. */
  issueKey?: string;
}

export interface Pillar {
  key: PillarKey;
  label: string;
  short: string;
  description: string;
  score: number;
  checks: PillarCheck[];
  /** Ölçülmüş AI görünürlüğü olmadığını vb. açıkça söyleyen not. */
  note?: string;
}

export interface PillarSummary {
  overall: number;
  pillars: Pillar[];
}

const PILLAR_WEIGHT: Record<PillarKey, number> = { seo: 0.3, axo: 0.2, aeo: 0.25, geo: 0.25 };

function pillarScore(checks: PillarCheck[]): number {
  const measured = checks.filter((c) => c.score != null);
  const w = measured.reduce((s, c) => s + c.weight, 0);
  if (!w) return 0;
  return Math.round((measured.reduce((s, c) => s + c.weight * (c.score as number), 0) / w) * 100);
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Site Denetimi özet bandı için 4 katman puanı. Hepsi bu taramanın gerçek sinyallerinden
 * (meta, robots.txt, şema, E-E-A-T, link ve görsel kontrolleri) hesaplanır; AI'sız ve ücretsizdir.
 * GEO hazırlığı, AI motorlarının bu sayfayı kaynak gösterebilmesi için gereken sinyallerdir —
 * ölçülmüş AI görünürlüğü DEĞİLDİR (onu GEO testi ölçer).
 */
export function pillarScores(r: SeoAuditResult): PillarSummary {
  const m = r.meta;
  const open = r.issues.filter((i) => i.severity !== "pass");
  const keys = new Set(open.map((i) => insightFor(i, r).key));
  const has = (k: string) => keys.has(k);
  const pageDown = has("http") || has("fetch");
  const types = (m.schemaTypes ?? []).map((t) => t.toLowerCase());
  const hasType = (...t: string[]) => types.some((x) => t.includes(x));

  const citeBots = m.aiBotAccess.filter((b) => b.role !== "training");
  const citeAllowed = citeBots.filter((b) => b.allowed).length;
  const botRatio = citeBots.length ? citeAllowed / citeBots.length : 1;

  const titleLen = m.title?.length ?? 0;
  const descLen = m.description?.length ?? 0;
  const words = m.wordCount ?? 0;

  /* SEO — Google'ın sayfayı bulup doğru anlaması */
  const seo: PillarCheck[] = [
    { label: "Sayfa açılıyor (200 OK)", weight: 3, score: pageDown ? 0 : 1, found: pageDown ? "Açılmadı ya da 200 dönmedi" : "200 OK", issueKey: has("fetch") ? "fetch" : "http" },
    { label: "Title (50–60 karakter)", weight: 3, score: !titleLen ? 0 : titleLen <= 60 ? 1 : 0.6, found: titleLen ? `${titleLen} karakter` : "Yok", issueKey: titleLen ? "title-long" : "title-missing" },
    { label: "Meta açıklama", weight: 2, score: descLen ? 1 : 0, found: descLen ? `${descLen} karakter` : "Yok", issueKey: "meta-missing" },
    { label: "Tek H1 başlığı", weight: 2, score: m.h1Count === 1 ? 1 : m.h1Count > 1 ? 0.5 : 0, found: `${m.h1Count} adet`, issueKey: m.h1Count ? "h1-multi" : "h1-missing" },
    { label: "Canonical etiketi", weight: 1, score: m.canonical ? 1 : 0, found: m.canonical ? "Var" : "Yok", issueKey: "canonical" },
    { label: "Sayfa dili (html lang)", weight: 1, score: m.htmlLang ? 1 : 0, found: m.htmlLang ?? "Belirtilmemiş", issueKey: "lang" },
    {
      label: "Site haritası",
      weight: 2,
      score: m.sitemap ? (m.sitemap.url ? (m.sitemap.broken.length ? 0.5 : 1) : 0) : m.sitemapFound ? 1 : 0,
      found: m.sitemap ? (m.sitemap.url ? `${m.sitemap.urls} URL${m.sitemap.broken.length ? `, ${m.sitemap.broken.length} kırık` : ""}` : "Bulunamadı") : m.sitemapFound ? "Bulundu" : "Bulunamadı",
      issueKey: m.sitemap?.broken.length ? "sitemap-broken" : "sitemap-missing",
    },
    {
      label: "Kırık iç link yok",
      weight: 2,
      score: m.links ? (m.links.broken.length ? 0 : 1) : null,
      found: m.links ? (m.links.broken.length ? `${m.links.broken.length} kırık` : `${m.links.checked} link kontrol edildi`) : "Ölçülmedi",
      issueKey: "broken-links",
    },
    { label: "İç linkler", weight: 2, score: m.links ? (m.links.internal > 0 ? 1 : 0) : has("no-internal") ? 0 : null, found: m.links ? `${m.links.internal} iç link` : "Ölçülmedi", issueKey: "no-internal" },
    {
      label: "Görsellerde alt metin",
      weight: 1,
      score: m.images ? (m.images.total ? clamp01(1 - m.images.noAlt / m.images.total) : 1) : null,
      found: m.images ? (m.images.total ? `${m.images.total - m.images.noAlt}/${m.images.total} görselde var` : "Görsel yok") : "Ölçülmedi",
      issueKey: "img-alt",
    },
    {
      label: "Görsel boyutları (CLS)",
      weight: 1,
      score: m.images ? (m.images.total ? clamp01(1 - m.images.noSize / m.images.total) : 1) : null,
      found: m.images ? (m.images.total ? `${m.images.noSize} görselde boyut yok` : "Görsel yok") : "Ölçülmedi",
      issueKey: "img-size",
    },
  ];

  /* AXO — AI tarayıcıları ve ajanlar sayfaya erişip okuyabiliyor mu */
  const axo: PillarCheck[] = [
    {
      label: "AI alıntı botlarına izin",
      weight: 4,
      score: pageDown ? 0 : botRatio,
      found: citeBots.length ? `${citeAllowed}/${citeBots.length} bot izinli` : "robots.txt kuralı yok",
      issueKey: "ai-blocked",
    },
    { label: "robots.txt", weight: 1, score: m.robotsTxtFound ? 1 : 0, found: m.robotsTxtFound ? "Bulundu" : "Bulunamadı", issueKey: "robots-missing" },
    { label: "Site haritası robots.txt'de", weight: 1, score: m.sitemap ? (m.sitemap.inRobots ? 1 : 0) : null, found: m.sitemap ? (m.sitemap.inRobots ? "Var" : "Yok") : "Ölçülmedi", issueKey: "sitemap-robots" },
    { label: "llms.txt", weight: 1, score: m.llmsTxt === undefined ? null : m.llmsTxt ? 1 : 0, found: m.llmsTxt === undefined ? "Ölçülmedi" : m.llmsTxt ? "Bulundu" : "Yok", issueKey: "llms" },
    { label: "Yapısal veri (JSON-LD)", weight: 2, score: m.hasSchema ? 1 : 0, found: m.hasSchema ? m.schemaTypes.join(", ") || "Var" : "Yok", issueKey: "schema-missing" },
    { label: "JSON-LD hatasız", weight: 2, score: !m.hasSchema ? 0 : has("schema-broken") ? 0 : has("schema-incomplete") ? 0.6 : 1, found: has("schema-broken") ? "Bozuk blok var" : has("schema-incomplete") ? "Eksik alanlar var" : m.hasSchema ? "Geçerli" : "Şema yok", issueKey: has("schema-broken") ? "schema-broken" : "schema-incomplete" },
    { label: "Metin HTML'de (JS'siz okunuyor)", weight: 2, score: pageDown ? 0 : words >= 300 ? 1 : words >= 120 ? 0.5 : 0, found: `~${words} kelime`, issueKey: "thin" },
  ];

  /* AEO — sayfa bir soruyu doğrudan cevaplamaya hazır mı */
  const aeo: PillarCheck[] = [
    { label: "Cevap-önce giriş paragrafı", weight: 3, score: pageDown ? 0 : has("answer-first") ? 0 : 1, found: has("answer-first") ? "İlk 150 kelimede net cevap yok" : "Var", issueKey: "answer-first" },
    { label: "FAQPage şeması", weight: 2, score: hasType("faqpage") ? 1 : 0, found: hasType("faqpage") ? "Var" : "Yok", issueKey: "faq-schema" },
    { label: "İçerik derinliği", weight: 2, score: words >= 800 ? 1 : words >= 300 ? 0.6 : words >= 120 ? 0.3 : 0, found: `~${words} kelime`, issueKey: "thin" },
    { label: "Net konu başlığı (H1)", weight: 1, score: m.h1Count >= 1 ? 1 : 0, found: `${m.h1Count} adet`, issueKey: "h1-missing" },
    { label: "Özet metni (meta açıklama)", weight: 1, score: descLen ? 1 : 0, found: descLen ? "Var" : "Yok", issueKey: "meta-missing" },
  ];

  /* GEO hazırlığı — AI motorlarının bu kaynağa güvenip alıntılaması için gereken sinyaller */
  const cit = m.eeat?.citations ?? m.links?.outboundCitations;
  const geo: PillarCheck[] = [
    { label: "Yazar bilgisi", weight: 2, score: m.eeat ? (m.eeat.author ? 1 : 0) : null, found: m.eeat ? (m.eeat.author ? "Var" : "Yok") : "Ölçülmedi", issueKey: "author" },
    { label: "Yayın / güncelleme tarihi", weight: 2, score: m.eeat ? (m.eeat.date ? 1 : 0) : null, found: m.eeat ? (m.eeat.date ? "Var" : "Yok") : "Ölçülmedi", issueKey: "date" },
    { label: "Kaynak gösterimi", weight: 2, score: cit == null ? null : cit >= 2 ? 1 : cit === 1 ? 0.5 : 0, found: cit == null ? "Ölçülmedi" : `${cit} dış kaynak linki`, issueKey: "citations" },
    { label: "Hakkımızda / İletişim", weight: 1, score: m.eeat ? (m.eeat.about ? 1 : 0) : null, found: m.eeat ? (m.eeat.about ? "Link var" : "Link yok") : "Ölçülmedi", issueKey: "about" },
    {
      label: "Kurum / içerik şeması",
      weight: 2,
      score: hasType("organization", "localbusiness", "corporation") ? 1 : hasType("article", "blogposting", "newsarticle", "product", "service", "webpage") ? 0.6 : 0,
      found: m.hasSchema ? m.schemaTypes.join(", ") || "Var" : "Yok",
      issueKey: "schema-missing",
    },
    { label: "AI alıntı botları açık", weight: 2, score: pageDown ? 0 : botRatio, found: citeBots.length ? `${citeAllowed}/${citeBots.length} izinli` : "Kural yok (izinli)", issueKey: "ai-blocked" },
    { label: "llms.txt", weight: 1, score: m.llmsTxt === undefined ? null : m.llmsTxt ? 1 : 0, found: m.llmsTxt === undefined ? "Ölçülmedi" : m.llmsTxt ? "Bulundu" : "Yok", issueKey: "llms" },
  ];

  const pillars: Pillar[] = [
    { key: "seo", label: "SEO", short: "Teknik SEO", description: "Google sayfayı bulup doğru anlayabiliyor mu: title, meta, H1, canonical, site haritası, linkler, görseller.", score: pillarScore(seo), checks: seo },
    { key: "axo", label: "AXO", short: "AI erişimi", description: "AI tarayıcıları ve ajanlar sayfaya girip okuyabiliyor mu: robots.txt, llms.txt, JSON-LD, sunucuda hazır metin.", score: pillarScore(axo), checks: axo },
    { key: "aeo", label: "AEO", short: "Cevap hazırlığı", description: "Sayfa bir soruyu doğrudan cevaplıyor mu: cevap-önce giriş, SSS şeması, yeterli derinlik.", score: pillarScore(aeo), checks: aeo },
    {
      key: "geo",
      label: "GEO",
      short: "GEO hazırlığı",
      description: "AI motorlarının bu sayfaya güvenip kaynak göstermesi için gereken sinyaller: yazar, tarih, kaynaklar, kurum şeması.",
      score: pillarScore(geo),
      checks: geo,
      note: "Bu bir hazırlık puanıdır, ölçülmüş AI görünürlüğü değildir. Markanın ChatGPT, Gemini, Claude ve Perplexity cevaplarında gerçekten geçip geçmediğini GEO testi ölçer.",
    },
  ];
  const overall = Math.round(pillars.reduce((s, p) => s + p.score * PILLAR_WEIGHT[p.key], 0));
  return { overall, pillars };
}

export interface OverallLoss {
  pillar: PillarKey;
  pillarLabel: string;
  label: string;
  issueKey?: string;
  /** Genel puandan kaybettirdiği puan (0-100 ölçeğinde). */
  lost: number;
}

/**
 * Genel puanın nereden düştüğü: her eksik kontrolün genel puana etkisi
 * (katman ağırlığı × katman içindeki payı × eksik oranı). "Puanın neden …?" paneli ve
 * "+N puan" kazançları bu tek ölçeği kullanır; böylece ekrandaki sayılar birbirini tutar.
 */
export function overallLosses(s: PillarSummary): OverallLoss[] {
  const out: OverallLoss[] = [];
  for (const p of s.pillars) {
    const measured = p.checks.filter((c) => c.score != null);
    const W = measured.reduce((a, c) => a + c.weight, 0);
    if (!W) continue;
    for (const c of measured) {
      const lost = PILLAR_WEIGHT[p.key] * (c.weight / W) * (1 - (c.score as number)) * 100;
      if (lost > 0.05) out.push({ pillar: p.key, pillarLabel: p.label, label: c.label, issueKey: c.issueKey, lost });
    }
  }
  return out.sort((a, b) => b.lost - a.lost);
}

/** Bir sorunu düzeltince genel puana tahmini katkı (aynı sorun birden çok katmanı etkileyebilir). */
export function overallGainFor(losses: OverallLoss[], issueKey: string): number {
  return Math.round(losses.filter((l) => l.issueKey === issueKey).reduce((a, l) => a + l.lost, 0));
}
