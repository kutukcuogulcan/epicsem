/**
 * Bir istatistiğin kaynak adresi, rakamı üreten kurumun kendi sitesi mi (Pew → pewresearch.org) yoksa onu aktaran
 * bir blog mu (Pew → techatom.org)? Aktaran siteyse yazıda "X'e göre (aktaran: site)" diye dürüstçe atıf yapılır.
 */
const GENERIC = new Set(["ve", "ile", "research", "center", "centre", "institute", "report", "group", "global", "international", "association", "university", "company", "inc", "ltd", "the", "and", "of", "for", "araştırma", "merkezi", "enstitüsü", "raporu", "derneği", "üniversitesi"]);

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
  const initials = words.filter((w) => !GENERIC.has(w) || words.length > 2).map((w) => w[0]).join("");
  const label = host.split(".").slice(0, -1).join(".");
  return tokens.some((t) => label.includes(t)) || (initials.length >= 2 && label.split(".").includes(initials)) || (words.length === 1 && label.includes(words[0]));
}
