/**
 * Shared vocabulary + sector packs for the deterministic slot-planning engine
 * (lib/slot-planner.ts) and the prompt-generation/filtering pipeline (lib/prompt-suggestions.ts,
 * lib/prompt-filter.ts) — per the methodology cards: "neyin üretileceğine kod karar verir, LLM
 * sadece cümleyi yazar." A sector pack is sector-specific weights/patterns/modifiers
 * (originally spec'd as YAML); this app ships it as a typed TS constant instead — same
 * content, no new YAML-parsing dependency, and it's type-checked at compile time.
 *
 * What's REAL vs DESIGN CHOICE here, so nothing is quietly presented as more validated than
 * it is (see HANDOFF.md §5):
 * - intentWeights (and the Genel/default fallback) are the user's own supplied numbers
 *   (Kart 13's E2 table) — these are the actual differentiator between sectors.
 * - formWeights and compat are the one fully-specified example (Ajans/Danışmanlık, E1) —
 *   the spec gives no sector-specific variant for these, so every pack shares them.
 * - matchKeywords, topicSeeds, modifierPool, providerCues, phraseExamples are this app's own
 *   generation scaffolding (same category as the original DEFAULT pack's city/budget/urgency
 *   lists) — reasonable sector-flavored design choices, not claims about real market data.
 * - fallbackTemplates are the user's own 4 generic templates (D4), shared verbatim by every
 *   pack since they're already sector-neutral (filled in with {modifier}/{kategori}/{konu}
 *   at runtime).
 */

export type Intent = "informational" | "commercial" | "transactional" | "instructional";
export type Form = "question" | "need" | "imperative";
/** The 3 fixed audience archetypes the whole slot-planning formula is keyed on (B2-B4 of
 * the methodology) — NOT brand-specific free-form personas. The wizard's audience step
 * asks the model only to estimate each one's share for a given brand, never to invent new
 * persona names, so the compat matrix and style rules below always apply. */
export type PersonaKey = "simple" | "informed" | "researcher";

export const PERSONA_ORDER: PersonaKey[] = ["simple", "informed", "researcher"];

export const PERSONA_LABEL: Record<PersonaKey, string> = {
  simple: "Basit öneri arayan",
  informed: "Bilinçli alıcı",
  researcher: "Detaylı araştırmacı",
};

export const PERSONA_DESCRIPTION: Record<PersonaKey, string> = {
  simple: "Hızlı bir öneri istiyor, detaya girmek istemiyor.",
  informed: "Belirli bir ihtiyacı/özelliği var, ona göre karşılaştırıyor.",
  researcher: "Kriterleri karşılaştırıyor, artı-eksi arıyor, karar vermeden önce derinlemesine araştırıyor.",
};

/** Prompt-length/context/tone rules per persona — B4 of the methodology / C's persona rules. */
export const PERSONA_STYLE: Record<
  PersonaKey,
  { minWords: number; maxWords: number; minModifiers: number; maxModifiers: number; tone: string }
> = {
  simple: { minWords: 6, maxWords: 14, minModifiers: 0, maxModifiers: 1, tone: "Günlük dil, \"önerir misin\" tarzı" },
  informed: { minWords: 12, maxWords: 25, minModifiers: 1, maxModifiers: 2, tone: "Belirli bir ihtiyaç/özellik belirtir" },
  researcher: { minWords: 18, maxWords: 35, minModifiers: 2, maxModifiers: 3, tone: "Kriterler, karşılaştırma, artı-eksi arar" },
};

export interface ModifierPool {
  city: string[];
  budget: string[];
  size: string[];
  urgency: string[];
  /** "segment: from_profile" in the spec's YAML — this pack never hardcodes segment values;
   * callers (lib/prompt-suggestions.ts) merge in the brand's own productTags at plan time
   * (see lib/slot-planner.ts's `dynamicSegmentValues` param). Always [] on the pack itself. */
  segment: string[];
}

export interface SectorPack {
  id: string;
  label: string;
  /** Keywords matched (case/İ-insensitive) against the brand's industry+description to
   * auto-select this pack — E3.1 of the methodology. */
  matchKeywords: string[];
  /** Seed topic candidates specific to this sector, "{hizmet}" substituted with the brand's
   * own industry/product label at call time — fed into topic generation as a 4th candidate
   * source (see lib/topic-generator.ts's "sector" source). */
  topicSeeds: string[];
  intentWeights: Record<Intent, number>;
  intentOrder: Intent[];
  formWeights: Record<Form, number>;
  formOrder: Form[];
  /** How well each (intent, persona) pair fits — scales the persona-assignment score in
   * lib/slot-planner.ts. 1.0 = neutral. Shared across all packs (see file doc comment). */
  compat: Record<Intent, Record<PersonaKey, number>>;
  modifierPool: ModifierPool;
  /** Words whose presence proves a prompt actually asks for a provider/company recommendation
   * (D1 rule 4) — required in informational/instructional prompts, see lib/prompt-filter.ts. */
  providerCues: string[];
  /** Style references shown to the LLM (never copied verbatim) — C's "phrase_examples". */
  phraseExamples: string[];
  /** D4's code-authored fallback when no LLM candidate survives filtering for a slot, even
   * after one retry. Shared verbatim across packs — already sector-neutral via placeholders. */
  fallbackTemplates: Record<Intent, string>;
}

