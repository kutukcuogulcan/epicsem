import type {
  EngineId,
  GeoRunResult,
  GeoVisibilitySummary,
  SourceDomainStat,
  SourceDomainType,
  TopicVisibility,
  UrlStat,
  UrlType,
} from "@/types";
import { PROVIDERS, isDemoMode } from "./geo-providers";
import { simulateResponse } from "./geo-demo";
import { analyzeResponse } from "./geo-analyze";
import { brandMentioned } from "./text-match";

export interface BrandInput {
  name: string;
  domain: string;
  /** Extra names that also count as this brand being named (Kart: Marka tespiti §2) — e.g. a
   * shortened/commonly-used form ("İşbank" for "Türkiye İş Bankası"). Optional, defaults to none. */
  aliases?: string[];
}

const ALL_ENGINES: EngineId[] = ["openai", "anthropic", "google", "perplexity", "deepseek", "xai", "meta", "microsoft"];

/** Below this many chats (prompt × engine × run), a metric is statistically too noisy to trust —
 * Kart: Overview/Domain/URL metrics spec §10 ("Sohbet sayısı < 10 ise değer gri + yetersiz veri"). */
export const MIN_CHATS_FOR_RELIABLE_METRIC = 10;

/** A prompt "names" the brand when its own text contains the brand name — vs. a discovery-style
 * prompt ("en iyi ... markaları") someone who's never heard of the brand would plausibly ask. */
export function isBrandedPrompt(promptText: string, brandName: string): boolean {
  return brandMentioned(promptText, { name: brandName });
}

/** Runs one prompt across every configured engine (or the demo simulator) and analyzes each response. */
export async function runPromptAcrossEngines(
  promptText: string,
  brand: BrandInput,
  competitors: BrandInput[],
  engines: EngineId[] = ALL_ENGINES,
  topic: string = "Genel"
): Promise<GeoRunResult[]> {
  const demo = isDemoMode();
  const branded = isBrandedPrompt(promptText, brand.name);

  const results = await Promise.all(
    engines.map(async (engineId): Promise<GeoRunResult> => {
      const provider = PROVIDERS[engineId];
      let text: string;
      let model: string;

      if (demo || !provider.isConfigured()) {
        const sim = simulateResponse(promptText, engineId, brand.name, brand.domain, competitors);
        text = sim.text;
        model = sim.model;
      } else {
        try {
          const res = await provider.run(promptText);
          text = res.text;
          model = res.model;
        } catch (err) {
          const sim = simulateResponse(promptText, engineId, brand.name, brand.domain, competitors);
          text = `[Live call failed, showing simulated fallback: ${err instanceof Error ? err.message : "unknown error"}]\n\n${sim.text}`;
          model = sim.model;
        }
      }

      const analyzed = analyzeResponse(text, brand.name, brand.domain, brand.aliases ?? []);

      return {
        engine: engineId,
        model,
        promptText,
        topic,
        branded,
        mentioned: analyzed.mentioned,
        position: analyzed.position,
        sentiment: analyzed.sentiment,
        responseText: text,
        citations: analyzed.citations,
      };
    })
  );

  return results;
}

/** Own-brand visibility broken down by prompt topic — mentioned is always computed against the
 * primary brand (see analyzeResponse call above), so it can be rolled up directly per topic. */
export function summarizeByTopic(runs: GeoRunResult[]): TopicVisibility[] {
  const byTopic = new Map<string, GeoRunResult[]>();
  for (const run of runs) {
    const key = run.topic || "Genel";
    if (!byTopic.has(key)) byTopic.set(key, []);
    byTopic.get(key)!.push(run);
  }

  return Array.from(byTopic.entries())
    .map(([topic, topicRuns]) => {
      const mentionedCount = topicRuns.filter((r) => r.mentioned).length;
      return {
        topic,
        visibility: topicRuns.length ? mentionedCount / topicRuns.length : 0,
        mentionedCount,
        totalCount: topicRuns.length,
      };
    })
    .sort((a, b) => b.totalCount - a.totalCount);
}

/** Aggregates a set of GeoRunResults (across prompts/engines) into per-brand visibility metrics. */
export function summarizeVisibility(
  runs: GeoRunResult[],
  brands: BrandInput[]
): GeoVisibilitySummary[] {
  const totalRuns = runs.length || 1;

  return brands.map((brand) => {
    const brandRuns = runs.filter((r) => brandMentioned(r.responseText, brand));
    const mentionedRuns = brandRuns.filter((r) => r.mentioned);
    const positions = mentionedRuns.map((r) => r.position).filter((p): p is number => p != null);
    const sentiments = mentionedRuns.map((r) => r.sentiment).filter((s): s is number => s != null);
    const citationCount = runs.reduce(
      (sum, r) => sum + r.citations.filter((c) => c.domain === brand.domain.replace(/^www\./, "")).length,
      0
    );

    return {
      brand: brand.name,
      domain: brand.domain,
      visibility: mentionedRuns.length / totalRuns,
      shareOfVoice: 0, // filled in by computeShareOfVoice once all brands are known
      avgPosition: positions.length ? positions.reduce((a, b) => a + b, 0) / positions.length : null,
      avgSentiment: sentiments.length ? Math.round(sentiments.reduce((a, b) => a + b, 0) / sentiments.length) : null,
      citationCount,
    };
  });
}

