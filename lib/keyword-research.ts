/**
 * Anahtar Kelime Bulucu — Google otomatik tamamlama önerilerinden uzun kuyruklu kelime ve soru
 * keşfi (Serp Miner / Ahrefs Keyword Generator mantığı). AI ve ücretli API KULLANMAZ.
 *
 * Yöntem: tohum kelime + soru kalıpları + ticari/karşılaştırma ekleri + a–z harf genişletmesi
 * ("alfabe çorbası") ile Google'ın öneri uç noktası sorgulanır, sonuçlar tekilleştirilip
 * niyet gruplarına ayrılır. Arama hacmi yoktur (Google Keyword Planner onayı gerektirir);
 * bunun yerine "kaç farklı sorguda önerildi" sinyali (öneri sıklığı) gösterilir.
 */

const UA = "Mozilla/5.0 (compatible; EpicsemKeywords/1.0; +https://epicsem-web.onrender.com)";

export async function autocomplete(q: string, lang = "tr", country = "TR"): Promise<string[]> {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&ie=utf-8&oe=utf-8&hl=${encodeURIComponent(lang)}&gl=${encodeURIComponent(country)}&q=${encodeURIComponent(q)}`;
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 5000);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { "User-Agent": UA, "Accept-Language": `${lang},en;q=0.5` } });
    if (!r.ok) return [];
    const j = JSON.parse(await r.text());
    return Array.isArray(j?.[1]) ? j[1].map(String) : [];
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

export type KeywordIntent = "question" | "commercial" | "comparison" | "local" | "informational";

export const INTENT_LABEL: Record<KeywordIntent, string> = {
  question: "Sorular",
  commercial: "Ticari / satın alma",
  comparison: "Karşılaştırma",
  local: "Yerel",
  informational: "Diğer uzun kuyruk",
};

export interface KeywordIdea {
  keyword: string;
  intent: KeywordIntent;
  /** Kaç farklı genişletme sorgusunda önerildiği — popülerlik için kaba sinyal. */
  hits: number;
  words: number;
  /** Kelimenin ait olduğu küme (ortak ilk anlamlı kelime). */
  cluster: string;
  /** Google Keyword Planner bağlıysa: aylık ortalama arama hacmi ve rekabet. */
  volume?: number | null;
  competition?: "LOW" | "MEDIUM" | "HIGH" | null;
  cpcHigh?: number | null;
  /** Fikir nereden geldi: öneri (autocomplete) ya da Keyword Planner. */
  source?: "suggest" | "planner";
}

const PATTERNS: Record<string, { questions: string[]; commercial: string[]; comparison: string[]; local: string[]; alphabet: string }> = {
  tr: {
    questions: ["nasıl", "nedir", "neden", "ne zaman", "hangi", "kaç", "nerede", "ne kadar", "mı"],
    commercial: ["fiyat", "en iyi", "ucuz", "satın al", "indirim", "yorum", "kampanya", "önerisi"],
    comparison: ["vs", "mı yoksa", "farkı", "alternatif", "karşılaştırma"],
    local: ["yakınımda", "istanbul", "ankara", "izmir"],
    alphabet: "abcçdefghıijklmnoöprsştuüvyz",
  },
  en: {
    questions: ["how", "what", "why", "when", "which", "where", "can", "is"],
    commercial: ["price", "best", "cheap", "buy", "discount", "review", "deals"],
    comparison: ["vs", "or", "alternative", "compared to"],
    local: ["near me"],
    alphabet: "abcdefghijklmnopqrstuvwxyz",
  },
};

// \b yalnızca İngilizce harfleri tanır ("fiyatları"nın sonundaki "ı"da kelime sınırı bulamaz); Türkçe için harf-duyarlı sınır.
const W = (alts: string, extra = "") => new RegExp(`${extra}(?<![\\p{L}\\p{N}])(?:${alts})(?![\\p{L}\\p{N}])`, "iu");
const Q_RE = new RegExp(`^(?:nasıl|nedir|neden|niçin|ne|ne zaman|hangi|kaç|nerede|ne kadar|kim|how|what|why|when|which|where|who|can|is|are|does|do)(?![\\p{L}\\p{N}])|(?<![\\p{L}\\p{N}])(?:nedir|nasıl|neden|mı|mi|mu|mü|mıdır|midir|ne kadar|hangisi)(?![\\p{L}\\p{N}])|\\?$`, "iu");
const COM_RE = W("fiyat|fiyatı|fiyatları|en iyi|ucuz|uygun|ücretsiz|bedava|satın al|satın|indir|indirim|kampanya|paket|paketleri|abonelik|demo|deneme|yorum|yorumları|öneri|önerisi|tavsiye|price|pricing|best|cheap|free|buy|deal|discount|review|sale|kiralık|kiralama|sipariş|online");
const CMP_RE = W("vs|veya|yoksa|farkı|fark|alternatif|alternatifleri|karşılaştırma|mı .* mı|or|versus|alternative|compared");
const LOC_RE = W("yakınımda|near me|istanbul|ankara|izmir|bursa|antalya|adana|konya|kadıköy|beşiktaş|şişli|bakırköy|merkez");

const STOP = new Set("ve ile için en bir bu şu da de mi mı ne the and for with of to in a".split(" "));

export function intentOf(k: string): KeywordIntent {
  if (Q_RE.test(k)) return "question";
  if (CMP_RE.test(k)) return "comparison";
  if (LOC_RE.test(k)) return "local";
  if (COM_RE.test(k)) return "commercial";
  return "informational";
}

/** Tohum dışındaki ilk anlamlı kelime — basit kümeleme anahtarı. */
function clusterOf(k: string, seed: string): string {
  const seedWords = new Set(seed.toLocaleLowerCase("tr").split(/\s+/));
  const w = k
    .toLocaleLowerCase("tr")
    .split(/\s+/)
    .find((x) => x.length > 2 && !seedWords.has(x) && !STOP.has(x));
  return w ?? "genel";
}

/** Küme anahtarı (tek kelime) → okunur ad: kümedeki en az kelimeli, sonra en kısa arama. */
export function clusterLabels(ideas: { keyword: string; cluster: string }[]): Map<string, string> {
  const best = new Map<string, string>();
  for (const i of ideas) {
    if (i.cluster === "genel") continue;
    const cur = best.get(i.cluster);
    const w = (k: string) => k.split(/\s+/).length;
    if (!cur || w(i.keyword) < w(cur) || (w(i.keyword) === w(cur) && i.keyword.length < cur.length)) best.set(i.cluster, i.keyword);
  }
  return best;
}

/** Dış kaynaktan gelen bir kelimeyi aynı niyet/küme kurallarıyla sınıflandırır. */
export function classifyKeyword(keyword: string, seed: string): Pick<KeywordIdea, "intent" | "cluster" | "words"> {
  return { intent: intentOf(keyword), cluster: clusterOf(keyword, seed), words: keyword.split(/\s+/).length };
}

export interface KeywordResearch {
  seed: string;
  ideas: KeywordIdea[];
  queries: number;
  clusters: { name: string; count: number }[];
}

export async function researchKeywords(seed: string, opts: { lang?: string; country?: string; depth?: "quick" | "deep" } = {}): Promise<KeywordResearch> {
  const s = seed.trim().replace(/\s+/g, " ");
  const lang = (opts.lang || "tr").toLowerCase();
  const country = (opts.country || "TR").toUpperCase();
  const p = PATTERNS[lang] ?? PATTERNS.en;
  const pre = lang === "tr";
  const queries = new Set<string>([s]);
  for (const q of p.questions) queries.add(pre ? `${s} ${q}` : `${q} ${s}`);
  for (const c of p.commercial) queries.add(`${s} ${c}`);
  for (const c of p.comparison) queries.add(`${s} ${c}`);
  for (const l of p.local) queries.add(`${s} ${l}`);
  if (opts.depth !== "quick") for (const ch of p.alphabet) queries.add(`${s} ${ch}`);

  const list = [...queries].slice(0, 70);
  const hits = new Map<string, number>();
  for (let i = 0; i < list.length; i += 8) {
    const batch = await Promise.all(list.slice(i, i + 8).map((q) => autocomplete(q, lang, country)));
    for (const arr of batch)
      for (const k of arr) {
        const key = k.trim().toLocaleLowerCase(lang === "tr" ? "tr" : "en");
        if (key.length < 3) continue;
        hits.set(key, (hits.get(key) ?? 0) + 1);
      }
  }
  const ideas: KeywordIdea[] = [...hits.entries()]
    .map(([keyword, h]) => ({ keyword, hits: h, intent: intentOf(keyword), words: keyword.split(/\s+/).length, cluster: clusterOf(keyword, s) }))
    .sort((a, b) => b.hits - a.hits || a.words - b.words);
  // Küme adı: kümedeki en kısa gerçek arama ("fiyatları" değil "ikinci el araba fiyatları"); kümelerin kendisi değişmez.
  const label = clusterLabels(ideas);
  for (const i of ideas) i.cluster = label.get(i.cluster) ?? i.cluster;
  const cm = new Map<string, number>();
  for (const i of ideas) cm.set(i.cluster, (cm.get(i.cluster) ?? 0) + 1);
  const clusters = [...cm.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, count]) => ({ name, count }));
  return { seed: s, ideas: ideas.slice(0, 400), queries: list.length, clusters };
}
