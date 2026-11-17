import { listContentDrafts, listRankKeywords, listSavedPrompts, rankHistory } from "@/lib/db";

/**
 * Yenilenecek yazılar (AI kullanmaz): sıralama düşüşü, 2. sayfa fırsatı, AI'da anılmama,
 * eskime, kısa içerik, eksik bilgi ve SSS yokluğu sinyallerini yazı/URL başına toplar ve puanlar.
 */

export type SignalKind = "drop" | "striking" | "lost" | "ai" | "stale" | "thin" | "holes" | "nofaq";
export interface RefreshSignal {
  kind: SignalKind;
  label: string;
  detail: string;
  weight: number;
}
export interface RefreshItem {
  key: string;
  url: string | null;
  title: string;
  draftId: number | null;
  keywords: { keyword: string; position: number | null; best: number | null }[];
  prompts: string[];
  words: number | null;
  publishedAt: string | null;
  signals: RefreshSignal[];
  score: number;
  priority: "high" | "medium" | "low";
}

const normUrl = (u: string) =>
  u
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
const host = (u: string) => normUrl(u).replace(/\/.*$/, "");
const wordCount = (md: string) => (md.replace(/[#*_>`\[\]()!-]/g, " ").match(/\S+/g) ?? []).length;

const STOP = new Set(
  "ve ile için bir bu şu ne nedir nasıl en mi mı mu mü da de ki gibi olan hangi neden kadar daha çok iyi the a an of for to in on and or is are what how best with vs".split(" ")
);
const toks = (s: string) =>
  new Set(
    s
      .toLocaleLowerCase("tr")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
  );
const overlap = (a: Set<string>, b: Set<string>) => [...a].filter((w) => b.has(w) || [...b].some((x) => x.length > 4 && w.length > 4 && (x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5))))).length;

export async function findRefreshCandidates(userId: number, domain: string): Promise<RefreshItem[]> {
  const site = host(domain);
  const [drafts, ranks, hist, prompts] = await Promise.all([
    listContentDrafts(userId, 300),
    listRankKeywords(userId),
    rankHistory(userId).catch(() => ({}) as Record<number, { position: number | null; at: string }[]>),
    listSavedPrompts(userId, domain).catch(() => []),
  ]);

  const items = new Map<string, RefreshItem>();
  const get = (key: string, init: () => RefreshItem) => {
    let it = items.get(key);
    if (!it) {
      it = init();
      items.set(key, it);
    }
    return it;
  };

  // 1) Yayınlanmış yazılar (Epicsem'den siteye gönderilenler)
  for (const d of drafts) {
    if (!d.publishedPostUrl) continue;
    if (host(d.publishedPostUrl) !== site && d.site !== site) continue;
    const key = normUrl(d.publishedPostUrl);
    const it = get(key, () => ({
      key,
      url: d.publishedPostUrl,
      title: d.article.title || key,
      draftId: d.id,
      keywords: [],
      prompts: [],
      words: null,
      publishedAt: null,
      signals: [],
      score: 0,
      priority: "low",
    }));
    it.draftId = d.id;
    it.title = d.article.title || it.title;
    it.words = wordCount(d.article.bodyMarkdown);
    it.publishedAt = d.publishedAt ?? d.createdAt;
    const ageDays = (Date.now() - new Date(it.publishedAt).getTime()) / 864e5;
    if (ageDays > 120) it.signals.push({ kind: "stale", label: "Eskidi", detail: `${Math.round(ageDays / 30)} aydır güncellenmedi; tarih, rakam ve örnekleri tazele.`, weight: Math.min(25, 10 + Math.round(ageDays / 30)) });
    if (it.words < 700) it.signals.push({ kind: "thin", label: "Kısa", detail: `${it.words} kelime; rakip cevaplar genelde daha kapsamlı. Eksik alt başlıkları ekle.`, weight: 12 });
    const holes = d.article.openPlaceholders?.length ?? 0;
    if (holes) it.signals.push({ kind: "holes", label: "Eksik bilgi", detail: `${holes} doldurulmamış [NEEDS] alanı var.`, weight: 15 });
    if (!/^#{2,3}\s*(sss|sık sorulan|faq|frequently)/im.test(d.article.bodyMarkdown)) it.signals.push({ kind: "nofaq", label: "SSS yok", detail: "Soru-cevap bölümü AI motorlarının alıntılamasını kolaylaştırır.", weight: 8 });
  }

  // 2) Sıralama verisi (Sıralama Takibi'ndeki kelimeler, bu siteye ait)
  for (const k of ranks) {
    if (host(k.domain) !== site) continue;
    const h = (hist as Record<number, { position: number | null; at: string }[]>)[k.id] ?? [];
    const positions = h.map((p) => p.position).filter((p): p is number => p != null);
    const best = positions.length ? Math.min(...positions) : null;
    const cur = k.lastPosition;
    const url = k.lastUrl;
    if (!url && best == null) continue;
    const key = url ? normUrl(url) : `kw:${k.keyword}`;
    const draft = url ? drafts.find((d) => d.publishedPostUrl && normUrl(d.publishedPostUrl) === key) : undefined;
    const it = get(key, () => ({
      key,
      url: url ?? null,
      title: draft?.article.title || (url ? normUrl(url).replace(/^[^/]+/, "") || "/" : `“${k.keyword}” (sayfa düştü)`),
      draftId: draft?.id ?? null,
      keywords: [],
      prompts: [],
      words: draft ? wordCount(draft.article.bodyMarkdown) : null,
      publishedAt: draft?.publishedAt ?? null,
      signals: [],
      score: 0,
      priority: "low",
    }));
    it.keywords.push({ keyword: k.keyword, position: cur, best });
    if (cur == null && best != null) {
      it.signals.push({ kind: "lost", label: "Sıralamadan çıktı", detail: `“${k.keyword}” son 60 günde ${best}. sıradaydı, şimdi ilk 100'de yok.`, weight: 35 });
    } else if (cur != null && best != null && cur - best >= 3) {
      it.signals.push({ kind: "drop", label: "Düşüşte", detail: `“${k.keyword}”: ${best}. sıradan ${cur}. sıraya indi.`, weight: Math.min(35, 15 + (cur - best) * 2) });
    } else if (cur != null && cur >= 4 && cur <= 20) {
      it.signals.push({ kind: "striking", label: cur <= 10 ? "İlk 3'e yakın" : "2. sayfada", detail: `“${k.keyword}” ${cur}. sırada; küçük bir güncelleme üst sıralara taşıyabilir.`, weight: cur <= 10 ? 22 : 18 });
    }
  }

  // 3) AI görünürlüğü: markanın anılmadığı GEO soruları, başlık/kelime örtüşmesine göre yazıya bağlanır
  const missing = prompts.filter((p) => p.lastMentioned === false && !p.branded);
  for (const it of items.values()) {
    const t = toks(`${it.title} ${it.keywords.map((k) => k.keyword).join(" ")}`);
    if (!t.size) continue;
    const hits = missing.filter((p) => overlap(toks(p.promptText), t) >= 2).map((p) => p.promptText);
    if (hits.length) {
      it.prompts = hits.slice(0, 5);
      it.signals.push({ kind: "ai", label: "AI'da anılmıyor", detail: `${hits.length} ilgili soruda AI cevaplarında markan geçmiyor: “${hits[0]}”`, weight: Math.min(30, 15 + hits.length * 5) });
    }
  }

  const out = [...items.values()].filter((it) => it.signals.length);
  for (const it of out) {
    // aynı türden birden çok sinyal tek sayılır, en ağırı alınır
    const byKind = new Map<SignalKind, RefreshSignal>();
    for (const s of it.signals) if (!byKind.has(s.kind) || byKind.get(s.kind)!.weight < s.weight) byKind.set(s.kind, s);
    const extra = it.signals.filter((s) => s.kind === "drop" || s.kind === "striking" || s.kind === "lost");
    it.signals = [...byKind.values()].sort((a, b) => b.weight - a.weight);
    it.score = Math.min(100, it.signals.reduce((s, x) => s + x.weight, 0) + Math.max(0, extra.length - 1) * 4);
    it.priority = it.score >= 45 ? "high" : it.score >= 25 ? "medium" : "low";
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 60);
}
