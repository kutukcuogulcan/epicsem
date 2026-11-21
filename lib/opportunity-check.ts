/**
 * GEO analist çıktısının doğrulaması (saf, test edilebilir). Elmo'nun "Opportunities" şemasından
 * uyarlandı (github.com/elmohq/elmo, MIT): her fırsat ilgili soruları ve kaynakları taşır.
 * Uydurma yok: AI'ın verdiği soru numarası ya da kaynak alan adı kanıtta yoksa atılır;
 * etki bandını AI değil kod hesaplar (kaç cevap kaybedildi, kaynak kaç kez gösterildi).
 */

export type OpportunityCategory = "creation" | "existing-content" | "outreach" | "social";

export interface EvidencePrompt {
  i: number;
  text: string;
  /** Bu soruya verilen cevap sayısı (motor başına bir) ve kaybedilenler (rakip kazandı ya da kimse anılmadı). */
  answers: number;
  lost: number;
}

export interface EvidenceSource {
  domain: string;
  /** Kaç cevapta kaynak gösterildi. */
  count: number;
  urls: string[];
}

export interface Evidence {
  prompts: EvidencePrompt[];
  sources: EvidenceSource[];
  totalAnswers: number;
}

export interface Opportunity {
  category: OpportunityCategory;
  title: string;
  why: string;
  prompts: { i: number; text: string }[];
  sources: { domain: string; urls: string[] }[];
  impact: "high" | "medium" | "low";
  /** Bu fırsatın kapsadığı kaybedilen cevap sayısı. */
  lostAnswers: number;
  /** Agent'ın okuduğu sayfalardan bulgular (yalnızca agent raporunda). */
  evidence?: { url: string; finding: string }[];
}

const CATS: OpportunityCategory[] = ["creation", "existing-content", "outreach", "social"];

export function impactOf(lostAnswers: number, totalAnswers: number, sourceHits: number): Opportunity["impact"] {
  const share = totalAnswers ? lostAnswers / totalAnswers : 0;
  if (share >= 0.3 || sourceHits >= 4) return "high";
  if (share >= 0.1 || sourceHits >= 2) return "medium";
  return "low";
}

export function validateOpportunities(raw: unknown, ev: Evidence): Opportunity[] {
  const out: Opportunity[] = [];
  for (const x of Array.isArray(raw) ? raw : []) {
    const o = x as Record<string, unknown>;
    const category = CATS.includes(o?.category as OpportunityCategory) ? (o.category as OpportunityCategory) : null;
    const title = String(o?.title ?? "").trim().slice(0, 160);
    const why = String(o?.why ?? "").trim().slice(0, 700);
    if (!category || title.length < 6 || why.length < 10) continue;
    const prompts = [...new Set((Array.isArray(o.prompts) ? o.prompts : []).map(Number))]
      .map((i) => ev.prompts.find((p) => p.i === i))
      .filter((p): p is EvidencePrompt => !!p);
    if (!prompts.length) continue; // kanıta bağlanmayan fırsat yok
    const sources = [...new Set((Array.isArray(o.sources) ? o.sources : []).map((d) => String(d).toLowerCase().replace(/^www\./, "")))]
      .map((d) => ev.sources.find((s) => s.domain === d))
      .filter((s): s is EvidenceSource => !!s);
    if ((category === "outreach" || category === "social") && !sources.length) continue; // dış site işi kaynaksız olmaz
    if (out.some((p) => p.title.toLocaleLowerCase("tr") === title.toLocaleLowerCase("tr"))) continue;
    const lostAnswers = prompts.reduce((a, p) => a + p.lost, 0);
    out.push({
      category,
      title,
      why,
      prompts: prompts.map((p) => ({ i: p.i, text: p.text })),
      sources: sources.map((s) => ({ domain: s.domain, urls: s.urls.slice(0, 3) })),
      impact: impactOf(lostAnswers, ev.totalAnswers, sources.reduce((a, s) => a + s.count, 0)),
      lostAnswers,
    });
  }
  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.impact] - rank[b.impact] || b.lostAnswers - a.lostAnswers).slice(0, 8);
}
