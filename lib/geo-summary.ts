import type { GeoReport } from "./geo-report.ts";
import type { RunDiff } from "./geo-diff.ts";

/**
 * Maya/Peec tarzı özet: "ne oldu, neden, şimdi ne yapmalı" + etki/efor etiketli öncelikli işler.
 * AI yalnızca buradaki olguları yorumlar (1 sorgu, test başına bir kez); kazanım/kayıplar koddan gelir (RunDiff).
 */

export interface SummaryAction {
  action: string;
  why: string;
  impact: "yüksek" | "orta" | "düşük";
  effort: "düşük" | "orta" | "yüksek";
}
export interface GeoSummary {
  headline: string;
  cause: string | null;
  urgentAction: string | null;
  actions: SummaryAction[];
}

const pct = (x: number) => `%${Math.round(x * 100)}`;

/** AI'a gidecek olgular — hepsi testten sayılmış; AI bunların dışına çıkamaz. */
export function summaryFacts(brand: string, r: GeoReport, diff: RunDiff | null, excerpts: string[] = []): string {
  const lines = [
    `Marka: ${brand}. Son test: ${r.questions} soru, ${r.answers} AI cevabı (${r.engines.join(", ")}).`,
    `Görünürlük ${pct(r.visibility)}${r.confidence ? ` (±${r.confidence.margin} puan)` : ""}, ilk sırada ${pct(r.winRate)}. Kendi sitesi ${r.sourcedAnswers ? `${r.ownCitedIn}/${r.sourcedAnswers} kaynaklı cevapta kaynak` : "hiçbir cevap kaynak göstermedi"}.`,
    `Markalar (görünürlük, ilk sıra sayısı): ${r.brands.map((b) => `${b.name}${b.own ? " (kendisi)" : ""} ${pct(b.visibility)}/${b.firsts}`).join("; ")}.`,
    r.leader ? `Lider rakip ${r.leader.name}: ${r.leader.aheadIn} cevapta markadan önce, ${r.leader.citedIn} cevapta kendi sitesi kaynak. En çok kaynak gösterilen sayfası: ${r.leader.pages[0]?.url ?? "yok"}.` : "",
    r.topics.length > 1 ? `Konular (en zayıftan): ${r.topics.slice(0, 5).map((t) => `${t.topic} ${pct(t.visibility)} görünür/${pct(t.winRate)} ilk${t.leader ? `, lider ${t.leader.name}` : ""}`).join("; ")}.` : "",
    r.lost.length ? `Kaybedilen sorular: ${r.lost.slice(0, 5).map((q) => `"${q.question.slice(0, 140)}" (${q.lost}/${q.total} motorda anılmadı${q.engines.find((e) => e.winner) ? `, öne çıkan ${q.engines.find((e) => e.winner)!.winner}` : ""})`).join("; ")}.` : "Kaybedilen soru yok.",
    r.gapSources.length ? `Kaybedilen cevaplarda AI'ın baktığı dış kaynaklar: ${r.gapSources.slice(0, 6).map((g) => `${g.domain} (${g.count})`).join(", ")}.` : "",
    r.perception.negatives.length ? `Marka cümlelerinde olumsuz ifadeler: ${r.perception.negatives.map((t) => t.term).join(", ")}.` : "",
    diff && diff.compared
      ? `Önceki teste göre (${diff.compared} ortak cevap): görünürlük ${pct(diff.visibilityBefore)} → ${pct(diff.visibilityAfter)}; kazanılan ${diff.gained.length}, kaybedilen ${diff.lost.length}${diff.rivals.length ? `; rakip değişimi: ${diff.rivals.slice(0, 4).map((x) => `${x.name} ${x.before}→${x.after}`).join(", ")}` : ""}${diff.newSources.length ? `; yeni kaynaklar: ${diff.newSources.slice(0, 5).join(", ")}` : ""}.`
      : "Karşılaştırılacak önceki test yok.",
    excerpts.length ? `Kaybedilen cevaplardan alıntılar:\n${excerpts.map((e) => `- ${e}`).join("\n")}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

export function summaryPrompt(facts: string): string {
  return `Sen bir GEO (AI görünürlüğü) analistisin. Aşağıdaki olgular bir markanın ChatGPT/Claude/Gemini cevaplarındaki son test sonucudur. Maya ve Peec panellerindeki gibi kısa, Türkçe bir özet yaz.

OLGULAR:
${facts}

Yalnızca JSON döndür:
{"headline":"tek cümle: en önemli durum (sayıyla)","cause":"tek cümle: olgulardan görünen en olası neden ya da null","urgentAction":"tek cümle, fiille başlayan en acil iş ya da null","actions":[{"action":"fiille başlayan somut iş (hangi soru/sayfa/kaynak)","why":"tek satır gerekçe, olgulardaki sayıyla","impact":"yüksek|orta|düşük","effort":"düşük|orta|yüksek"}]}
Kurallar: 3-5 iş, etki×aciliyete göre sırala. Yalnızca olgulardaki sayıları, markaları, siteleri ve soruları kullan; yeni bilgi, ürün özelliği ya da rakam uydurma. Neden belirsizse "muhtemelen" de. Tek cevaplık değişimi eğilim diye sunma.`;
}

const pick = <T extends string>(v: unknown, ok: readonly T[], d: T): T => (ok.includes(v as T) ? (v as T) : d);
const s = (v: unknown, n: number) => (typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null" ? v.trim().slice(0, n) : null);

/** AI cevabını doğrular: eksik/boş alanlar atılır, etiketler sabit değerlere sıkıştırılır. */
export function parseSummary(raw: Record<string, unknown>): GeoSummary | null {
  const headline = s(raw.headline, 240);
  if (!headline) return null;
  const actions = (Array.isArray(raw.actions) ? raw.actions : [])
    .map((a: any) => ({ action: s(a?.action, 220), why: s(a?.why, 260), impact: pick(a?.impact, ["yüksek", "orta", "düşük"] as const, "orta"), effort: pick(a?.effort, ["düşük", "orta", "yüksek"] as const, "orta") }))
    .filter((a): a is SummaryAction => !!a.action && !!a.why)
    .slice(0, 5);
  return { headline, cause: s(raw.cause, 260), urgentAction: s(raw.urgentAction, 220), actions };
}