const SHARED_FORM_WEIGHTS: Record<Form, number> = { question: 0.5, need: 0.3, imperative: 0.2 };
const SHARED_FORM_ORDER: Form[] = ["question", "need", "imperative"];
const SHARED_COMPAT: Record<Intent, Record<PersonaKey, number>> = {
  informational: { simple: 1.0, informed: 1.0, researcher: 1.2 },
  commercial: { simple: 1.0, informed: 1.0, researcher: 1.2 },
  transactional: { simple: 1.2, informed: 1.2, researcher: 0.6 },
  instructional: { simple: 1.0, informed: 1.2, researcher: 0.8 },
};
const SHARED_FALLBACK_TEMPLATES: Record<Intent, string> = {
  commercial: "{modifier} için en iyi {kategori} hangileri?",
  informational: "{kategori} seçerken nelere dikkat etmeliyim, hangi firmalar öne çıkıyor?",
  transactional: "{modifier} için {kategori} hizmeti almak istiyorum, kimi önerirsin?",
  instructional: "{konu} nasıl yapılır, bu konuda hangi {kategori} destek veriyor?",
};
const SHARED_PROVIDER_CUES = ["hangi", "hangileri", "öner", "önerir", "önerirsin", "firma", "şirket", "ekip", "kim", "nereden", "kimi"];
const SHARED_CITY = ["İstanbul", "Ankara", "İzmir", "Türkiye'de"];
const SHARED_URGENCY = ["acil olarak", "bu ay içinde", "yakın zamanda"];
const SHARED_BUDGET = ["sınırlı bir bütçeyle", "aylık belirli bir bütçeyle", "yüksek bütçeyle"];

function makeIntentWeights(informational: number, commercial: number, transactional: number, instructional: number): Record<Intent, number> {
  return { informational, commercial, transactional, instructional };
}
const INTENT_ORDER: Intent[] = ["informational", "commercial", "transactional", "instructional"];

interface PackSeed {
  id: string;
  label: string;
  matchKeywords: string[];
  topicSeeds: string[];
  intentWeights: Record<Intent, number>;
  size: string[];
  providerCueExtra?: string[];
  phraseExamples: string[];
}

/** E2's weight table — the one piece of real, user-supplied data per sector. Everything else
 * per pack below (keywords/seeds/size labels/phrases) is this app's own generation scaffolding. */
