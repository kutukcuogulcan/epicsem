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
};

export const ISSUE_GROUPS: { label: string; codes: string[] }[] = [
  { label: "Yanıt kodları", codes: ["broken", "redirect", "redirect-chain"] },
  { label: "Linkler & yapı", codes: ["broken-outlinks", "orphan-page", "deep-page", "not-in-sitemap"] },
  { label: "Title & meta", codes: ["missing-title", "title-too-long", "title-too-short", "duplicate-title", "missing-meta-description", "meta-description-too-long", "meta-description-too-short", "duplicate-meta-description"] },
  { label: "Başlıklar & içerik", codes: ["missing-h1", "multiple-h1", "missing-h2", "thin-content"] },
  { label: "Görseller", codes: ["images-missing-alt"] },
  { label: "İndekslenme", codes: ["non-indexable", "noindex-tag", "missing-canonical"] },
  { label: "Teknik & AI hazırlığı", codes: ["missing-schema", "missing-viewport", "missing-lang", "missing-open-graph", "mixed-content"] },
  { label: "Performans", codes: ["slow-response", "large-page"] },
];

/** Kritik (kırmızı) sayılan sorunlar. */
export const CRITICAL_ISSUES = new Set(["broken", "broken-outlinks", "missing-title", "noindex-tag", "redirect-chain", "mixed-content"]);

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
};

export const SEVERITY_LABEL: Record<Severity, string> = { error: "Hata", warning: "Uyarı", notice: "Bildirim" };

