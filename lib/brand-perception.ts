import type { GeoRunResult } from "@/types";

/**
 * Marka algısı (AI'sız): AI cevaplarında bir markanın geçtiği cümlelerden, o markayı rakiplerinden ayıran
 * ifadeleri çıkarır ("güvenilir", "uygun fiyatlı", "yavaş müşteri hizmetleri"…). Skor = markanın anıldığı
 * cevapların yüzde kaçında o ifade marka cümlesinde geçiyor. Olumsuz sözlüğe uyanlar ayrıca işaretlenir.
 */

export interface PerceptionTerm {
  term: string;
  score: number; // 0-100
  negative: boolean;
  example: string;
}
export interface BrandPerception {
  brand: string;
  mentions: number;
  terms: PerceptionTerm[];
}

const STOP = new Set(
  `ve ile için bir bu şu o da de ki mi mı mu mü gibi olan olarak daha en çok çok az ise ya veya ama fakat ancak her hem kadar sonra önce ayrıca özellikle genellikle bazı tüm diğer kendi sizin bizim onun bunun şunun bu nedenle yani yer alan sunan sunar sağlar sağlayan bulunan bulunur olabilir olur olduğu olduğunu olan oluyor var yok çeşitli farklı yeni öne çıkan çıkanlar arasında arasındadır seçenek seçenekler seçenektir alternatif alternatifler firma firmalar firması şirket şirketler şirketi ajans ajanslar ajansı marka markalar markası listede liste önerilir önerebilirim bulunuyor yer alıyor the a an and or of for to in on with is are be as by at from that this it its their they you your our can also more most`.split(
    /\s+/
  )
);
// Olumsuz sözlük. "-sız/-siz" ile olumluya dönenler (eksiksiz, sorunsuz, hatasız) eşleşmez; "yüksek" yalnızca fiyatla birlikte olumsuz.
const NEG = /(?<![\p{L}])(pahalı\p{L}*|şikayet\p{L}*|şikâyet\p{L}*|yavaş\p{L}*|(?:sorun|problem|eksik|hata|kesinti)(?![\p{L}]*s[ıiuü]z)\p{L}*|olumsuz\p{L}*|kötü\p{L}*|zayıf\p{L}*|karmaşık\p{L}*|gizli|güvensiz\p{L}*|riskli|expensive|slow|complaints?|poor|bad|issues?|lacks?|limited)(?![\p{L}])/iu;
const PRICE_HIGH = /(fiyat\p{L}*|ücret\p{L}*|maliyet\p{L}*)\s+(\p{L}+\s+)?yüksek|yüksek\s+(fiyat|ücret|maliyet)/iu;
// "sindirim sorunu OLAN kediler İÇİN", "tüy dökülmesi sorununa KARŞI" → ürünün çözdüğü sorun; markaya yönelik eleştiri değil.
const SOLVES = /^\p{L}*\s*(?:\p{L}+\s+){0,2}(olan|olanlar|yaşayan|yaşayanlar|çeken|için|karşı|çözüm|giderir|gidermek|azaltır|azaltmak|önler|önlemek|destekler|desteklemek|yardımcı|iyi gelir|formül|uygun|hassas)/iu;

/** İfade, geçtiği marka cümlelerinin çoğunda markayı eleştiriyor mu (ürünün çözdüğü bir sorunu anlatmıyor mu). */
export function isNegativeUse(term: string, sentences: string[]): boolean {
  if (PRICE_HIGH.test(term)) return true;
  if (!NEG.test(term)) return false;
  const uses = sentences.filter((s) => fold(s).includes(term));
  if (!uses.length) return true;
  const solving = uses.filter((s) => {
    const low = fold(s);
    const after = low.slice(low.indexOf(term) + term.length);
    return SOLVES.test(after.trimStart());
  }).length;
  return solving * 2 < uses.length; // çoğunluk çözüm bağlamındaysa olumsuz sayılmaz
}

const fold = (s: string) => s.toLocaleLowerCase("tr");
const sentences = (t: string) =>
  t
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/[*_#>`|]/g, " ")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);

function grams(s: string, drop: Set<string>): string[] {
  const w = fold(s)
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((x) => x.length > 2 && !STOP.has(x) && !drop.has(x) && !/^\d+$/.test(x));
  const out = new Set<string>();
  for (let i = 0; i < w.length; i++) {
    out.add(w[i]);
    if (i + 1 < w.length) out.add(`${w[i]} ${w[i + 1]}`);
  }
  return [...out];
}

export function buildPerception(runs: GeoRunResult[], brands: { name: string }[]): BrandPerception[] {
  const nameTokens = new Set(brands.flatMap((b) => fold(b.name).split(/\s+/)));
  const per = brands.map((b) => {
    const nm = fold(b.name);
    const docs: { grams: string[]; sent: string[] }[] = [];
    for (const r of runs) {
      const ss = sentences(r.responseText).filter((s) => fold(s).includes(nm));
      if (!ss.length) continue;
      docs.push({ grams: [...new Set(ss.flatMap((s) => grams(s, nameTokens)))], sent: ss });
    }
    const df = new Map<string, number>();
    for (const d of docs) for (const g of d.grams) df.set(g, (df.get(g) ?? 0) + 1);
    return { brand: b.name, docs, df };
  });
  // Ayırt edicilik: bu markada sık, diğer markalarda seyrek olan ifadeler
  return per.map((p) => {
    const n = p.docs.length || 1;
    const others = per.filter((o) => o !== p);
    const terms = [...p.df.entries()]
      .filter(([, c]) => c >= Math.max(2, Math.ceil(n * 0.15)))
      .map(([term, c]) => {
        const share = c / n;
        const otherShare = others.length ? Math.max(...others.map((o) => (o.df.get(term) ?? 0) / (o.docs.length || 1))) : 0;
        return { term, share, lift: share - otherShare };
      })
      .filter((t) => t.lift >= 0.15)
      .sort((a, b) => b.lift - a.lift || b.term.split(" ").length - a.term.split(" ").length)
      // tek kelimeyi, onu içeren güçlü iki kelimelik ifade varsa ele
      .filter((t, _, arr) => t.term.includes(" ") || !arr.some((x) => x.term.includes(" ") && x.term.split(" ").includes(t.term) && x.share >= t.share * 0.8))
      .slice(0, 12)
      .map((t) => ({
        term: t.term,
        score: Math.round(t.share * 100),
        negative: isNegativeUse(t.term, p.docs.flatMap((d) => d.sent)),
        example: p.docs.flatMap((d) => d.sent).find((s) => fold(s).includes(t.term))?.slice(0, 220) ?? "",
      }));
    // Olumsuz ifadeleri ayırt edici olmasalar da göster
    const negs = [...p.df.entries()]
      .filter(([term]) => term.includes(" ") && isNegativeUse(term, p.docs.flatMap((d) => d.sent)) && !terms.some((t) => t.term === term || t.term.includes(term)))
      .slice(0, 4)
      .map(([term, c]) => ({ term, score: Math.round((c / n) * 100), negative: true, example: p.docs.flatMap((d) => d.sent).find((s) => fold(s).includes(term))?.slice(0, 220) ?? "" }));
    return { brand: p.brand, mentions: p.docs.length, terms: [...terms, ...negs] };
  });
}
