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