export function computeShareOfVoice(summaries: GeoVisibilitySummary[]): GeoVisibilitySummary[] {
  const totalMentions = summaries.reduce((sum, s) => sum + s.visibility, 0);
  if (totalMentions === 0) return summaries;
  return summaries.map((s) => ({ ...s, shareOfVoice: s.visibility / totalMentions }));
}

// Domains that are almost always user-generated content platforms rather than
// brand-owned or editorial sources — mirrors the "UGC" bucket in Peec-style dashboards.
const UGC_DOMAINS = ["reddit.com", "youtube.com", "quora.com", "medium.com", "x.com", "twitter.com", "facebook.com", "instagram.com", "tiktok.com", "ekşisözlük.com", "eksisozluk.com"];
// Encyclopedic/dictionary-style reference sources — distinct from official institutions (below).
const REFERENCE_HINTS = ["wikipedia.org", "britannica.com", "sozluk.gov.tr"];
// Public-sector / official-institution domains — Kart §8's "Kamu/Kurum", kept separate from the
// encyclopedic "Referans" bucket per the spec's 8-category split.
const GOVERNMENT_HINTS = [".gov", ".gov.tr", ".edu", ".edu.tr", ".mil", ".mil.tr", ".bel.tr", "tubitak.gov.tr"];
// A deliberately small, known-incomplete list of recognizable news/media outlets (TR + EN) —
// "Editoryal" per Kart §8. Anything not on this list falls through to "Kurumsal"/"Diğer" below;
// this is a heuristic seed list, not a verified classification — a manual-override UI (also
// called for in §8) is still pending, so treat any Editoryal/Kurumsal split as a starting point.
const EDITORIAL_HINTS = [
  "hurriyet.com.tr", "milliyet.com.tr", "sabah.com.tr", "ntv.com.tr", "cnnturk.com", "sozcu.com.tr",
  "haberturk.com", "cumhuriyet.com.tr", "webtekno.com", "donanimhaber.com", "shiftdelete.net",
  "forbes.com", "techcrunch.com", "nytimes.com", "bbc.com", "theverge.com", "wired.com", "bloomberg.com",
];

/** Domain-type taxonomy — Kart: Overview/Domain/URL metrics spec §8 ("Domain tipi: Biz, Rakip,
 * Kurumsal, Editoryal, Kamu/Kurum, UGC, Referans, Diğer"). "Kurumsal" is the default bucket for a
 * citation that isn't UGC/Reference/Government/Editorial/You/Competitor — most real-world sources
 * cited by AI answers that aren't big-name media ARE some other organization's own site (a
 * supplier, a review platform, a local business) rather than genuine miscellany, so that's the
 * more useful default than lumping everything into "Diğer". The spec also calls for a manual
 * override ("Kullanıcı her ikisini de elle değiştirebilir") — not yet built; flagged as pending. */
function classifyDomain(domain: string, brandDomain: string, competitorDomains: string[]): SourceDomainType {
  const clean = domain.replace(/^www\./, "");
  const own = brandDomain.replace(/^www\./, "");
  if (clean === own) return "You";
  if (competitorDomains.some((c) => clean === c.replace(/^www\./, ""))) return "Competitor";
  if (GOVERNMENT_HINTS.some((g) => clean.endsWith(g))) return "Government";
  if (REFERENCE_HINTS.some((r) => clean.endsWith(r))) return "Reference";
  if (UGC_DOMAINS.some((u) => clean.endsWith(u))) return "UGC";
  if (EDITORIAL_HINTS.some((e) => clean.endsWith(e))) return "Editorial";
  if (!clean || clean.length < 3) return "Other";
  return "Corporate";
}

/** URL-type taxonomy — Kart §8 ("URL tipi: Ana sayfa, Kategori, Ürün, Listicle, Karşılaştırma,
 * Profil, Alternatif, Tartışma, Nasıl yapılır, Makale, Diğer"). Pattern-matched off the URL's own
 * path/query — a heuristic over real URLs (never a fabricated label), same caveat as domain
 * classification: a manual override is still pending. */
