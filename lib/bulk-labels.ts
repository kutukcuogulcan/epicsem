/** Site taraması sorun kodlarının Türkçe adları ve Screaming Frog sekmelerine benzer grupları. */
export const ISSUE_LABEL: Record<string, string> = {
  broken: "Kırık sayfa (4xx/5xx)",
  redirect: "Yönlendirme (3xx)",
  "redirect-chain": "Yönlendirme zinciri",
  "broken-outlinks": "Kırık iç link içeriyor",
  "orphan-page": "Yetim sayfa",
  "deep-page": "Çok derin (4+ tık)",
  "not-in-sitemap": "Sitemap'te yok",
  "missing-title": "Eksik title",
  "title-too-long": "Title çok uzun (60+)",
  "title-too-short": "Title çok kısa (<30)",
  "duplicate-title": "Tekrarlayan title",
  "missing-meta-description": "Eksik meta açıklaması",
  "meta-description-too-long": "Meta çok uzun (160+)",
  "meta-description-too-short": "Meta çok kısa (<70)",
  "duplicate-meta-description": "Tekrarlayan meta",
  "missing-h1": "Eksik H1",
  "multiple-h1": "Birden çok H1",
  "missing-h2": "H2 yok",
  "thin-content": "Yetersiz içerik (<200 kelime)",
  "images-missing-alt": "Alt metni eksik görsel",
  "missing-canonical": "Canonical yok",
  "non-indexable": "İndekslenemez",
  "noindex-tag": "Noindex etiketi",
  "missing-schema": "Schema (yapısal veri) yok",
  "missing-viewport": "Mobil viewport yok",
  "missing-lang": "Dil (lang) etiketi yok",
  "missing-open-graph": "Open Graph yok",
  "mixed-content": "Karışık içerik (http)",
  "slow-response": "Yavaş yanıt (1,5 sn+)",
  "large-page": "Büyük sayfa (500 KB+)",
  "redirect-loop": "Yönlendirme döngüsü",
  "redirect-temporary": "Geçici yönlendirme (302/307)",
  "https-to-http": "HTTPS'ten HTTP'ye yönlendirme",
  "broken-external-links": "Kırık dış link içeriyor",
  "broken-images": "Kırık görsel içeriyor",
  "large-images": "Büyük görsel (100 KB+)",
  "images-no-dimensions": "Boyutsuz görsel (genişlik/yükseklik yok)",
  "empty-anchor": "Boş link metni",
  "generic-anchor": "Anlamsız link metni (tıklayın, devamı…)",
  "nofollow-internal": "Nofollow iç link",
  "too-many-links": "Çok fazla link (150+)",
  "canonical-to-non200": "Canonical kırık/yönlenen adresi gösteriyor",
  "title-equals-h1": "Title ile H1 birebir aynı",
  "near-duplicate": "Neredeyse aynı içerik",
  "noindex-in-sitemap": "Sitemap'te noindex sayfa",
  "hreflang-invalid": "Geçersiz hreflang dil kodu",
  "hreflang-no-self": "hreflang kendini göstermiyor",
  "hreflang-no-return": "hreflang karşı link eksik",
  "no-https": "Site HTTPS kullanmıyor",
  "no-hsts": "HSTS başlığı yok",
  "http-not-redirected": "HTTP sürümü HTTPS'e yönlenmiyor",
};

export const ISSUE_GROUPS: { label: string; codes: string[] }[] = [
  { label: "Yanıt kodları", codes: ["broken", "redirect", "redirect-chain", "redirect-loop", "redirect-temporary", "https-to-http"] },
  { label: "Linkler & yapı", codes: ["broken-outlinks", "broken-external-links", "orphan-page", "deep-page", "not-in-sitemap", "empty-anchor", "generic-anchor", "nofollow-internal", "too-many-links"] },
  { label: "Title & meta", codes: ["missing-title", "title-too-long", "title-too-short", "duplicate-title", "missing-meta-description", "meta-description-too-long", "meta-description-too-short", "duplicate-meta-description"] },
  { label: "Başlıklar & içerik", codes: ["missing-h1", "multiple-h1", "missing-h2", "thin-content"] },
  { label: "Görseller", codes: ["images-missing-alt", "broken-images", "large-images", "images-no-dimensions"] },
  { label: "İndekslenme", codes: ["non-indexable", "noindex-tag", "missing-canonical", "canonical-to-non200", "noindex-in-sitemap", "near-duplicate", "title-equals-h1"] },
  { label: "Çok dilli (hreflang)", codes: ["hreflang-invalid", "hreflang-no-self", "hreflang-no-return"] },
  { label: "Güvenlik", codes: ["no-https", "no-hsts", "http-not-redirected"] },
  { label: "Teknik & AI hazırlığı", codes: ["missing-schema", "missing-viewport", "missing-lang", "missing-open-graph", "mixed-content"] },
  { label: "Performans", codes: ["slow-response", "large-page"] },
];

