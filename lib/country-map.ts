/**
 * Kart: LLM'siz otomatik doldurma — Step 1'in "Ülke" alanını tahmin etmek için kullanılan tek
 * statik tablo. ccTLD'ler (örn. ".tr") ve hreflang bölge kodları (örn. "tr-TR"'deki "tr")
 * AYNI ISO 3166-1 alpha-2 kodlarını paylaştığı için tek bir map hem domain uzantısından hem
 * hreflang'tan ülke adı çıkarmaya yetiyor — iki ayrı tablo tutmaya gerek yok.
 *
 * Kasıtlı olarak küçük/dar bir liste: Epicsem'in gerçek müşteri tabanının (Türkiye merkezli
 * dijital pazarlama/e-ticaret ajansları ve onların müşterileri) hedefleyebileceği yaygın
 * pazarlarla sınırlı. Eşleşmeyen bir TLD/bölge kodu (ör. jenerik ".com", ".io", ".co") burada
 * YOKTUR — bu kasıtlı: yanlış/düşük güvenli bir ülke tahmini üretmek yerine, çağıran taraf
 * (app/api/onboarding/prefill/route.ts) eşleşme bulamazsa alanı dokunmadan bırakır, kullanıcı
 * kendi girer.
 */
export const COUNTRY_BY_CODE: Record<string, string> = {
  tr: "Türkiye",
  de: "Almanya",
  fr: "Fransa",
  gb: "Birleşik Krallık",
  uk: "Birleşik Krallık",
  us: "Amerika Birleşik Devletleri",
  nl: "Hollanda",
  be: "Belçika",
  it: "İtalya",
  es: "İspanya",
  pt: "Portekiz",
  gr: "Yunanistan",
  ru: "Rusya",
  ua: "Ukrayna",
  pl: "Polonya",
  ro: "Romanya",
  bg: "Bulgaristan",
  at: "Avusturya",
  ch: "İsviçre",
  se: "İsveç",
  no: "Norveç",
  dk: "Danimarka",
  fi: "Finlandiya",
  ie: "İrlanda",
  cz: "Çekya",
  hu: "Macaristan",
  az: "Azerbaycan",
  ae: "Birleşik Arap Emirlikleri",
  sa: "Suudi Arabistan",
  qa: "Katar",
  kw: "Kuveyt",
  eg: "Mısır",
  il: "İsrail",
  ir: "İran",
  iq: "Irak",
  cn: "Çin",
  jp: "Japonya",
  kr: "Güney Kore",
  in: "Hindistan",
  au: "Avustralya",
  nz: "Yeni Zelanda",
  ca: "Kanada",
  br: "Brezilya",
  mx: "Meksika",
};

/** TLD'nin son parçasını (örn. "pnc.com.tr" → "tr", "example.co.uk" → "uk") ülke adına
 * çevirir — eşleşme yoksa null, asla tahmini bir ülke uydurmaz. */
export function countryFromTld(domain: string): string | null {
  const parts = domain.toLowerCase().split(".");
  const tld = parts[parts.length - 1];
  return COUNTRY_BY_CODE[tld] ?? null;
}

/** hreflang'tan çıkarılan bölge kodlarından (bkz. lib/content-fetch.ts'in
 * fetchPagePrefillMeta'sı) ilk tanınan ülkeyi döner — eşleşme yoksa null. */
export function countryFromRegions(regions: string[]): string | null {
  for (const r of regions) {
    const hit = COUNTRY_BY_CODE[r.toLowerCase()];
    if (hit) return hit;
  }
  return null;
}

/**
 * Kart: Marka profilini doğrula — "Hedef pazarlar: harita ve ülke seçici". Peec'in referans
 * ekranındaki dünya haritasını çizebilmek için her ülkenin world-atlas'ın (npm, Natural Earth
 * verisi — components/WorldMapPicker.tsx'in çizdiği gerçek topojson) countries-110m.json'daki
 * GERÇEK ISO 3166-1 numeric kimliğine ihtiyaç var (o dosyadaki her geometry'nin "id" alanı bu
 * kod, isim değil). Bu yüzden COUNTRY_BY_CODE'un (TLD/hreflang eşleştirmesi için ayrı tutulan,
 * "uk"/"gb" gibi kasıtlı takma adları olan) üstüne tekilleştirilmiş, haritada seçilebilir
 * ülkelerin sabit listesi — kodlar python3 ile world-atlas'ın kendi JSON'ından doğrulandı,
 * uydurma değil.
 */
