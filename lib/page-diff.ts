import type { SeoAuditResult } from "../types";

/**
 * Sayfa İzleme: her kontrolde sayfanın küçük bir anlık görüntüsü tutulur; bir öncekiyle karşılaştırılıp
 * "ne değişti, iyi mi kötü mü" çıkarılır (kodla). Kritik değişiklikler uyarı üretir.
 */

export interface PageSnap {
  ok: boolean;
  title: string | null;
  description: string | null;
  h1Count: number;
  wordCount: number;
  canonical: string | null;
  schemaTypes: string[];
  noindex: boolean | null;
  blockedBots: string[];
  score: number;
}

export interface PageChange {
  text: string;
  verdict: "kötü" | "iyi" | "bilgi";
  critical: boolean;
}

export function snapOf(a: SeoAuditResult): PageSnap {
  const m = a.meta;
  return {
    ok: !a.issues.some((i) => i.category === "crawlability" && i.severity === "critical" && /HTTP|fetched|engelliyor/i.test(i.title)),
    title: m.title,
    description: m.description,
    h1Count: m.h1Count,
    wordCount: m.wordCount,
    canonical: m.canonical,
    schemaTypes: m.schemaTypes ?? [],
    noindex: m.metaRobots === undefined ? null : /noindex/i.test(m.metaRobots ?? ""),
    blockedBots: m.aiBotAccess.filter((b) => !b.allowed).map((b) => b.bot),
    score: a.score,
  };
}

const q = (s: string | null) => `"${(s ?? "").slice(0, 80)}"`;

export function diffSnaps(prev: PageSnap, cur: PageSnap): PageChange[] {
  const out: PageChange[] = [];
  const add = (text: string, verdict: PageChange["verdict"], critical = false) => out.push({ text, verdict, critical });
  if (prev.ok && !cur.ok) add("Sayfa açılmıyor (hata kodu ya da erişim engeli).", "kötü", true);
  if (!prev.ok && cur.ok) add("Sayfa yeniden açılıyor.", "iyi");
  if (!cur.ok) return out; // açılmayan sayfanın içeriği karşılaştırılmaz
  if (prev.noindex === false && cur.noindex) add("Sayfaya noindex eklendi: Google bu sayfayı dizinden çıkarır.", "kötü", true);
  if (prev.noindex && cur.noindex === false) add("noindex kaldırıldı: sayfa yeniden dizine girebilir.", "iyi");
  if (prev.title && !cur.title) add("Başlık (title) silindi.", "kötü", true);
  else if (!prev.title && cur.title) add(`Başlık eklendi: ${q(cur.title)}.`, "iyi");
  else if (prev.title !== cur.title) add(`Başlık değişti: ${q(prev.title)} → ${q(cur.title)}.`, "bilgi");
  if (prev.description && !cur.description) add("Meta açıklama silindi.", "kötü");
  else if (!prev.description && cur.description) add("Meta açıklama eklendi.", "iyi");
  else if (prev.description !== cur.description) add("Meta açıklama değişti.", "bilgi");
  if (prev.canonical && prev.canonical !== cur.canonical) add(`Canonical değişti: ${q(prev.canonical)} → ${q(cur.canonical)}. Yanlış adrese gösteriyorsa sayfa Google'dan düşer.`, "kötü", true);
  if (prev.h1Count >= 1 && cur.h1Count === 0) add("H1 başlığı kaldırıldı.", "kötü");
  if (prev.h1Count === 0 && cur.h1Count >= 1) add("H1 başlığı eklendi.", "iyi");
  const w0 = prev.wordCount;
  const w1 = cur.wordCount;
  if (w0 > 0 && w1 < w0 * 0.7 && w0 - w1 >= 150) add(`İçerik kısaldı: ~${w0} → ~${w1} kelime.`, "kötü", w1 < w0 * 0.5);
  if (w0 > 0 && w1 > w0 * 1.3 && w1 - w0 >= 150) add(`İçerik genişledi: ~${w0} → ~${w1} kelime.`, "iyi");
  const gone = prev.schemaTypes.filter((t) => !cur.schemaTypes.includes(t));
  const added = cur.schemaTypes.filter((t) => !prev.schemaTypes.includes(t));
  if (gone.length) add(`Yapılandırılmış veri kaldırıldı: ${gone.join(", ")}.`, "kötü");
  if (added.length) add(`Yapılandırılmış veri eklendi: ${added.join(", ")}.`, "iyi");
  const nb = cur.blockedBots.filter((b) => !prev.blockedBots.includes(b));
  const ub = prev.blockedBots.filter((b) => !cur.blockedBots.includes(b));
  if (nb.length) add(`robots.txt şu AI botlarını yeni engelledi: ${nb.join(", ")}. Bu motorlar sayfayı artık okuyamaz.`, "kötü", true);
  if (ub.length) add(`Şu AI botlarının engeli kalktı: ${ub.join(", ")}.`, "iyi");
  if (cur.score - prev.score >= 10) add(`Denetim puanı yükseldi: ${prev.score} → ${cur.score}.`, "iyi");
  if (prev.score - cur.score >= 10) add(`Denetim puanı düştü: ${prev.score} → ${cur.score}.`, "kötü");
  return out;
}