/** Kritik (kırmızı) sayılan sorunlar. */
export const CRITICAL_ISSUES = new Set(["broken", "broken-outlinks", "missing-title", "noindex-tag", "redirect-chain", "mixed-content", "redirect-loop", "https-to-http", "broken-images", "canonical-to-non200", "no-https", "http-not-redirected"]);

export type Severity = "error" | "warning" | "notice";

/** Ahrefs/Semrush Site Audit mantığı: Hata = sıralamayı doğrudan bozar, Uyarı = düzeltilmeli, Bildirim = bilgi. */
export const ISSUE_SEVERITY: Record<string, Severity> = {
  broken: "error",
  "broken-outlinks": "error",
  "redirect-chain": "error",
  "missing-title": "error",
  "duplicate-title": "error",
  "duplicate-meta-description": "error",
  "mixed-content": "error",
  "missing-meta-description": "warning",
  "title-too-long": "warning",
  "title-too-short": "warning",
  "meta-description-too-long": "warning",
  "meta-description-too-short": "warning",
  "missing-h1": "warning",
  "multiple-h1": "warning",
  "thin-content": "warning",
  "images-missing-alt": "warning",
  "missing-canonical": "warning",
  "missing-viewport": "warning",
  "slow-response": "warning",
  "large-page": "warning",
  "orphan-page": "warning",
  redirect: "notice",
  "non-indexable": "notice",
  "noindex-tag": "notice",
  "deep-page": "notice",
  "missing-h2": "notice",
  "missing-schema": "notice",
  "missing-lang": "notice",
  "missing-open-graph": "notice",
  "not-in-sitemap": "notice",
  "redirect-loop": "error",
  "redirect-temporary": "warning",
  "https-to-http": "error",
  "broken-external-links": "warning",
  "broken-images": "error",
  "large-images": "warning",
  "images-no-dimensions": "notice",
  "empty-anchor": "warning",
  "generic-anchor": "notice",
  "nofollow-internal": "notice",
  "too-many-links": "notice",
  "canonical-to-non200": "error",
  "title-equals-h1": "notice",
  "near-duplicate": "warning",
  "noindex-in-sitemap": "warning",
  "hreflang-invalid": "warning",
  "hreflang-no-self": "notice",
  "hreflang-no-return": "warning",
  "no-https": "error",
  "no-hsts": "notice",
  "http-not-redirected": "error",
};

export const SEVERITY_LABEL: Record<Severity, string> = { error: "Hata", warning: "Uyarı", notice: "Bildirim" };

export type Impact = "yüksek" | "orta" | "düşük";
export type Effort = "kolay" | "orta" | "zor";

export interface IssueInfo {
  /** Sorun nedir — sade dille. */
  what: string;
  /** Neden önemli — SEO / AI görünürlüğüne etkisi. */
  why: string;
  /** Nasıl çözülür — sırayla yapılacak adımlar. */
  steps: string[];
  /** Kopyalanabilir örnek (HTML/kod), varsa. */
  example?: string;
  impact: Impact;
  effort: Effort;
}