/** Her sorun için "Neden önemli?" ve "Nasıl düzeltilir?" — Ahrefs'in issue açıklamalarının karşılığı. */
export const ISSUE_INFO: Record<string, { why: string; fix: string }> = {
  broken: { why: "4xx/5xx dönen sayfalar ziyaretçiyi ve botları boşa gönderir, link değeri kaybolur, tarama bütçesi harcanır.", fix: "Sayfayı geri getirin ya da 301 ile en yakın ilgili sayfaya yönlendirin; bu adrese giden iç linkleri güncelleyin." },
  "broken-outlinks": { why: "Kırık sayfaya giden iç linkler kullanıcı deneyimini bozar ve Google'a sitenin bakımsız olduğu sinyalini verir.", fix: "Linkleri çalışan doğru adrese çevirin ya da kaldırın." },
  "redirect-chain": { why: "Art arda yönlendirmeler sayfayı yavaşlatır ve her adımda link değerinin bir kısmı kaybolabilir; botlar zinciri yarıda bırakabilir.", fix: "İlk yönlendirmeyi ve iç linkleri doğrudan son adrese yönlendirin." },
  "missing-title": { why: "Title, arama sonucunda ve AI yanıtlarında sayfanın başlığıdır; yoksa Google kendi uydurur.", fix: "Her sayfaya içeriğini anlatan, benzersiz, 50–60 karakterlik bir title ekleyin." },
  "duplicate-title": { why: "Aynı title'ı taşıyan sayfalar birbiriyle yarışır (cannibalization); Google hangisini göstereceğini seçemez.", fix: "Her sayfanın title'ını o sayfayı diğerlerinden ayıran bilgiyle benzersiz yapın." },
  "duplicate-meta-description": { why: "Tekrarlayan açıklamalar arama sonucunda sayfaları ayırt edilemez hale getirir ve tıklama oranını düşürür.", fix: "Her sayfa için içeriğine özel bir meta açıklama yazın." },
  "mixed-content": { why: "HTTPS sayfada http:// kaynak yüklemek tarayıcıda güvenlik uyarısına ve kaynağın engellenmesine yol açar.", fix: "Görsel, script ve CSS adreslerini https:// ile değiştirin." },
  "missing-meta-description": { why: "Açıklama yoksa Google sayfadan rastgele bir parça seçer; tıklama oranı düşer.", fix: "140–160 karakterlik, sayfayı özetleyen ve tıklamaya teşvik eden bir açıklama ekleyin." },
  "title-too-long": { why: "60 karakteri aşan title'lar arama sonucunda kesilir, önemli kelimeler görünmeyebilir.", fix: "Title'ı 60 karakterin altına indirin; ana anahtar kelimeyi başa alın." },
  "title-too-short": { why: "Çok kısa title'lar sayfanın konusunu yeterince anlatmaz ve sıralama fırsatı kaçırır.", fix: "Title'ı 30–60 karakter aralığına, açıklayıcı kelimelerle genişletin." },
  "meta-description-too-long": { why: "160 karakteri aşan açıklamalar arama sonucunda kesilir.", fix: "Açıklamayı 160 karakterin altında, en önemli bilgiyi başta verecek şekilde kısaltın." },
  "meta-description-too-short": { why: "Kısa açıklamalar arama sonucunda yeterince ikna edici olmaz.", fix: "Açıklamayı 70–160 karakter aralığına genişletin." },
  "missing-h1": { why: "H1, sayfanın ana konusunu hem kullanıcıya hem arama motorlarına ve AI'ya söyler.", fix: "Sayfanın konusunu anlatan tek bir H1 ekleyin." },
  "multiple-h1": { why: "Birden çok H1 sayfanın ana konusunu bulanıklaştırır.", fix: "Bir tane H1 bırakın, diğerlerini H2/H3 yapın." },
  "thin-content": { why: "200 kelimenin altındaki sayfalar genelde soruya yeterli cevap vermez; Google ve AI motorları bu sayfaları az değerli görür.", fix: "Sayfayı kullanıcının sorusunu tam cevaplayan, özgün bilgiyle zenginleştirin ya da benzer bir sayfayla birleştirin." },
  "images-missing-alt": { why: "Alt metni olmayan görseller görsel aramada görünmez ve erişilebilirliği düşürür.", fix: "Her görsele ne gösterdiğini anlatan kısa bir alt metni ekleyin (dekoratifse alt=\"\")." },
  "missing-canonical": { why: "Canonical yoksa parametreli ya da kopya adresler aynı içeriği bölüşür.", fix: "Her sayfaya kendini gösteren bir canonical etiketi ekleyin." },
  "missing-viewport": { why: "Viewport etiketi olmayan sayfalar mobilde düzgün görünmez; Google mobil-öncelikli indeksler.", fix: "<head> içine <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> ekleyin." },
  "slow-response": { why: "1,5 saniyeden yavaş yanıt veren sayfalar hem kullanıcıyı kaçırır hem tarama bütçesini tüketir.", fix: "Sunucu önbelleği, CDN ve veritabanı sorgularını iyileştirin." },
  "large-page": { why: "Büyük HTML geç yüklenir ve mobil kullanıcıyı yorar.", fix: "Satır içi script/CSS'leri dışarı alın, gereksiz HTML'i temizleyin." },
  "orphan-page": { why: "Hiçbir sayfadan link almayan sayfaları botlar zor bulur ve bu sayfalar link değeri alamaz.", fix: "Sayfayı ilgili kategori/merkez sayfalardan linkleyin ya da gereksizse sitemap'ten çıkarın." },
  redirect: { why: "Yönlendirmeler tek başına sorun değildir ama iç linkler doğrudan son adrese gitmelidir.", fix: "Bu adrese verilen iç linkleri yönlendirmenin hedefine çevirin." },
  "non-indexable": { why: "Bu sayfalar Google'da çıkmaz (noindex, canonical başka adreste ya da hata).", fix: "Bilerek değilse noindex'i kaldırın ya da canonical'ı düzeltin." },
  "noindex-tag": { why: "Noindex etiketi sayfayı arama sonuçlarından çıkarır.", fix: "Sayfanın görünmesini istiyorsanız noindex'i kaldırın." },
  "deep-page": { why: "Ana sayfadan 4+ tık uzaktaki sayfalar daha az taranır ve daha az önemli görülür.", fix: "Önemli sayfaları menü, kategori ya da ilgili içerik linkleriyle ana sayfaya yaklaştırın." },
  "missing-h2": { why: "Uzun içerikte ara başlık olmaması okunabilirliği ve AI'ın bölümleri anlamasını zorlaştırır.", fix: "İçeriği soru-cevap mantığında H2 başlıklarla bölümlere ayırın." },
  "missing-schema": { why: "Yapısal veri (schema) arama sonucunda zengin görünüm sağlar ve AI motorlarının sayfayı doğru anlamasına yardım eder.", fix: "Sayfa türüne uygun JSON-LD ekleyin: Organization, Product, Article, FAQPage, BreadcrumbList." },
  "missing-lang": { why: "Dil etiketi arama motorlarına ve ekran okuyuculara sayfanın dilini söyler.", fix: "<html lang=\"tr\"> gibi doğru dil kodunu ekleyin." },
  "missing-open-graph": { why: "Open Graph olmadan sayfa sosyal medyada ve bazı AI araçlarında başlıksız/görselsiz paylaşılır.", fix: "og:title, og:description ve og:image etiketlerini ekleyin." },
  "not-in-sitemap": { why: "Sitemap'te olmayan indekslenebilir sayfalar daha geç keşfedilir.", fix: "Sayfayı XML sitemap'e ekleyin." },
};

/** Semrush'ın "tematik raporları" gibi: her tema, ilgili sorunlardan arınmış sayfa yüzdesiyle puanlanır. */
export const THEMES: { key: string; label: string; codes: string[] }[] = [
  { key: "crawl", label: "Taranabilirlik", codes: ["broken", "redirect-chain", "non-indexable", "noindex-tag", "not-in-sitemap", "deep-page"] },
  { key: "links", label: "İç linkleme", codes: ["broken-outlinks", "orphan-page", "redirect"] },
  { key: "content", label: "İçerik & meta", codes: ["missing-title", "duplicate-title", "title-too-long", "title-too-short", "missing-meta-description", "duplicate-meta-description", "meta-description-too-long", "meta-description-too-short", "missing-h1", "multiple-h1", "thin-content", "missing-h2"] },
  { key: "perf", label: "Performans", codes: ["slow-response", "large-page"] },
  { key: "tech", label: "Mobil & teknik", codes: ["missing-viewport", "missing-lang", "mixed-content", "missing-canonical", "images-missing-alt"] },
  { key: "ai", label: "Yapısal veri & AI", codes: ["missing-schema", "missing-open-graph"] },
];