export function classifyUrlType(url: string, domainType: SourceDomainType): UrlType {
  let path = "";
  try {
    const u = new URL(url);
    path = `${u.pathname}${u.search}`.toLowerCase();
  } catch {
    return "Other";
  }
  // \w* after each Turkish root tolerates agglutinated suffixes in a URL slug
  // ("alternatifleri", "kategorisi") without needing every inflected form spelled out.
  if (domainType === "UGC" || /\/(forum|thread|topic|soru-cevap|t\/)/.test(path)) return "Discussion";
  if (path === "" || path === "/" || /^\/(index\.html?)?$/.test(path)) return "Home";
  if (/\b(vs|versus|karsilastirma\w*|karşılaştırma\w*|compare\w*|comparison\w*)\b/.test(path)) return "Comparison";
  if (/\b(alternative\w*|alternatif\w*)\b/.test(path)) return "Alternative";
  if (/\b(how-to|howto|nasil\w*|nasıl\w*|rehber\w*|guide\w*|kilavuz\w*|kılavuz\w*)\b/.test(path)) return "HowTo";
  if (/\b(top|best|en-iyi|en-cok|en-çok|listicle\w*)\b/.test(path) || /-\d{1,3}-/.test(path)) return "Listicle";
  if (/\b(profile\w*|profil\w*|hakkimizda\w*|hakkımızda\w*|about\w*|author\w*|yazar\w*|kullanici\w*|kullanıcı\w*|user\w*)\b/.test(path))
    return "Profile";
  if (/\b(product\w*|urun\w*|ürün\w*|p\/|dp\/|sku\w*)\b/.test(path)) return "Product";
  if (/\b(category\w*|kategori\w*|collections?\w*)\b/.test(path)) return "Category";
  if (/\b(blog\w*|makale\w*|article\w*|haber\w*|news\w*)\b/.test(path)) return "Article";
  return "Other";
}

/** Aggregates every citation across all runs into a per-domain "who gets cited" breakdown.
 *
 * Kart §4's Retrieved%/Retrieval rate need a genuine "was this domain used as a source" signal
 * that's distinct from "was it cited in the response text" — the browser-based query
 * infrastructure that would capture that (🚨 card) doesn't exist yet, so those two metrics are
 * deliberately NOT computed here rather than faking them from citation data alone. Total
 * citations / Citation share / Citation rate ARE fully computable from what we already capture
 * (in-text citations), so those are implemented per the spec's exact formulas. */
export function computeSourceDistribution(
  runs: GeoRunResult[],
  brand: BrandInput,
  competitors: BrandInput[]
): SourceDomainStat[] {
  const competitorDomains = competitors.map((c) => c.domain);
  const counts = new Map<string, number>();
  const chatsCitedIn = new Map<string, Set<number>>();

  runs.forEach((run, runIdx) => {
    for (const citation of run.citations) {
      counts.set(citation.domain, (counts.get(citation.domain) ?? 0) + 1);
      if (!chatsCitedIn.has(citation.domain)) chatsCitedIn.set(citation.domain, new Set());
      chatsCitedIn.get(citation.domain)!.add(runIdx);
    }
  });

  const totalCitations = Array.from(counts.values()).reduce((a, b) => a + b, 0) || 1;

  return Array.from(counts.entries())
    .map(([domain, count]) => {
      const chatsCited = chatsCitedIn.get(domain)?.size ?? 0;
      return {
        domain,
        count,
        type: classifyDomain(domain, brand.domain, competitorDomains),
        citationShare: count / totalCitations,
        citationRate: chatsCited ? count / chatsCited : 0,
        chatsCited,
      };
    })
    .sort((a, b) => b.count - a.count);
}

/** Aggregates every citation into a per-URL breakdown — Kart §5 ("URL metrikleri"). Same scope
 * note as computeSourceDistribution: "Retrievals" needs the not-yet-built retrieval signal and is
 * deliberately omitted; Total citations/Citation share/Citation rate are implemented exactly. */
export function computeUrlStats(runs: GeoRunResult[], brand: BrandInput, competitors: BrandInput[]): UrlStat[] {
  const competitorDomains = competitors.map((c) => c.domain);
  const counts = new Map<string, number>();
  const domainByUrl = new Map<string, string>();
  const chatsCitedIn = new Map<string, Set<number>>();

  runs.forEach((run, runIdx) => {
    for (const citation of run.citations) {
      counts.set(citation.url, (counts.get(citation.url) ?? 0) + 1);
      domainByUrl.set(citation.url, citation.domain);
      if (!chatsCitedIn.has(citation.url)) chatsCitedIn.set(citation.url, new Set());
      chatsCitedIn.get(citation.url)!.add(runIdx);
    }
  });

  const totalCitations = Array.from(counts.values()).reduce((a, b) => a + b, 0) || 1;

  return Array.from(counts.entries())
    .map(([url, count]) => {
      const domain = domainByUrl.get(url) ?? "";
      const domainType = classifyDomain(domain, brand.domain, competitorDomains);
      const chatsCited = chatsCitedIn.get(url)?.size ?? 0;
      return {
        url,
        domain,
        type: classifyUrlType(url, domainType),
        citationShare: count / totalCitations,
        citationRate: chatsCited ? count / chatsCited : 0,
        totalCitations: count,
        chatsCited,
      };
    })
    .sort((a, b) => b.totalCitations - a.totalCitations);
}

export { ALL_ENGINES };
