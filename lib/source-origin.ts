/**
 * Bir istatistiğin kaynak adresi, rakamı üreten kurumun kendi sitesi mi (Pew → pewresearch.org) yoksa onu aktaran
 * bir blog mu (Pew → techatom.org)? Aktaran siteyse yazıda "X'e göre (aktaran: site)" diye dürüstçe atıf yapılır.
 */
const GENERIC = new Set(["ve", "ile", "research", "center", "centre", "institute", "report", "group", "global", "international", "association", "university", "company", "inc", "ltd", "the", "and", "of", "for", "araştırma", "merkezi", "enstitüsü", "raporu", "derneği", "üniversitesi"]);

const STOP = new Set(["ve", "ile", "and", "of", "the", "for", "et", "de", "la", "del", "und", "des", "du"]);

const fold = (s: string) =>
  s
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** shortcut: resmi kısaltması adından türemeyen kurumlar (Bilgi Teknolojileri ve İletişim Kurumu → btk) tanınmaz;
 * o durumda yazıda yalnızca fazladan "aktaran" notu çıkar, yanlış bilgi çıkmaz.
 * Kurum adının ayırt edici bir parçası (ya da baş harfleri: TÜİK → tuik, World Health Organization → who) adreste geçiyor mu. */
export function isOriginHost(origin: string, url: string): boolean {
  const host = hostOf(url).replace(/[^a-z0-9.]/g, "");
  if (!host || !origin.trim()) return true; // kurum bilinmiyorsa aktarım iddiası kurulmaz
  const words = fold(origin).split(/[^a-z0-9]+/).filter(Boolean);
  const tokens = words.filter((w) => w.length >= 3 && !GENERIC.has(w));
  // Baş harflerde bağlaçlar atlanır (Acta Orthopaedica et Traumatologica Turcica → aott); kurum kelimeleri sayılır.
  const initials = words.filter((w) => !STOP.has(w) && (!GENERIC.has(w) || words.length > 2)).map((w) => w[0]).join("");
  const label = host.split(".").slice(0, -1).join(".");
  return tokens.some((t) => label.includes(t)) || (initials.length >= 2 && label.split(".").includes(initials)) || (words.length === 1 && words[0].length >= 3 && label.includes(words[0]));
}

/** Bilgideki ayırt edici rakamlar (%28, 1.609, 32.556 — tek haneliler ve yıllar hariç). */
export function factNumbers(fact: string): string[] {
  const out = new Set<string>();
  for (const m of fact.matchAll(/(?:%\s?)?\d+(?:[.,]\d+)*(?:\s?%)?/g)) {
    const raw = m[0];
    const n = raw.replace(/[%\s]/g, "");
    const digits = n.replace(/[.,]/g, "");
    if (digits.length < 2 || (/^(19|20)\d\d$/.test(n) && !raw.includes("%"))) continue;
    out.add(n);
  }
  return [...out];
}

/** Bilginin rakamlarından en az biri kaynak sayfanın metninde geçiyor mu (rakamsız bilgi doğrulanamaz, kabul edilir).
 * "32.556" ↔ "32,556" ↔ "32556" ve "83,7" ↔ "83.7" eşdeğer sayılır. */
export function factOnPage(fact: string, pageText: string): boolean {
  const nums = factNumbers(fact);
  if (!nums.length) return true;
  const text = pageText.replace(/ /g, " ");
  return nums.some((n) => {
    const parts = n.split(/[.,]/);
    const re = new RegExp(`(?<![\\d.,])${parts.join("[.,]?")}(?![\\d]|[.,]\\d)`);
    return re.test(text);
  });
}

// Kaynak otoritesi: 2 = resmi / akademik / istatistik ve araştırma kurumu, 1 = bilinen haber kuruluşu, 0 = diğer (blog, araç sitesi).
// shortcut: elle tutulan liste; Türkiye ve büyük uluslararası kaynaklar. Eksik kalan iyi kaynak 0 sayılır ama elenmez (bkz. rankSources).
const STRONG_SUFFIX = [".gov", ".gov.tr", ".edu", ".edu.tr", ".ac.uk", ".ac.jp", ".mil", ".int", ".bel.tr", ".k12.tr", ".europa.eu"];
const STRONG = [
  "tuik.gov.tr", "tcmb.gov.tr", "oecd.org", "who.int", "worldbank.org", "imf.org", "un.org", "eurostat.ec.europa.eu",
  "pewresearch.org", "statista.com", "gartner.com", "forrester.com", "mckinsey.com", "deloitte.com", "pwc.com", "kpmg.com", "ey.com", "bcg.com", "accenture.com",
  "nielsen.com", "ipsos.com", "gallup.com", "similarweb.com", "datareportal.com", "itu.int", "ourworldindata.org", "nber.org",
  "arxiv.org", "dergipark.org.tr", "doi.org", "ncbi.nlm.nih.gov", "pubmed.ncbi.nlm.nih.gov", "sciencedirect.com", "springer.com", "link.springer.com", "nature.com", "science.org", "jstor.org", "ieee.org", "acm.org", "wiley.com", "tandfonline.com", "scholar.google.com", "researchgate.net", "ssrn.com", "hbr.org",
];
const NEWS = [
  "reuters.com", "apnews.com", "bloomberg.com", "ft.com", "wsj.com", "nytimes.com", "theguardian.com", "bbc.com", "bbc.co.uk", "economist.com", "forbes.com", "cnbc.com", "techcrunch.com", "theverge.com", "wired.com",
  "aa.com.tr", "trthaber.com", "hurriyet.com.tr", "milliyet.com.tr", "sabah.com.tr", "ntv.com.tr", "cnnturk.com", "sozcu.com.tr", "dunya.com", "bloomberght.com", "webrazzi.com", "ekonomim.com",
];
const isUnder = (h: string, d: string) => h === d || h.endsWith("." + d);

export function sourceTier(url: string): 0 | 1 | 2 {
  const h = hostOf(url);
  if (!h) return 0;
  if (STRONG_SUFFIX.some((s) => h.endsWith(s)) || STRONG.some((d) => isUnder(h, d)) || /(^|\.)(journal|journals|dergi|universite|university)\./.test(h)) return 2;
  if (NEWS.some((d) => isUnder(h, d))) return 1;
  return 0;
}

/** Güçlüden zayıfa sıralar; en az 3 güçlü/haber kaynağı varsa zayıf (0) kaynakları atar — yoksa yazı kaynaksız kalmasın diye tutar. */
export function rankSources<T extends { url: string }>(facts: T[]): T[] {
  const sorted = [...facts].sort((a, b) => sourceTier(b.url) - sourceTier(a.url));
  return sorted.filter((f) => sourceTier(f.url) > 0).length >= 3 ? sorted.filter((f) => sourceTier(f.url) > 0) : sorted;
}
