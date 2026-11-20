/**
 * Yazıdaki linkleri yayından önce doğrular. AI kaynak adresini bazen bozuk yazıyor
 * (ör. TÜİK "…-Kullanim-…" yerine "…-Kullanalim-…"); bazı siteler bozuk adreste de 200 döndüğü
 * için yalnızca açılıp açılmadığına bakmak yetmez. Bu yüzden:
 *  1. Araştırmanın (Google) getirdiği gerçek adresle birebir eşleşen link → kalır.
 *  2. Aynı siteden ama farklı yazılmış link → o sitenin gerçek adresiyle değiştirilir.
 *  3. Bilinmeyen link → açılır; 404/410 ya da alan adı yoksa link kaldırılır, metin kalır.
 * Sonunda dış kaynaklar "## Kaynaklar" listesi olarak eklenir.
 */

export interface LinkPlan {
  url: string;
  action: "keep" | "replace" | "probe";
  to?: string;
}

const LINK = /(?<!!)\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g;
const norm = (u: string) => u.trim().replace(/#.*$/, "").replace(/\/+$/, "").replace(/^http:/, "https:").replace(/\/\/www\./, "//").toLowerCase();
const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};
const commonPrefix = (a: string, b: string) => {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return i;
};

/** Ağsız karar: hangi link kalır, hangisi gerçek adresle değişir, hangisi açılıp kontrol edilir. */
export function planLinks(md: string, known: string[]): LinkPlan[] {
  const knownSet = new Set(known.map(norm));
  const urls = [...new Set([...md.matchAll(LINK)].map((m) => m[2]))];
  return urls.map((url) => {
    if (knownSet.has(norm(url))) return { url, action: "keep" };
    const h = hostOf(url);
    const same = known.filter((k) => hostOf(k) === h);
    if (h && same.length) {
      const to = same.sort((a, b) => commonPrefix(norm(b), norm(url)) - commonPrefix(norm(a), norm(url)))[0];
      return { url, action: "replace", to };
    }
    return { url, action: "probe" };
  });
}

/** Linki kaldırır, görünen metni bırakır: "([TÜİK](url))" → "(TÜİK)". */
export function unlink(md: string, url: string): string {
  return md.replace(LINK, (all, text, u) => (u === url ? text : all));
}

export function relink(md: string, from: string, to: string): string {
  return md.replace(LINK, (all, text, u) => (u === from ? `[${text}](${to})` : all));
}

const GENERIC = /^(kaynak|source|link|burada|here|tıkla|bkz\.?)$/i;

/** Dış kaynak listesi (kendi sitesi hariç); yazıda zaten "Kaynaklar" başlığı varsa eklenmez. */
export function appendSources(md: string, ownHost: string, language = "tr", labels: Record<string, string> = {}): string {
  if (/^##\s+(Kaynaklar|Sources)\s*$/im.test(md)) return md;
  const own = ownHost.toLowerCase().replace(/^www\./, "");
  const seen = new Map<string, string>();
  for (const m of md.matchAll(LINK)) {
    const h = hostOf(m[2]);
    if (!h || (own && (h === own || h.endsWith("." + own))) || /youtube\.com|youtu\.be/.test(h)) continue;
    const label = labels[m[2]] || (GENERIC.test(m[1].trim()) ? h : m[1].trim());
    if (!seen.has(norm(m[2]))) seen.set(norm(m[2]), `- [${label}](${m[2]})`);
  }
  if (!seen.size) return md;
  return `${md.trimEnd()}\n\n## ${language === "tr" ? "Kaynaklar" : "Sources"}\n\n${[...seen.values()].join("\n")}\n`;
}