/** Her sorun için Ahrefs/Semrush'taki "About this issue / How to fix" karşılığı. */
export const ISSUE_INFO: Record<string, IssueInfo> = {
  broken: {
    what: "Sayfa açılmıyor: sunucu 4xx (bulunamadı/yasak) ya da 5xx (sunucu hatası) döndürüyor.",
    why: "Ziyaretçi ve Google boş bir sayfaya düşer; bu adrese gelen link değeri kaybolur ve tarama bütçesi boşa harcanır.",
    steps: [
      "Sayfa yanlışlıkla silindiyse geri getirin.",
      "Kalıcı olarak kaldırıldıysa 301 ile en yakın ilgili sayfaya (kategori/benzer ürün) yönlendirin.",
      "Bu adrese link veren iç sayfaları bulup linkleri yeni adrese çevirin (Sorunlar › 'Kırık iç link içeriyor').",
      "Sitemap'ten çıkarın.",
    ],
    example: "# .htaccess (Apache)\nRedirect 301 /eski-sayfa /yeni-sayfa",
    impact: "yüksek",
    effort: "kolay",
  },
  "broken-outlinks": {
    what: "Bu sayfada, açılmayan (4xx/5xx) bir sayfaya giden iç link var.",
    why: "Kullanıcıyı çıkmaza sokar, Google'a sitenin bakımsız olduğu sinyalini verir ve link değeri boşa gider.",
    steps: ["Sayfa ayrıntısında 'Kırık sayfalara giden linkler' listesine bakın.", "Her linki çalışan doğru adrese çevirin ya da kaldırın.", "Menü/footer'daysa tek değişiklik tüm siteyi düzeltir."],
    impact: "yüksek",
    effort: "kolay",
  },
  "redirect-chain": {
    what: "Yönlendirme başka bir yönlendirmeye gidiyor (A → B → C).",
    why: "Her adım sayfayı yavaşlatır, link değerinin bir kısmı kaybolabilir; Google uzun zincirleri yarıda bırakabilir.",
    steps: ["İlk yönlendirmeyi doğrudan son adrese (C) yönlendirin.", "Bu adrese verilen iç linkleri de doğrudan son adrese çevirin.", "http→https ve www yönlendirmelerini tek adımda birleştirin."],
    example: "# A doğrudan C'ye\nRedirect 301 /a /c",
    impact: "yüksek",
    effort: "kolay",
  },
  "missing-title": {
    what: "Sayfada <title> etiketi yok ya da boş.",
    why: "Title, Google sonucunda ve AI yanıtlarında sayfanın başlığıdır; yoksa Google kendi uydurur ve tıklama oranı düşer.",
    steps: ["Sayfanın konusunu ve ana anahtar kelimeyi içeren 50–60 karakterlik bir başlık yazın.", "Anahtar kelimeyi başa, marka adını sona koyun.", "Her sayfada benzersiz olsun."],
    example: "<title>Kadın Abiye Elbise Modelleri 2026 | Markanız</title>",
    impact: "yüksek",
    effort: "kolay",
  },
  "duplicate-title": {
    what: "Birden çok sayfa aynı title'ı kullanıyor.",
    why: "Sayfalar aynı aramada birbiriyle yarışır (cannibalization); Google hangisini göstereceğini seçemez.",
    steps: ["Her sayfanın diğerlerinden farkını (ürün adı, renk, şehir, kategori) title'a ekleyin.", "Gerçekten aynı içerikse sayfaları birleştirin ya da canonical ile tek sayfayı işaret edin.", "CMS şablonu title'ı otomatik üretiyorsa şablona sayfaya özel alan ekleyin."],
    impact: "yüksek",
    effort: "orta",
  },
  "duplicate-meta-description": {
    what: "Birden çok sayfa aynı meta açıklamayı kullanıyor.",
    why: "Arama sonucunda sayfalar birbirinden ayırt edilemez, tıklama oranı düşer.",
    steps: ["Her sayfa için içeriğine özel 140–160 karakterlik bir açıklama yazın.", "Şablondan gelen sabit açıklamayı kaldırın."],
    impact: "orta",
    effort: "orta",
  },
  "mixed-content": {
    what: "HTTPS sayfa, http:// ile başlayan görsel/script/CSS yüklüyor.",
    why: "Tarayıcı güvenlik uyarısı gösterir ya da kaynağı engeller; sayfa bozuk görünebilir.",
    steps: ["Sayfa ayrıntısında http:// kaynakları bulun.", "Adresleri https:// ile değiştirin (kaynak https desteklemiyorsa dosyayı kendi sunucunuza alın)."],
    example: '<img src="https://site.com/gorsel.jpg">',
    impact: "yüksek",
    effort: "kolay",
  },
  "missing-meta-description": {
    what: "Sayfada meta açıklama yok.",
    why: "Google sonuçta sayfadan rastgele bir parça gösterir; ikna edici bir özet olmadığı için tıklama oranı düşer.",
    steps: ["Sayfayı 140–160 karakterde özetleyin.", "Ana anahtar kelimeyi ve bir fayda/çağrı (ücretsiz kargo, hemen inceleyin…) ekleyin."],
    example: '<meta name="description" content="2026 abiye elbise modelleri: 200+ model, aynı gün kargo ve kolay iade. Bedeninizi seçin, hemen inceleyin.">',
    impact: "orta",
    effort: "kolay",
  },
  "title-too-long": {
    what: "Title 60 karakterden uzun.",
    why: "Google sonucunda kesilir (…), sondaki önemli kelimeler görünmez.",
    steps: ["Gereksiz kelimeleri ve tekrarları çıkarın.", "Anahtar kelimeyi başa alın, marka adını kısaltın ya da sona koyun.", "60 karakterin altına indirin."],
    impact: "düşük",
    effort: "kolay",
  },
  "title-too-short": {
    what: "Title 30 karakterden kısa.",
    why: "Sayfanın konusunu yeterince anlatmaz; ek anahtar kelimelerle sıralanma fırsatı kaçar.",
    steps: ["Konu + nitelik + marka formülüyle 30–60 karaktere genişletin (ör. 'Abiye' → 'Abiye Elbise Modelleri ve Fiyatları | Marka')."],
    impact: "düşük",
    effort: "kolay",
  },
  "meta-description-too-long": {
    what: "Meta açıklama 160 karakterden uzun.",
    why: "Arama sonucunda kesilir; mesajın sonu görünmez.",
    steps: ["En önemli bilgiyi ilk 120 karaktere koyun.", "Toplamı 160 karakterin altına indirin."],
    impact: "düşük",
    effort: "kolay",
  },
  "meta-description-too-short": {
    what: "Meta açıklama 70 karakterden kısa.",
    why: "Sonuçta yeterli bilgi vermez; Google çoğu zaman kendi metnini seçer.",
    steps: ["Sayfanın sunduğu faydayı ve bir çağrıyı ekleyerek 140–160 karaktere tamamlayın."],
    impact: "düşük",
    effort: "kolay",
  },
  "missing-h1": {
    what: "Sayfada H1 başlığı yok.",
    why: "H1, sayfanın ana konusunu kullanıcıya, Google'a ve AI motorlarına söyleyen başlıktır.",
    steps: ["Sayfanın en üstüne konuyu anlatan tek bir H1 ekleyin.", "Logo ya da slider metni H1 olmamalı; içerik başlığı H1 olmalı."],
    example: "<h1>Kadın Abiye Elbise Modelleri</h1>",
    impact: "orta",
    effort: "kolay",
  },
  "multiple-h1": {
    what: "Sayfada birden fazla H1 var.",
    why: "Ana konu bulanıklaşır; tema genelde logo/menü metnini de H1 yapıyordur.",
    steps: ["Sayfanın ana başlığını H1 bırakın.", "Diğer H1'leri H2/H3'e çevirin (genelde tema şablonunda tek değişiklik)."],
    impact: "düşük",
    effort: "kolay",
  },
  "thin-content": {
    what: "Sayfada 200 kelimeden az metin var.",
    why: "Kullanıcının sorusuna yeterli cevap vermez; Google ve AI motorları bu sayfaları az değerli görür, nadiren alıntılar.",
    steps: ["Sayfanın cevaplaması gereken 3–5 soruyu çıkarın (ne, nasıl, kimin için, fiyat, fark).", "Her soruyu kısa bir H2 + 2–3 cümlelik cevapla ekleyin.", "Ürün sayfasıysa özellik tablosu, beden/kullanım bilgisi ve SSS ekleyin.", "Değeri yoksa benzer sayfayla birleştirin ya da noindex yapın."],
    impact: "orta",
    effort: "orta",
  },
  "images-missing-alt": {
    what: "Sayfadaki bazı görsellerin alt metni yok.",
    why: "Görsel aramada görünmezler, ekran okuyucular okuyamaz; Google ve AI görselin ne olduğunu anlayamaz.",
    steps: ["Her görsele ne gösterdiğini anlatan kısa bir alt metni yazın (5–12 kelime).", "Anahtar kelime doldurmayın; görseli doğal anlatın.", "Sadece süs olan görsellere alt=\"\" verin."],
    example: '<img src="abiye-kirmizi.jpg" alt="Kırmızı saten uzun abiye elbise, önden görünüm">',
    impact: "orta",
    effort: "kolay",
  },
  "missing-canonical": {
    what: "Sayfada canonical etiketi yok.",
    why: "Parametreli (?utm, ?sort) ya da kopya adresler aynı içeriği bölüşür; Google yanlış adresi seçebilir.",
    steps: ["Her sayfanın <head> bölümüne kendi temiz adresini gösteren canonical ekleyin.", "Çoğu CMS'de (WordPress + Yoast/RankMath, Shopify) bir ayarla açılır."],
    example: '<link rel="canonical" href="https://site.com/abiye-elbise">',
    impact: "orta",
    effort: "kolay",
  },
  "missing-viewport": {
    what: "Sayfada mobil viewport etiketi yok.",
    why: "Sayfa mobilde küçülmüş masaüstü gibi görünür; Google mobil sürüme göre sıralar.",
    steps: ["<head> içine viewport etiketini ekleyin.", "Sonra sayfayı telefonda kontrol edin."],
    example: '<meta name="viewport" content="width=device-width, initial-scale=1">',
    impact: "yüksek",
    effort: "kolay",
  },
  "slow-response": {
    what: "Sunucu sayfayı 1,5 saniyeden geç gönderiyor.",
    why: "Yavaş sayfalar ziyaretçiyi kaçırır, Core Web Vitals'ı bozar ve Google daha az sayfa tarar.",
    steps: ["Sayfa önbelleğini (cache) açın (WordPress: WP Rocket/LiteSpeed Cache).", "CDN kullanın (Cloudflare).", "Yavaş eklenti/sorguları kaldırın, hosting planını kontrol edin."],
    impact: "orta",
    effort: "orta",
  },
  "large-page": {
    what: "Sayfanın HTML'i 500 KB'tan büyük.",
    why: "Mobilde geç yüklenir, tarayıcıyı yorar ve tarama bütçesini tüketir.",
    steps: ["Satır içi büyük script/CSS ve gömülü verileri ayrı dosyalara taşıyın.", "Sayfada gereksiz tekrar eden HTML bloklarını (dev menüler, gizli ürün listeleri) azaltın."],
    impact: "düşük",
    effort: "orta",
  },
  "orphan-page": {
    what: "Sayfa sitemap'te var ama sitedeki hiçbir sayfa ona link vermiyor.",
    why: "Google bu sayfaları zor bulur ve önemsiz sayar; link değeri alamazlar.",
    steps: ["Sayfayı ilgili kategori, menü ya da blog yazılarından linkleyin.", "Artık gereksizse kaldırıp sitemap'ten çıkarın (ya da 301 verin)."],
    impact: "orta",
    effort: "kolay",
  },
  redirect: {
    what: "Bu adres başka bir adrese yönlendiriyor (3xx).",
    why: "Tek başına sorun değildir; ama iç linkler yönlendirme yerine doğrudan son adrese gitmelidir.",
    steps: ["Bu adrese verilen iç linkleri yönlendirmenin hedefine çevirin.", "Sitemap'te yönlendiren adres yerine son adres olsun."],
    impact: "düşük",
    effort: "kolay",
  },
  "non-indexable": {
    what: "Sayfa Google'da çıkamaz: noindex var, canonical başka adresi gösteriyor ya da hata dönüyor.",
    why: "Bilerek yapılmadıysa önemli bir sayfa aramadan tamamen düşmüş olabilir.",
    steps: ["Sayfanın aramada görünmesi gerekiyor mu kontrol edin.", "Gerekiyorsa noindex'i kaldırın ya da canonical'ı sayfanın kendisine çevirin."],
    impact: "orta",
    effort: "kolay",
  },
  "noindex-tag": {
    what: "Sayfada noindex etiketi (ya da X-Robots-Tag) var.",
    why: "Sayfa Google sonuçlarından çıkarılır.",
    steps: ["Sepet, hesap, filtre sayfalarıysa doğru — dokunmayın.", "Ürün/kategori/blog sayfasıysa SEO eklentisindeki 'arama motorlarında gösterme' ayarını kapatın."],
    impact: "orta",
    effort: "kolay",
  },
  "deep-page": {
    what: "Sayfaya ana sayfadan en az 4 tıkla ulaşılıyor.",
    why: "Derindeki sayfalar daha seyrek taranır ve daha önemsiz görülür.",
    steps: ["Önemli sayfaları menüye, kategori sayfalarına ya da ana sayfadaki 'öne çıkanlar' bloğuna ekleyin.", "Sayfalama yerine kategori içi alt kategoriler/filtre linkleri kullanın."],
    impact: "düşük",
    effort: "orta",
  },
  "missing-h2": {
    what: "Uzun içerikte hiç H2 ara başlığı yok.",
    why: "Okunması zorlaşır; AI motorları cevabı bölümlere ayırıp alıntılamakta zorlanır.",
    steps: ["İçeriği soru biçiminde H2'lerle bölün (ör. 'Abiye nasıl seçilir?').", "Her H2'nin altında ilk cümlede doğrudan cevabı verin."],
    impact: "düşük",
    effort: "kolay",
  },
  "missing-schema": {
    what: "Sayfada yapısal veri (schema / JSON-LD) yok.",
    why: "Zengin sonuç (yıldız, fiyat, SSS) çıkmaz; ChatGPT, Gemini gibi AI motorları sayfanın ne olduğunu daha zor anlar.",
    steps: ["Sayfa türüne uygun schema seçin: ana sayfa → Organization + WebSite, ürün → Product, yazı → Article, SSS → FAQPage.", "JSON-LD'yi <head> içine ekleyin (SEO eklentileri çoğunu otomatik yapar).", "Google Zengin Sonuçlar Testi ile doğrulayın."],
    example: '<script type="application/ld+json">\n{"@context":"https://schema.org","@type":"Organization","name":"Markanız","url":"https://site.com","logo":"https://site.com/logo.png"}\n</script>',
    impact: "orta",
    effort: "orta",
  },
  "missing-lang": {
    what: "<html> etiketinde dil (lang) belirtilmemiş.",
    why: "Google ve ekran okuyucular sayfanın dilini tahmin etmek zorunda kalır.",
    steps: ["<html> etiketine doğru dil kodunu ekleyin (tema ayarlarında genelde site dili)."],
    example: '<html lang="tr">',
    impact: "düşük",
    effort: "kolay",
  },
  "missing-open-graph": {
    what: "Open Graph (og:) etiketleri yok.",
    why: "Sayfa WhatsApp, Instagram, LinkedIn ve bazı AI araçlarında başlıksız/görselsiz paylaşılır.",
    steps: ["og:title, og:description ve og:image etiketlerini ekleyin (SEO eklentilerinde hazır)."],
    example: '<meta property="og:title" content="Abiye Elbise Modelleri">\n<meta property="og:image" content="https://site.com/kapak.jpg">',
    impact: "düşük",
    effort: "kolay",
  },
  "not-in-sitemap": {
    what: "İndekslenebilir sayfa XML sitemap'te yok.",
    why: "Google sayfayı daha geç keşfeder.",
    steps: ["Sayfayı sitemap'e ekleyin (SEO eklentisi otomatik üretiyorsa sayfa türünün sitemap'e dahil olduğunu kontrol edin)."],
    impact: "düşük",
    effort: "kolay",
  },
};

