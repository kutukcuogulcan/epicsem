/**
 * "Kayıt listesi" — markanın kaydolması gereken önemli katalog, harita ve profil siteleri.
 * Fikir: backlink-pilot (s87343472, MIT) hedef listesi; o liste yapay zekâ/SaaS dizinlerine
 * odaklı olduğu için Türkiye'deki yerel işletme, e-ticaret ve hizmet şirketlerine göre
 * yeniden seçildi. Düşük kaliteli genel link dizinleri bilerek alınmadı.
 * Formlar otomatik doldurulmaz: kullanıcı hazır metinleri kopyalayıp kendisi kaydolur.
 */

export type BizType = "local" | "ecommerce" | "service" | "saas";

export const BIZ_LABEL: Record<BizType, string> = {
  local: "Yerel işletme (mağaza, salon, restoran…)",
  ecommerce: "E-ticaret",
  service: "Hizmet / ajans / kurumsal",
  saas: "Yazılım / SaaS / uygulama",
};

export type DirGroup = "maps" | "social" | "reviews" | "knowledge" | "commerce" | "software";

export const GROUP_LABEL: Record<DirGroup, string> = {
  maps: "Harita ve yerel arama",
  social: "Sosyal profiller",
  reviews: "Yorum ve güven",
  knowledge: "Bilgi grafı (AI'ın markayı tanıması)",
  commerce: "Alışveriş",
  software: "Yazılım dizinleri",
};

export interface Directory {
  id: string;
  name: string;
  url: string;
  group: DirGroup;
  /** Hangi işletme türleri için önerilir. */
  for: BizType[];
  /** Önem: 3 = mutlaka, 2 = önerilir, 1 = isteğe bağlı. */
  priority: 1 | 2 | 3;
  /** Profilden sitene link verilebiliyor mu. */
  link: boolean;
  why: string;
}

const ALL: BizType[] = ["local", "ecommerce", "service", "saas"];