const PACK_SEEDS: PackSeed[] = [
  {
    id: "agency_consulting",
    label: "Ajans ve Danışmanlık",
    matchKeywords: ["ajans", "agency", "danışmanlık", "consulting", "pazarlama", "reklam", "marketing"],
    topicSeeds: ["{hizmet} Ajansları", "{hizmet} Danışmanlığı", "Ajans Seçimi ve Karşılaştırma"],
    intentWeights: makeIntentWeights(0.2, 0.45, 0.2, 0.15),
    size: ["KOBİ'ler için", "büyük ölçekli markalar için", "kurumsal şirketler için", "startup'lar için"],
    phraseExamples: [
      "… için en iyi ajanslar hangileri?",
      "… konusunda uzman bir ajans arıyorum.",
      "… ajansı seçerken nelere dikkat etmeliyim, hangileri öne çıkıyor?",
    ],
  },
  {
    id: "bank_finance",
    label: "Banka ve Finans",
    matchKeywords: ["banka", "bank", "finans", "finance", "kredi", "sigorta", "yatırım", "fintech"],
    topicSeeds: ["{hizmet} Sunan Bankalar", "{hizmet} Kredi Seçenekleri", "Banka/Finans Kuruluşu Karşılaştırma"],
    intentWeights: makeIntentWeights(0.25, 0.3, 0.3, 0.15),
    size: ["bireysel müşteriler için", "KOBİ'ler için", "kurumsal müşteriler için"],
    providerCueExtra: ["banka", "bankalar"],
    phraseExamples: [
      "… için en uygun koşulları sunan bankalar hangileri?",
      "… konusunda güvenilir bir finans kuruluşu arıyorum.",
      "… ürünlerini karşılaştırırsan hangi bankalar öne çıkar?",
    ],
  },
  {
    id: "ecommerce_retail",
    label: "E-ticaret ve Perakende",
    matchKeywords: ["e-ticaret", "eticaret", "ecommerce", "mağaza", "store", "perakende", "retail", "alışveriş"],
    topicSeeds: ["{hizmet} Satan Mağazalar", "{hizmet} İçin En İyi Siteler", "E-ticaret Sitesi Karşılaştırma"],
    intentWeights: makeIntentWeights(0.15, 0.4, 0.4, 0.05),
    size: ["bireysel alıcılar için", "toplu/kurumsal alım için"],
    providerCueExtra: ["mağaza", "site", "marka"],
    phraseExamples: [
      "… satan en iyi mağazalar/siteler hangileri?",
      "… almak istiyorum, hangi mağazayı önerirsin?",
      "… fiyat ve kalite açısından karşılaştırırsan hangi markalar öne çıkar?",
    ],
  },
  {
    id: "b2b_software",
    label: "B2B Yazılım",
    matchKeywords: ["yazılım", "software", "saas", "b2b", "platform", "teknoloji", "tech", "entegrasyon"],
    topicSeeds: ["{hizmet} Yazılımları", "{hizmet} İçin SaaS Araçları", "Yazılım/Platform Karşılaştırma"],
    intentWeights: makeIntentWeights(0.2, 0.45, 0.15, 0.2),
    size: ["küçük ekipler için", "KOBİ'ler için", "kurumsal şirketler için"],
    providerCueExtra: ["yazılım", "platform", "araç"],
    phraseExamples: [
      "… için en iyi yazılımlar/platformlar hangileri?",
      "… ihtiyacım için bir SaaS aracı arıyorum.",
      "… özelliklerini karşılaştırırsan hangi platformlar öne çıkar?",
    ],
  },
  {
    id: "healthcare_clinic",
    label: "Sağlık ve Klinik",
    matchKeywords: ["klinik", "clinic", "sağlık", "health", "hastane", "doktor", "diş", "estetik"],
    topicSeeds: ["{hizmet} Veren Klinikler", "{hizmet} İçin Uzman Hekimler", "Klinik/Hastane Karşılaştırma"],
    intentWeights: makeIntentWeights(0.3, 0.3, 0.3, 0.1),
    size: ["bireysel hastalar için", "aile/çoklu randevu için"],
    providerCueExtra: ["klinik", "hastane", "doktor", "hekim"],
    phraseExamples: [
      "… için güvenilir klinikler hangileri?",
      "… konusunda uzman bir hekim arıyorum.",
      "… deneyimlerini karşılaştırırsan hangi klinikler öne çıkar?",
    ],
  },
  {
    id: "education",
    label: "Eğitim",
    matchKeywords: ["eğitim", "education", "okul", "school", "kurs", "akademi", "üniversite"],
    topicSeeds: ["{hizmet} Veren Kurumlar", "{hizmet} Kursları", "Eğitim Kurumu Karşılaştırma"],
    intentWeights: makeIntentWeights(0.25, 0.4, 0.25, 0.1),
    size: ["bireysel öğrenciler için", "kurumsal/toplu eğitim için"],
    providerCueExtra: ["kurs", "okul", "akademi", "eğitmen"],
    phraseExamples: [
      "… veren en iyi kurumlar/kurslar hangileri?",
      "… öğrenmek için bir eğitmen/kurs arıyorum.",
      "… içeriklerini karşılaştırırsan hangi kurumlar öne çıkar?",
    ],
  },
  {
    id: "automotive",
    label: "Otomotiv",
    matchKeywords: ["otomotiv", "automotive", "araç", "oto", "galeri", "araba", "car", "servis"],
    topicSeeds: ["{hizmet} Veren Galeriler/Servisler", "{hizmet} İçin Araç Seçenekleri", "Oto Galeri/Servis Karşılaştırma"],
    intentWeights: makeIntentWeights(0.2, 0.45, 0.3, 0.05),
    size: ["bireysel araç sahipleri için", "filo/kurumsal araç için"],
    providerCueExtra: ["galeri", "servis", "bayi"],
    phraseExamples: [
      "… için güvenilir galeriler/servisler hangileri?",
      "… almak/yaptırmak istiyorum, kimi önerirsin?",
      "… fiyat ve hizmet kalitesini karşılaştırırsan hangileri öne çıkar?",
    ],
  },
  {
    id: "jewelry_gold",
    label: "Kuyum ve Altın",
    matchKeywords: ["kuyum", "altın", "mücevher", "jewelry", "gold", "pırlanta", "gümüş"],
    topicSeeds: ["{hizmet} Satan Kuyumcular", "{hizmet} İçin Mücevher Seçenekleri", "Kuyumcu Karşılaştırma"],
    intentWeights: makeIntentWeights(0.25, 0.35, 0.35, 0.05),
    size: ["bireysel alım için", "toptan/kurumsal alım için"],
    providerCueExtra: ["kuyumcu", "mağaza"],
    phraseExamples: [
      "… satan güvenilir kuyumcular hangileri?",
      "… almak istiyorum, hangi kuyumcuyu önerirsin?",
      "… fiyat ve işçiliği karşılaştırırsan hangileri öne çıkar?",
    ],
  },
  {
    id: "food_restaurant",
    label: "Gıda ve Restoran",
    matchKeywords: ["restoran", "restaurant", "yemek", "food", "cafe", "kafe", "catering"],
    topicSeeds: ["{hizmet} Veren Restoranlar", "{hizmet} İçin Mekanlar", "Restoran/Cafe Karşılaştırma"],
    intentWeights: makeIntentWeights(0.1, 0.45, 0.4, 0.05),
    size: ["bireysel/çift kişilik için", "grup/etkinlik için"],
    providerCueExtra: ["restoran", "mekan", "cafe"],
    phraseExamples: [
      "… için en iyi restoranlar/mekanlar hangileri?",
      "… için bir yer/catering arıyorum.",
      "… lezzet ve hizmeti karşılaştırırsan hangileri öne çıkar?",
    ],
  },
];