/* — ek kontroller — */
Object.assign(ISSUE_INFO, {
  "redirect-loop": {
    what: "Yönlendirme zinciri bir yerde başa dönüyor (A → B → A); sayfa hiç açılmıyor.",
    why: "Tarayıcı 'çok fazla yönlendirme' hatası verir; Google sayfayı hiç indeksleyemez.",
    steps: ["Yönlendirmeler sekmesinde döngüyü adım adım görün.", "Döngüdeki kurallardan birini kaldırıp son adresi sabitleyin (genelde http/https veya www kuralı çakışıyordur)."],
    impact: "yüksek",
    effort: "orta",
  },
  "redirect-temporary": {
    what: "Sayfa 302/307 (geçici) yönlendirme kullanıyor.",
    why: "Geçici yönlendirmede Google eski adresi indekste tutar ve link değerini yeni adrese tam aktarmayabilir.",
    steps: ["Taşıma kalıcıysa yönlendirmeyi 301'e çevirin.", "Gerçekten geçiciyse (kampanya, bakım) olduğu gibi bırakın."],
    example: "# Apache\nRedirect 301 /eski /yeni",
    impact: "orta",
    effort: "kolay",
  },
  "https-to-http": {
    what: "HTTPS bir adres, HTTP bir adrese yönleniyor.",
    why: "Güvenli bağlantı bozulur, tarayıcı uyarı gösterebilir ve sinyal kaybı olur.",
    steps: ["Yönlendirme hedefini https:// ile değiştirin.", "Sunucuda tüm http isteklerini https'e çeviren tek bir kural bırakın."],
    impact: "yüksek",
    effort: "kolay",
  },
  "broken-external-links": {
    what: "Sayfada başka bir siteye giden ve artık açılmayan (4xx/5xx) link var.",
    why: "Ziyaretçiyi ölü sayfaya gönderir; içeriğin güncel olmadığı izlenimini verir.",
    steps: ["Linkler sekmesinde 'Kırık dış' filtresiyle linkleri bulun.", "Güncel adresle değiştirin ya da kaldırın."],
    impact: "orta",
    effort: "kolay",
  },
  "broken-images": {
    what: "Sayfadaki bir görsel açılmıyor (4xx/5xx).",
    why: "Sayfa bozuk görünür, görsel aramada hiç çıkmaz.",
    steps: ["Görseller sekmesinde kırık görselleri bulun.", "Dosyayı tekrar yükleyin ya da img etiketini doğru adresle güncelleyin."],
    impact: "yüksek",
    effort: "kolay",
  },
  "large-images": {
    what: "Sayfada 100 KB'tan büyük görsel var.",
    why: "Büyük görseller sayfayı yavaşlatır (LCP kötüleşir), mobil veri tüketir.",
    steps: ["Görselleri WebP/AVIF formatına çevirin.", "Ekranda gösterildiği boyuta küçültün (ör. 1600 px genişlik yeter).", "Sıkıştırın (TinyPNG, Squoosh) ve lazy-load açın."],
    example: '<img src="urun.webp" width="800" height="800" loading="lazy" alt="…">',
    impact: "orta",
    effort: "kolay",
  },
  "images-no-dimensions": {
    what: "Görsellerde width/height belirtilmemiş.",
    why: "Görsel yüklenince sayfa aşağı kayar (CLS); Core Web Vitals puanı düşer.",
    steps: ["Her <img> etiketine gerçek oranını veren width ve height ekleyin.", "Duyarlı tasarımda CSS'te height:auto kullanın."],
    example: '<img src="kapak.jpg" width="1200" height="630" style="height:auto">',
    impact: "düşük",
    effort: "kolay",
  },
  "empty-anchor": {
    what: "Metni olmayan iç link var (ör. sadece ikon, alt metinsiz görsel).",
    why: "Google ve ekran okuyucular linkin nereye gittiğini anlayamaz; link sinyali zayıflar.",
    steps: ["Linke görünür metin ekleyin ya da içindeki görsele alt metni verin.", "Sadece ikonsa aria-label ekleyin."],
    example: '<a href="/sepet" aria-label="Sepetim"><svg…/></a>',
    impact: "düşük",
    effort: "kolay",
  },
  "generic-anchor": {
    what: "İç linklerde 'tıklayın', 'devamı', 'buraya' gibi anlamsız metinler kullanılıyor.",
    why: "Link metni hedef sayfanın konusunu Google'a anlatır; anlamsız metin bu fırsatı harcar.",
    steps: ["Link metnini hedef sayfanın konusuyla değiştirin (ör. 'devamı' → 'abiye beden rehberi')."],
    impact: "düşük",
    effort: "kolay",
  },
  "nofollow-internal": {
    what: "Site içi linklerde rel=\"nofollow\" kullanılmış.",
    why: "Kendi sayfalarınıza link değerini aktarmayı engeller; genelde tema/eklenti hatasıdır.",
    steps: ["İç linklerden nofollow'u kaldırın.", "Bir sayfanın indekslenmesini istemiyorsanız o sayfaya noindex verin, linke nofollow değil."],
    impact: "düşük",
    effort: "kolay",
  },
  "too-many-links": {
    what: "Sayfada 150'den fazla link var.",
    why: "Link değeri çok fazla hedefe bölünür; kullanıcı için de karmaşıktır.",
    steps: ["Mega menü ve footer'daki gereksiz linkleri azaltın.", "Uzun listeleri kategori sayfalarına bölün."],
    impact: "düşük",
    effort: "orta",
  },
  "canonical-to-non200": {
    what: "Canonical etiketi yönlenen ya da kırık bir adresi gösteriyor.",
    why: "Google canonical'ı yok sayar ya da yanlış sayfayı indeksler.",
    steps: ["Canonical'ı açılan (200) son adrese çevirin.", "Çoğu zaman sayfanın kendi adresini göstermesi doğrudur."],
    impact: "yüksek",
    effort: "kolay",
  },
  "title-equals-h1": {
    what: "Title ve H1 kelimesi kelimesine aynı.",
    why: "Hata değil ama farklı yazarsanız aynı sayfa için iki ayrı anahtar kelime varyasyonu hedefleyebilirsiniz.",
    steps: ["Title'ı arama sonucu için (anahtar kelime + marka), H1'i sayfadaki okuyucu için yazın."],
    impact: "düşük",
    effort: "kolay",
  },
  "near-duplicate": {
    what: "Bu sayfanın metni başka bir sayfayla %85'ten fazla benziyor.",
    why: "Google benzer sayfalardan birini seçip diğerlerini göstermez; sayfalar birbirinin sıralamasını yer.",
    steps: ["Benzer sayfaları (Genel bakış › kopya grupları) birlikte inceleyin.", "Gerçekten aynıysa birleştirip 301 verin ya da canonical ile tek sayfayı gösterin.", "Ayrı kalacaksa her birine özgün içerik ekleyin (renk/beden/şehir farkı, özel SSS)."],
    impact: "orta",
    effort: "orta",
  },
  "noindex-in-sitemap": {
    what: "Noindex olan sayfa sitemap'te listeleniyor.",
    why: "Google'a çelişkili sinyal verir: 'bu sayfayı tara' ama 'indeksleme'.",
    steps: ["Sayfa indekslenmeyecekse sitemap'ten çıkarın.", "İndekslenmeliyse noindex'i kaldırın."],
    impact: "orta",
    effort: "kolay",
  },
  "hreflang-invalid": {
    what: "hreflang etiketinde geçersiz bir dil/ülke kodu var.",
    why: "Google geçersiz kodu yok sayar; yanlış dildeki sayfa yanlış ülkede gösterilebilir.",
    steps: ["Kodları ISO formatında yazın: tr, en, en-GB, de-DE, x-default.", "'tr-TR' doğru, 'TR-tr' veya 'turkish' yanlış."],
    example: '<link rel="alternate" hreflang="en-GB" href="https://site.com/en/">',
    impact: "orta",
    effort: "kolay",
  },
  "hreflang-no-self": {
    what: "Sayfanın hreflang listesinde kendisi yok.",
    why: "Google her dil sürümünün kendini de listelemesini bekler.",
    steps: ["hreflang listesine sayfanın kendi dilini ve adresini ekleyin."],
    impact: "düşük",
    effort: "kolay",
  },
  "hreflang-no-return": {
    what: "Bu sayfa başka bir dil sürümünü gösteriyor ama o sayfa geri göstermiyor.",
    why: "Karşılıklı link yoksa Google hreflang eşleşmesini yok sayar.",
    steps: ["Her dil sürümünün diğer tüm sürümleri (ve kendini) listelediğinden emin olun."],
    impact: "orta",
    effort: "orta",
  },
  "no-https": {
    what: "Site HTTPS (SSL) kullanmıyor.",
    why: "Tarayıcılar 'güvenli değil' uyarısı gösterir; HTTPS bir Google sıralama sinyalidir.",
    steps: ["Hosting panelinden ücretsiz SSL (Let's Encrypt) açın.", "Tüm http adresleri https'e 301 ile yönlendirin."],
    impact: "yüksek",
    effort: "kolay",
  },
  "no-hsts": {
    what: "Sunucu HSTS (Strict-Transport-Security) başlığı göndermiyor.",
    why: "Tarayıcıya siteye her zaman HTTPS ile girmesini söyler; araya girme saldırılarını engeller.",
    steps: ["Sunucu veya CDN (Cloudflare › SSL › HSTS) ayarlarından HSTS'yi açın."],
    example: "Strict-Transport-Security: max-age=31536000; includeSubDomains",
    impact: "düşük",
    effort: "kolay",
  },
  "http-not-redirected": {
    what: "Sitenin http:// sürümü https://'e yönlenmeden açılıyor.",
    why: "Aynı site iki adreste açılır (kopya içerik) ve ziyaretçi güvensiz bağlantıda kalabilir.",
    steps: ["Sunucuda tüm http isteklerini https'e 301 ile yönlendiren kural ekleyin."],
    example: "# .htaccess\nRewriteEngine On\nRewriteCond %{HTTPS} off\nRewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]",
    impact: "yüksek",
    effort: "kolay",
  },
} satisfies Record<string, IssueInfo>);

