/**
 * AI'ın önerdiği alt markaları (Purina → Pro Plan, Felix…) doğrular: yalnızca şirketin kendi sitesinde
 * (sayfa metni ya da site haritası adresleri) geçenler kabul edilir. Uydurma ya da rakibe ait ad girmez.
 */

const fold = (s: string) => s.toLocaleLowerCase("tr");
const slug = (s: string) =>
  fold(s)
    .replace(/[ıİ]/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function verifyOwnBrands(candidates: string[], brandName: string, pageText: string, urls: string[], max = 10): string[] {
  const text = fold(pageText);
  const paths = urls.map((u) => {
    try {
      return new URL(u).pathname.toLowerCase();
    } catch {
      return "";
    }
  });
  const own = fold(brandName.trim());
  const out: string[] = [];
  for (const raw of candidates) {
    const name = String(raw ?? "").trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 40 || fold(name) === own) continue;
    if (out.some((x) => fold(x) === fold(name))) continue;
    const s = slug(name);
    const onPage = new RegExp(`(^|[^\\p{L}\\p{N}])${fold(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}\\p{N}]|$)`, "u").test(text);
    const inUrl = s.length >= 3 && paths.some((p) => p.split("/").some((seg) => seg === s || seg.startsWith(`${s}-`) || seg.endsWith(`-${s}`) || seg.includes(`-${s}-`)));
    if (onPage || inUrl) out.push(name);
    if (out.length >= max) break;
  }
  return out;
}
