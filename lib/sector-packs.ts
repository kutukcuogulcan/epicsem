/**
 * Shared vocabulary + the one shipped "sector pack" for the deterministic slot-planning
 * engine (lib/slot-planner.ts) — per the methodology card: "neyin üretileceğine kod karar
 * verir, LLM sadece cümleyi yazar." A sector pack is sector-specific weights/patterns/
 * modifiers (originally spec'd as YAML); this app ships it as a typed TS constant instead —
 * same content, no new YAML-parsing dependency, and it's type-checked at compile time.
 *
 * Only DEFAULT_PACK is shipped. The spec's "Banka: Kredi Kartları" example was illustrative,
 * not a verified weight set — inventing sector-specific numbers no one has validated would be
 * exactly the kind of fabricated-but-presented-as-real data this app's design principle
 * forbids (see HANDOFF.md §5). Add real sector packs here once their weights are actually
 * defined; SECTOR_PACKS falls back to DEFAULT_PACK for any id it doesn't recognize.
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

/** Prompt-length/context/tone rules per persona — B4 of the methodology. */
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
}

export interface SectorPack {
  id: string;
  label: string;
  /** Seed topic candidates specific to this sector — fed into topic generation as a 4th
   * candidate source (see lib/topic-generator.ts's "sector" source). */
  topicSeeds: string[];
  intentWeights: Record<Intent, number>;
  intentOrder: Intent[];
  formWeights: Record<Form, number>;
  formOrder: Form[];
  /** How well each (intent, persona) pair fits — scales the persona-assignment score in
   * lib/slot-planner.ts. 1.0 = neutral. */
  compat: Record<Intent, Record<PersonaKey, number>>;
  modifierPool: ModifierPool;
}

/** The one real, validated pack this app ships — exactly the weights/example given in the
 * methodology card (ajans example, N=8: informational 1.6→2, commercial 3.6→4,
 * transactional 1.6→1, instructional 1.2→1). */
export const DEFAULT_SECTOR_PACK: SectorPack = {
  id: "default",
  label: "Genel (varsayılan)",
  topicSeeds: [],
  intentWeights: { informational: 0.2, commercial: 0.45, transactional: 0.2, instructional: 0.15 },
  intentOrder: ["informational", "commercial", "transactional", "instructional"],
  formWeights: { question: 0.5, need: 0.3, imperative: 0.2 },
  formOrder: ["question", "need", "imperative"],
  compat: {
    informational: { simple: 1.0, informed: 1.0, researcher: 1.2 },
    commercial: { simple: 1.0, informed: 1.0, researcher: 1.2 },
    transactional: { simple: 1.2, informed: 1.2, researcher: 0.6 },
    instructional: { simple: 1.0, informed: 1.2, researcher: 0.8 },
  },
  modifierPool: {
    city: ["İstanbul", "Ankara", "İzmir", "Türkiye'de"],
    budget: ["sınırlı bir bütçeyle", "aylık belirli bir bütçeyle", "yüksek bütçeyle"],
    size: ["küçük işletmeler için", "KOBİ'ler için", "kurumsal firmalar için"],
    urgency: ["acil olarak", "bu ay içinde", "yakın zamanda"],
  },
};

const SECTOR_PACKS: Record<string, SectorPack> = {
  default: DEFAULT_SECTOR_PACK,
};

export function getSectorPack(id?: string | null): SectorPack {
  if (id && SECTOR_PACKS[id]) return SECTOR_PACKS[id];
  return DEFAULT_SECTOR_PACK;
}