/** Etkilenen URL için o sayfaya özgü kısa not (ör. mevcut title'ın uzunluğu). */
export function pageAdvice(code: string, row: { title: string | null; metaDescription: string | null; titleLength: number | null; metaDescriptionLength: number | null; h1Count: number; wordCount: number | null; metrics?: { imagesMissingAlt: number; imagesTotal: number; responseMs: number | null; htmlKb: number | null; depth: number | null; brokenOutlinks: string[]; redirectTarget: string | null; mixedContent: number } }): string | null {
  const m = row.metrics;
  switch (code) {
    case "title-too-long":
      return `${row.titleLength} karakter — ${(row.titleLength ?? 0) - 60} karakter kısaltın`;
    case "title-too-short":
      return `${row.titleLength} karakter: "${row.title}"`;
    case "meta-description-too-long":
      return `${row.metaDescriptionLength} karakter — ${(row.metaDescriptionLength ?? 0) - 160} karakter kısaltın`;
    case "meta-description-too-short":
      return `${row.metaDescriptionLength} karakter`;
    case "duplicate-title":
      return row.title ? `"${row.title}"` : null;
    case "multiple-h1":
      return `${row.h1Count} adet H1`;
    case "thin-content":
      return `${row.wordCount ?? 0} kelime — en az ${200 - (row.wordCount ?? 0)} kelime ekleyin`;
    case "images-missing-alt":
      return m ? `${m.imagesTotal} görselden ${m.imagesMissingAlt} tanesinde alt yok` : null;
    case "slow-response":
      return m?.responseMs != null ? `${m.responseMs} ms` : null;
    case "large-page":
      return m?.htmlKb != null ? `${m.htmlKb} KB` : null;
    case "deep-page":
      return m?.depth != null ? `${m.depth} tık derinlikte` : null;
    case "broken-outlinks":
      return m ? `${m.brokenOutlinks.length} kırık link` : null;
    case "redirect":
    case "redirect-chain":
      return m?.redirectTarget ? `→ ${m.redirectTarget.replace(/^https?:\/\/(www\.)?/, "")}` : null;
    case "mixed-content":
      return m ? `${m.mixedContent} http kaynak` : null;
    default:
      return null;
  }
}