export interface TargetMarketCountry {
  code: string; // ISO 3166-1 alpha-2, küçük harf — COUNTRY_BY_CODE ile aynı anahtar seti
  nameTr: string;
  isoNumericId: string; // world-atlas countries-*.json'daki geometry.id ile birebir eşleşir
}

export const TARGET_MARKET_COUNTRIES: TargetMarketCountry[] = [
  { code: "tr", nameTr: "Türkiye", isoNumericId: "792" },
  { code: "de", nameTr: "Almanya", isoNumericId: "276" },
  { code: "fr", nameTr: "Fransa", isoNumericId: "250" },
  { code: "gb", nameTr: "Birleşik Krallık", isoNumericId: "826" },
  { code: "us", nameTr: "Amerika Birleşik Devletleri", isoNumericId: "840" },
  { code: "nl", nameTr: "Hollanda", isoNumericId: "528" },
  { code: "be", nameTr: "Belçika", isoNumericId: "056" },
  { code: "it", nameTr: "İtalya", isoNumericId: "380" },
  { code: "es", nameTr: "İspanya", isoNumericId: "724" },
  { code: "pt", nameTr: "Portekiz", isoNumericId: "620" },
  { code: "gr", nameTr: "Yunanistan", isoNumericId: "300" },
  { code: "ru", nameTr: "Rusya", isoNumericId: "643" },
  { code: "ua", nameTr: "Ukrayna", isoNumericId: "804" },
  { code: "pl", nameTr: "Polonya", isoNumericId: "616" },
  { code: "ro", nameTr: "Romanya", isoNumericId: "642" },
  { code: "bg", nameTr: "Bulgaristan", isoNumericId: "100" },
  { code: "at", nameTr: "Avusturya", isoNumericId: "040" },
  { code: "ch", nameTr: "İsviçre", isoNumericId: "756" },
  { code: "se", nameTr: "İsveç", isoNumericId: "752" },
  { code: "no", nameTr: "Norveç", isoNumericId: "578" },
  { code: "dk", nameTr: "Danimarka", isoNumericId: "208" },
  { code: "fi", nameTr: "Finlandiya", isoNumericId: "246" },
  { code: "ie", nameTr: "İrlanda", isoNumericId: "372" },
  { code: "cz", nameTr: "Çekya", isoNumericId: "203" },
  { code: "hu", nameTr: "Macaristan", isoNumericId: "348" },
  { code: "az", nameTr: "Azerbaycan", isoNumericId: "031" },
  { code: "ae", nameTr: "Birleşik Arap Emirlikleri", isoNumericId: "784" },
  { code: "sa", nameTr: "Suudi Arabistan", isoNumericId: "682" },
  { code: "qa", nameTr: "Katar", isoNumericId: "634" },
  { code: "kw", nameTr: "Kuveyt", isoNumericId: "414" },
  { code: "eg", nameTr: "Mısır", isoNumericId: "818" },
  { code: "il", nameTr: "İsrail", isoNumericId: "376" },
  { code: "ir", nameTr: "İran", isoNumericId: "364" },
  { code: "iq", nameTr: "Irak", isoNumericId: "368" },
  { code: "cn", nameTr: "Çin", isoNumericId: "156" },
  { code: "jp", nameTr: "Japonya", isoNumericId: "392" },
  { code: "kr", nameTr: "Güney Kore", isoNumericId: "410" },
  { code: "in", nameTr: "Hindistan", isoNumericId: "356" },
  { code: "au", nameTr: "Avustralya", isoNumericId: "036" },
  { code: "nz", nameTr: "Yeni Zelanda", isoNumericId: "554" },
  { code: "ca", nameTr: "Kanada", isoNumericId: "124" },
  { code: "br", nameTr: "Brezilya", isoNumericId: "076" },
  { code: "mx", nameTr: "Meksika", isoNumericId: "484" },
];

export function countryNameFromCode(code: string): string | null {
  return TARGET_MARKET_COUNTRIES.find((c) => c.code === code.toLowerCase())?.nameTr ?? null;
}

/** Serbest metin bir ülke adını (eski targetMarket alanından/LLM'den gelen "Türkiye" gibi bir
 * değeri) en yakın koda çevirir — tam eşleşme yoksa null, asla tahmin uydurmaz. */
export function countryCodeFromName(name: string): string | null {
  const normalized = name.trim().toLowerCase();
  return TARGET_MARKET_COUNTRIES.find((c) => c.nameTr.toLowerCase() === normalized)?.code ?? null;
}