export const DIRECTORIES: Directory[] = [
  // Harita ve yerel arama
  { id: "google-business", name: "Google İşletme Profili", url: "https://business.google.com/", group: "maps", for: ["local", "service", "ecommerce"], priority: 3, link: true, why: "Google Haritalar ve yerel aramada görünmenin temeli. Gemini ve Google AI Overviews işletme bilgisini buradan alır." },
  { id: "bing-places", name: "Bing Places", url: "https://www.bingplaces.com/", group: "maps", for: ["local", "service", "ecommerce"], priority: 3, link: true, why: "Bing Haritalar; ChatGPT arama ve Copilot yerel işletme bilgisini Bing'den alır. Google profilinden içe aktarılabilir." },
  { id: "apple-business", name: "Apple Business Connect", url: "https://businessconnect.apple.com/", group: "maps", for: ["local", "service"], priority: 2, link: true, why: "Apple Haritalar ve Siri. iPhone kullanıcılarının yol tarifi ve arama sonuçları." },
  { id: "yandex-business", name: "Yandex İşletme (Haritalar)", url: "https://yandex.com.tr/sprav/", group: "maps", for: ["local", "service"], priority: 2, link: true, why: "Türkiye'de yaygın kullanılan Yandex Haritalar ve Yandex arama." },
  { id: "foursquare", name: "Foursquare", url: "https://foursquare.com/", group: "maps", for: ["local"], priority: 1, link: true, why: "Birçok uygulamanın konum verisini Foursquare'den aldığı mekan veritabanı." },

  // Sosyal profiller
  { id: "facebook", name: "Facebook Sayfası", url: "https://www.facebook.com/pages/create", group: "social", for: ALL, priority: 3, link: true, why: "Marka varlığı ve Meta reklamları için zorunlu; sayfa bilgisinde site linki." },
  { id: "instagram", name: "Instagram İşletme Hesabı", url: "https://www.instagram.com/", group: "social", for: ["local", "ecommerce", "service"], priority: 3, link: true, why: "Profil ve bağlantılar bölümündeki site linki; markanın sosyal kanıtı." },
  { id: "linkedin", name: "LinkedIn Şirket Sayfası", url: "https://www.linkedin.com/company/setup/new/", group: "social", for: ["service", "saas", "ecommerce"], priority: 2, link: true, why: "Kurumsal güven sinyali; AI asistanları şirket bilgisinde sık kullanır." },
  { id: "youtube", name: "YouTube Kanalı", url: "https://www.youtube.com/", group: "social", for: ALL, priority: 2, link: true, why: "Video aramaları ve AI cevaplarında sık alıntılanan bir kaynak; kanal açıklamasında site linki." },
  { id: "pinterest", name: "Pinterest İşletme", url: "https://business.pinterest.com/", group: "social", for: ["ecommerce"], priority: 1, link: true, why: "Moda, dekorasyon, gıda gibi görsel ürünlerde trafik getiren pinler ve site doğrulaması." },
  { id: "x", name: "X (Twitter) Profili", url: "https://x.com/", group: "social", for: ["saas", "service"], priority: 1, link: true, why: "Profil linki ve marka adının ele geçirilmemesi için." },

  // Yorum ve güven
  { id: "trustpilot", name: "Trustpilot", url: "https://business.trustpilot.com/", group: "reviews", for: ["ecommerce", "service", "saas"], priority: 2, link: true, why: "Uluslararası güven puanı; \"X güvenilir mi?\" sorularında AI'ın baktığı kaynaklardan." },
  { id: "sikayetvar", name: "Şikayetvar Kurumsal", url: "https://www.sikayetvar.com/", group: "reviews", for: ["ecommerce", "service", "local"], priority: 3, link: false, why: "Türkiye'de \"güvenilir mi\" aramalarının ilk sonucu. Marka sayfasını sahiplenip şikâyetlere cevap vermek güveni artırır." },

  // Bilgi grafı
  { id: "wikidata", name: "Wikidata", url: "https://www.wikidata.org/wiki/Special:NewItem", group: "knowledge", for: ALL, priority: 2, link: true, why: "AI motorlarının markaları tanıdığı açık bilgi grafı. Resmi site, kuruluş yılı ve sosyal hesapları ekle." },
  { id: "crunchbase", name: "Crunchbase", url: "https://www.crunchbase.com/", group: "knowledge", for: ["saas", "service"], priority: 1, link: true, why: "Şirket profili; yatırım, kurucu ve sektör bilgisi için AI'ın sık kullandığı kaynak." },

  // Alışveriş
  { id: "google-merchant", name: "Google Merchant Center", url: "https://merchants.google.com/", group: "commerce", for: ["ecommerce"], priority: 3, link: true, why: "Ücretsiz Google Alışveriş listelemeleri ve AI Mode'da ürün önerileri." },

  // Yazılım dizinleri (backlink-pilot listesinden hâlâ açık ve kaliteli olanlar)
  { id: "producthunt", name: "Product Hunt", url: "https://www.producthunt.com/", group: "software", for: ["saas"], priority: 2, link: true, why: "Lansman günü görünürlüğü ve kalıcı ürün sayfası. Hazırlık ister; elle yapılmalı." },
  { id: "alternativeto", name: "AlternativeTo", url: "https://alternativeto.net/", group: "software", for: ["saas"], priority: 2, link: true, why: "\"X alternatifi\" aramalarında üst sıralarda; AI karşılaştırma cevaplarında sık alıntılanır." },
  { id: "g2", name: "G2", url: "https://sell.g2.com/", group: "software", for: ["saas"], priority: 2, link: true, why: "B2B yazılım yorumları; AI asistanları yazılım önerirken sık kullanır." },
  { id: "capterra", name: "Capterra", url: "https://www.capterra.com/vendors/sign-up", group: "software", for: ["saas"], priority: 2, link: true, why: "Yazılım karşılaştırma ve yorum platformu (Gartner Digital Markets)." },
  { id: "saashub", name: "SaaSHub", url: "https://www.saashub.com/", group: "software", for: ["saas"], priority: 1, link: true, why: "Yazılım alternatifleri dizini; ücretsiz ürün sayfası." },
  { id: "betalist", name: "BetaList", url: "https://betalist.com/submit", group: "software", for: ["saas"], priority: 1, link: true, why: "Yeni girişimler için erken kullanıcı ve ürün sayfası." },
  { id: "sourceforge", name: "SourceForge", url: "https://sourceforge.net/software/vendors/new", group: "software", for: ["saas"], priority: 1, link: true, why: "Yazılım dizini ve karşılaştırma sayfaları." },
];

export const dirById = (id: string) => DIRECTORIES.find((d) => d.id === id);