function buildPack(seed: PackSeed): SectorPack {
  return {
    id: seed.id,
    label: seed.label,
    matchKeywords: seed.matchKeywords,
    topicSeeds: seed.topicSeeds,
    intentWeights: seed.intentWeights,
    intentOrder: INTENT_ORDER,
    formWeights: SHARED_FORM_WEIGHTS,
    formOrder: SHARED_FORM_ORDER,
    compat: SHARED_COMPAT,
    modifierPool: { city: SHARED_CITY, budget: SHARED_BUDGET, size: seed.size, urgency: SHARED_URGENCY, segment: [] },
    providerCues: Array.from(new Set([...SHARED_PROVIDER_CUES, ...(seed.providerCueExtra ?? [])])),
    phraseExamples: seed.phraseExamples,
    fallbackTemplates: SHARED_FALLBACK_TEMPLATES,
  };
}

/** "Genel (yedek)" — E2's fallback row (0.20/0.40/0.25/0.15), used when no sector pack
 * matches. This is the pack every brand gets until/unless one of the 10 named packs above
 * matches its industry — see matchSectorPack() below. */
export const DEFAULT_SECTOR_PACK: SectorPack = buildPack({
  id: "default",
  label: "Genel (varsayılan)",
  matchKeywords: [],
  topicSeeds: [],
  intentWeights: makeIntentWeights(0.2, 0.4, 0.25, 0.15),
  size: ["küçük işletmeler için", "KOBİ'ler için", "kurumsal firmalar için"],
  phraseExamples: [
    "… için en iyi seçenekler hangileri?",
    "… konusunda güvenilir bir sağlayıcı arıyorum.",
    "… karşılaştırırsan hangileri öne çıkar?",
  ],
});

const SECTOR_PACKS: Record<string, SectorPack> = {
  default: DEFAULT_SECTOR_PACK,
  ...Object.fromEntries(PACK_SEEDS.map((s) => [s.id, buildPack(s)])),
};

export function getSectorPack(id?: string | null): SectorPack {
  if (id && SECTOR_PACKS[id]) return SECTOR_PACKS[id];
  return DEFAULT_SECTOR_PACK;
}

export function listSectorPacks(): SectorPack[] {
  return Object.values(SECTOR_PACKS);
}

/** Turkish-aware lowercase — plain .toLowerCase() mishandles İ/I in some engines. */
function trLower(s: string): string {
  return s.replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();
}

/**
 * E3 of the methodology: match the brand's industry+description against each pack's
 * matchKeywords; first pack with a hit wins (ties broken by PACK_SEEDS order). Falls back to
 * the Genel pack when nothing matches — this app doesn't yet do the embedding-similarity
 * fallback step (E3.2) since keyword matching alone covers the 10 shipped packs' intent, and
 * adding a second silent fallback layer isn't worth the extra embedding API call per
 * onboarding run; keyword match → Genel is the honest two-step version of E3 today.
 */
export function matchSectorPack(industry: string, description: string): SectorPack {
  const haystack = trLower(`${industry} ${description}`);
  for (const pack of PACK_SEEDS) {
    if (pack.matchKeywords.some((kw) => haystack.includes(trLower(kw)))) {
      return getSectorPack(pack.id);
    }
  }
  return DEFAULT_SECTOR_PACK;
}

/** Fills a pack's "{hizmet}" topic-seed placeholders with the brand's own industry/product
 * label — the one piece of per-brand substitution the spec's YAML implies but doesn't fully
 * mechanize. */
export function renderTopicSeeds(pack: SectorPack, hizmetLabel: string): string[] {
  const label = hizmetLabel.trim() || "Hizmet";
  return pack.topicSeeds.map((s) => s.replace(/\{hizmet\}/g, label));
}