const IMPACT_W: Record<Impact, number> = { yüksek: 3, orta: 2, düşük: 1 };
const EFFORT_W: Record<Effort, number> = { kolay: 1, orta: 1.6, zor: 2.5 };
/** Öneri sıralaması: etki × etkilenen sayfa / zorluk. */
export function priorityScore(code: string, affected: number): number {
  const info = ISSUE_INFO[code];
  if (!info) return affected * 0.5;
  return (IMPACT_W[info.impact] * Math.sqrt(affected)) / EFFORT_W[info.effort];
}

/** Semrush'ın "tematik raporları" gibi: her tema, ilgili sorunlardan arınmış sayfa yüzdesiyle puanlanır. */
export const THEMES: { key: string; label: string; codes: string[] }[] = [
  { key: "crawl", label: "Taranabilirlik", codes: ["broken", "redirect-chain", "redirect-loop", "non-indexable", "noindex-tag", "not-in-sitemap", "deep-page", "canonical-to-non200", "noindex-in-sitemap"] },
  { key: "links", label: "Linkleme", codes: ["broken-outlinks", "broken-external-links", "orphan-page", "redirect", "empty-anchor", "nofollow-internal"] },
  { key: "content", label: "İçerik & meta", codes: ["missing-title", "duplicate-title", "title-too-long", "title-too-short", "missing-meta-description", "duplicate-meta-description", "meta-description-too-long", "meta-description-too-short", "missing-h1", "multiple-h1", "thin-content", "missing-h2"] },
  { key: "perf", label: "Performans", codes: ["slow-response", "large-page", "large-images", "images-no-dimensions"] },
  { key: "tech", label: "Mobil & teknik", codes: ["missing-viewport", "missing-lang", "mixed-content", "missing-canonical", "images-missing-alt", "broken-images", "https-to-http", "no-https", "http-not-redirected"] },
  { key: "ai", label: "Yapısal veri & AI", codes: ["missing-schema", "missing-open-graph"] },
];
