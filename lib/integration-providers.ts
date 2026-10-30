/**
 * Dış servis entegrasyonları — tanımlar (istemci + sunucu ortak; gizli değer içermez).
 * Her kullanıcı kendi hesabının bilgilerini /integrations sayfasında girer.
 * Hiçbiri zorunlu değil: bağlı değilse araçlar Epicsem'in ücretsiz yerleşik yöntemini kullanır.
 */

export type ProviderId = "serpapi" | "serpbear" | "ogimg" | "google_ads" | "google_psi" | "bing" | "indexnow" | "ahrefs";

export interface ProviderField {
  key: string;
  label: string;
  secret?: boolean;
  optional?: boolean;
  placeholder?: string;
  help?: string;
}

export interface ProviderDef {
  id: ProviderId;
  name: string;
  tagline: string;
  /** Ücret durumu — kartta rozet olarak görünür. */
  price: string;
  usedIn: string[];
  docsUrl: string;
  signupUrl: string;
  fields: ProviderField[];
  steps: string[];
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: "serpapi",
    name: "SerpApi",
    tagline: "Google arama sonuçları: ilk sayfa rakip analizi ve günlük sıralama kontrolü.",
    price: "Ücretsiz plan var",
    usedIn: ["Anahtar Kelime → Google analizi", "Sıralama Takibi"],
    docsUrl: "https://serpapi.com/search-api",
    signupUrl: "https://serpapi.com/users/sign_up",
    fields: [{ key: "apiKey", label: "API anahtarı", secret: true, placeholder: "serpapi.com → Dashboard → Your Private API Key" }],
    steps: ["serpapi.com'da ücretsiz hesap aç.", "Dashboard'daki 'Your Private API Key' değerini kopyala.", "Aşağıya yapıştır ve 'Bağlantıyı test et'e bas."],
  },
  {
    id: "serpbear",
    name: "SerpBear",
    tagline: "Açık kaynak sıralama takibi. Kendi SerpBear sunucundaki kelimeleri ve geçmişini Sıralama Takibi'ne aktarır.",
    price: "Ücretsiz · kendi sunucun",
    usedIn: ["Sıralama Takibi → SerpBear'dan aktar / yenile"],
    docsUrl: "https://docs.serpbear.com/miscellaneous/api-documentation",
    signupUrl: "https://docs.serpbear.com/",
    fields: [
      { key: "baseUrl", label: "SerpBear adresi", placeholder: "https://serpbear.siten.com" },
      { key: "apiKey", label: "API anahtarı", secret: true, placeholder: "SerpBear .env dosyasındaki APIKEY", help: "SerpBear kurulumunda .env dosyasına kendin yazdığın APIKEY değeri." },
    ],
    steps: [
      "SerpBear'ı kendi sunucuna kur (Docker, Render, Coolify…).",
      ".env dosyasında APIKEY değerini belirle; SerpBear içinde bir sıralama kaynağı (scraper) seç.",
      "Adresi ve APIKEY'i aşağıya gir.",
    ],
  },
  {
    id: "ogimg",
    name: "ogimg",
    tagline: "Hazır şablonlu paylaşım (Open Graph) görselleri. Bağlıysa Site Taraması'ndaki og:image düzeltmesinde şablon olarak seçilebilir.",
    price: "Ücretsiz: ayda 50 görsel (filigranlı)",
    usedIn: ["Site Taraması → Paylaşım görseli"],
    docsUrl: "https://ogimg.xyz/docs",
    signupUrl: "https://ogimg.xyz/",
    fields: [
      { key: "apiKey", label: "API anahtarı", secret: true, optional: true, placeholder: "Boş bırakırsan ücretsiz planla (filigranlı) çalışır" },
      { key: "template", label: "Şablon", optional: true, placeholder: "gradient", help: "basic, blog, gradient, minimal (ücretsiz) · dark, split, sunset, ocean, corporate, retro (ücretli)" },
      { key: "accentColor", label: "Vurgu rengi", optional: true, placeholder: "#6d28d9" },
    ],
    steps: ["Anahtarsız da çalışır (ayda 50 görsel, filigranlı).", "Filigransız için ogimg.xyz'de plan al ve API anahtarını gir."],
  },
  {
    id: "google_ads",
    name: "Google Keyword Planner",
    tagline: "Google Ads API ile gerçek aylık arama hacmi, rekabet ve tıklama başı maliyet. Anahtar Kelime Bulucu'ya hacim sütunu ekler.",
    price: "Ücretsiz · Google onayı gerekir",
    usedIn: ["Anahtar Kelime → arama hacmi"],
    docsUrl: "https://developers.google.com/google-ads/api/docs/keyword-planning/generate-keyword-ideas",
    signupUrl: "https://developers.google.com/google-ads/api/docs/get-started/dev-token",
    fields: [
      { key: "developerToken", label: "Developer token", secret: true, placeholder: "Google Ads → Araçlar → API Merkezi" },
      { key: "clientId", label: "OAuth Client ID", placeholder: "xxxx.apps.googleusercontent.com" },
      { key: "clientSecret", label: "OAuth Client Secret", secret: true },
      { key: "refreshToken", label: "Refresh token", secret: true, help: "OAuth Playground ile 'https://www.googleapis.com/auth/adwords' kapsamıyla alınır." },
      { key: "customerId", label: "Müşteri kimliği (Customer ID)", placeholder: "123-456-7890" },
      { key: "loginCustomerId", label: "Yönetici hesap kimliği (MCC)", optional: true, placeholder: "Yönetici hesap üzerinden erişiyorsan" },
    ],
    steps: [
      "Bir Google Ads yönetici (MCC) hesabı aç, API Merkezi'nden developer token iste (Basic erişim onayı birkaç gün sürebilir).",
      "Google Cloud'da OAuth istemcisi (Web/Desktop) oluştur, Google Ads API'yi etkinleştir.",
      "OAuth Playground'da kendi istemcinle adwords kapsamına izin verip refresh token al.",
      "Bilgileri aşağıya gir.",
    ],
  },
  {
    id: "google_psi",
    name: "PageSpeed Insights",
    tagline: "Google'ın gerçek kullanıcı hız verisi (Chrome UX Report): LCP, INP, CLS. Site Taraması'nda 'Gerçek kullanıcı hızı' kartı.",
    price: "Ücretsiz",
    usedIn: ["Site Taraması → Gerçek kullanıcı hızı"],
    docsUrl: "https://developers.google.com/speed/docs/insights/v5/get-started",
    signupUrl: "https://developers.google.com/speed/docs/insights/v5/get-started#APIKey",
    fields: [{ key: "apiKey", label: "Google API anahtarı", secret: true, optional: true, placeholder: "Boş bırakırsan paylaşımlı kota kullanılır", help: "Anahtarsız da çalışır ama yoğunlukta kota dolabilir. Ücretsiz anahtar: Google Cloud → PageSpeed Insights API." }],
    steps: ["Anahtarsız da çalışır.", "Kendi kotan için Google Cloud'da PageSpeed Insights API'yi etkinleştirip ücretsiz bir API anahtarı oluştur."],
  },
  {
    id: "bing",
    name: "Bing Webmaster Tools",
    tagline: "Bing'deki tıklama, gösterim ve sorgular. ChatGPT arama ve Copilot Bing indeksini kullandığı için GEO için önemli.",
    price: "Ücretsiz",
    usedIn: ["Bing Webmaster sayfası", "URL gönderme"],
    docsUrl: "https://learn.microsoft.com/en-us/bingwebmaster/getting-started",
    signupUrl: "https://www.bing.com/webmasters",
    fields: [{ key: "apiKey", label: "API anahtarı", secret: true, placeholder: "Bing Webmaster → Ayarlar → API Erişimi" }],
    steps: ["bing.com/webmasters'a gir, siteni ekle ve doğrula (Google Search Console'dan içe aktarmak en hızlısı).", "Ayarlar (dişli) → API Erişimi → API anahtarı oluştur.", "Anahtarı aşağıya yapıştır."],
  },
  {
    id: "indexnow",
    name: "IndexNow",
    tagline: "Yeni ya da güncellenen sayfaları Bing, Yandex, Seznam, Naver'a anında bildirir. ChatGPT aramada daha hızlı görünmenin en kolay yolu.",
    price: "Ücretsiz · hesap yok",
    usedIn: ["Site Taraması → Arama motorlarına bildir", "WordPress'te otomatik (Epicsem Connector 1.2+)"],
    docsUrl: "https://www.indexnow.org/documentation",
    signupUrl: "https://www.indexnow.org/",
    fields: [
      { key: "siteUrl", label: "Site adresi", placeholder: "https://siten.com", help: "WordPress + Epicsem Connector 1.2 kullanıyorsan gerek yok; eklenti kendi anahtarını yönetir ve yayınlanan her yazıyı otomatik bildirir." },
      { key: "key", label: "IndexNow anahtarı", optional: true, placeholder: "Boş bırak, otomatik üretilsin" },
    ],
    steps: [
      "Site adresini gir; anahtar otomatik üretilir.",
      "Sitenin kök dizinine <anahtar>.txt adlı, içinde sadece anahtarın yazdığı bir dosya koy (örn. https://siten.com/<anahtar>.txt).",
      "'Kaydet ve test et' dosyayı doğrular.",
    ],
  },
  {
    id: "ahrefs",
    name: "Ahrefs",
    tagline: "Backlink verisi: sitene link veren alan adları, Domain Rating (DR), yeni/kaybedilen linkler ve rakiplerin link aldığı ama senin almadığın siteler.",
    price: "DR ücretsiz · backlink listesi ücretli plan",
    usedIn: ["Backlink sayfası"],
    docsUrl: "https://docs.ahrefs.com/docs/api/reference/introduction",
    signupUrl: "https://app.ahrefs.com/account/api-keys",
    fields: [{ key: "apiKey", label: "API anahtarı", secret: true, placeholder: "Ahrefs → Account settings → API keys" }],
    steps: [
      "Ahrefs hesabına gir (ücretsiz hesap da olur) → Account settings → API keys → yeni anahtar oluştur.",
      "Ücretsiz anahtarla alan adlarının Domain Rating (DR) puanı gelir.",
      "Backlink listesi ve rakip karşılaştırması için Ahrefs Lite veya üstü plan gerekir (API birimi harcar; sonuçlar 24 saat önbelleğe alınır).",
    ],
  },
];

export const providerById = (id: string) => PROVIDERS.find((p) => p.id === id);
