import { cosineSimilarity, getEmbeddings, isEmbeddingAvailable } from "@/lib/embeddings";
import { PERSONA_STYLE, type Form, type Intent, type PersonaKey, type SectorPack } from "@/lib/sector-packs";
import type { SlotSpec } from "@/lib/slot-planner";

/**
 * D of the methodology ("Filtre ve seçim — kod, LLM yok", Kart 15): pure-code filtering +
 * MMR selection over the 2 LLM-written candidates per slot (C/Kart 14) — no LLM calls here.
 *
 * Two honest limitations vs. the spec, both documented rather than silently approximated:
 * - D1 rule 2 ("Dil yanlış") wants a real language-ID model (fasttext lid.176). Adding that
 *   dependency for one filter rule isn't worth it; `looksLikeLanguage()` below is a stopword/
 *   character heuristic — same precedent as lib/geo-analyze.ts's own sentiment heuristic.
 * - D2's similarity thresholds (0.88 within-topic, 0.92 cross-topic) and D3's MMR formula
 *   only run when OPENAI_API_KEY is configured (lib/embeddings.ts) — without it, similarity
 *   terms are treated as 0 (no de-dup, selection falls back to pure quality score) rather
 *   than failing the whole pipeline, same graceful-skip convention as lib/topic-generator.ts.
 */

export interface CandidateScored {
  slotIndex: number;
  text: string;
  quality: number;
  hardFilterPassed: boolean;
  failReasons: string[];
}

const TR_STOPWORDS = ["ve", "bir", "için", "ile", "nasıl", "hangi", "en", "bu", "bana", "beni", "mi", "mı", "mu", "mü", "ne", "kim"];
const EN_STOPWORDS = ["the", "a", "for", "with", "how", "which", "best", "this", "what", "who", "recommend", "is"];

function trLower(s: string): string {
  return s.replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** D1 rule 2 — see the file doc comment on why this is a heuristic, not a real language-ID model. */
function looksLikeLanguage(text: string, language: "tr" | "en"): boolean {
  const lower = trLower(text);
  const words = lower.split(/[^\p{L}]+/u).filter(Boolean);
  if (words.length === 0) return false;
  const stopwords = language === "tr" ? TR_STOPWORDS : EN_STOPWORDS;
  const hasStopword = words.some((w) => stopwords.includes(w));
  const hasTurkishChars = /[çğıöşü]/i.test(text);
  if (language === "tr") return hasStopword || hasTurkishChars;
  return hasStopword && !hasTurkishChars;
}

/** D1 rule 3 — brand/competitor name exclusion, Turkish-casefold aware (İ→i, I→ı). */
function mentionsExcludedName(text: string, excludedNames: string[]): boolean {
  const lower = trLower(text);
  return excludedNames.some((name) => {
    const n = trLower(name).trim();
    return n.length > 0 && lower.includes(n);
  });
}

/** D1 rule 4 — informational/instructional prompts must contain a provider-seeking cue. */
function hasProviderCue(text: string, intent: Intent, pack: SectorPack): boolean {
  if (intent !== "informational" && intent !== "instructional") return true;
  const lower = trLower(text);
  return pack.providerCues.some((cue) => lower.includes(trLower(cue)));
}

/** D1 rule 5 — persona word-count range, ±30% tolerance on both ends. */
function withinPersonaLength(text: string, persona: PersonaKey): boolean {
  const style = PERSONA_STYLE[persona];
  const wc = wordCount(text);
  const lo = style.minWords * 0.7;
  const hi = style.maxWords * 1.3;
  return wc >= lo && wc <= hi;
}

/** D1 rule 6 — form pattern: question ends with "?", imperative/need do not. */
function matchesForm(text: string, form: Form): boolean {
  const trimmed = text.trim();
  const endsWithQuestionMark = trimmed.endsWith("?");
  if (form === "question") return endsWithQuestionMark;
  return !endsWithQuestionMark;
}

export interface FilterContext {
  language: "tr" | "en";
  excludedNames: string[]; // brand name + aliases + competitor names
  pack: SectorPack;
}

/** D1: the 6 hard-elimination rules. Returns the violated rule names — empty means it passes. */
export function hardFilterReasons(text: string, slot: SlotSpec, ctx: FilterContext): string[] {
  const reasons: string[] = [];
  if (text.length > 200) reasons.push("too_long");
  if (!looksLikeLanguage(text, ctx.language)) reasons.push("wrong_language");
  if (mentionsExcludedName(text, ctx.excludedNames)) reasons.push("mentions_brand_or_competitor");
  if (!hasProviderCue(text, slot.intent, ctx.pack)) reasons.push("missing_provider_cue");
  if (!withinPersonaLength(text, slot.persona)) reasons.push("persona_length_out_of_range");
  if (!matchesForm(text, slot.form)) reasons.push("form_mismatch");
  return reasons;
}

/** The three named-but-undefined-by-the-spec sub-scores (bağlam/uzunluk/kalıp skoru) — our
 * own reasonable implementation of what each name describes, documented so it's clear these
 * are this app's scoring choices, not numbers the spec itself hands us. */
function contextScore(text: string, slot: SlotSpec): number {
  if (slot.modifiers.length === 0) return 1;
  const lower = trLower(text);
  const hits = slot.modifiers.filter((m) => lower.includes(trLower(m))).length;
  return hits / slot.modifiers.length;
}

function lengthScore(text: string, persona: PersonaKey): number {
  const style = PERSONA_STYLE[persona];
  const mid = (style.minWords + style.maxWords) / 2;
  const halfRange = (style.maxWords - style.minWords) / 2 || 1;
  const wc = wordCount(text);
  return Math.max(0, 1 - Math.abs(wc - mid) / halfRange);
}

function patternScore(text: string, slot: SlotSpec): number {
  // Stricter than the D1 hard check: a "need" form additionally gets credit for actually
  // reading like a first-person need statement, not just "doesn't end in a question mark".
  if (slot.form === "need") {
    const lower = trLower(text);
    const hasNeedVerb = /(arıyorum|istiyorum|ihtiyacım var|arıyoruz|istiyoruz)\s*\.?$/.test(lower.trim());
    return hasNeedVerb ? 1 : 0.6;
  }
  return matchesForm(text, slot.form) ? 1 : 0.6;
}

export function qualityScore(text: string, slot: SlotSpec): number {
  return 0.4 * contextScore(text, slot) + 0.3 * lengthScore(text, slot.persona) + 0.3 * patternScore(text, slot);
}

export interface TopicSelectionInput {
  topic: string;
  slots: SlotSpec[];
  /** candidatesBySlot[i] = the (usually 2) raw LLM-written strings for slots[i]. */
  candidatesBySlot: string[][];
}

export interface TopicSelectionResult {
  /** Index-aligned with `slots` — null means the slot survived no candidate (D4 applies). */
  selected: (CandidateScored | null)[];
}

/**
 * D1 (hard filter) → D2 within-topic near-dup (cosine > 0.88, drop the lower-quality one) →
 * D3 MMR selection, one winner per slot, sequentially so later slots are scored against
 * what's already been picked earlier in the SAME topic (keeps the 8 prompts varied).
 */
export async function selectPromptsForTopic(input: TopicSelectionInput, ctx: FilterContext): Promise<TopicSelectionResult> {
  const { slots, candidatesBySlot } = input;

  // D1: score every surviving candidate; drop hard-filter failures outright.
  const survivorsBySlot: CandidateScored[][] = slots.map((slot, i) =>
    (candidatesBySlot[i] ?? [])
      .filter((t) => typeof t === "string" && t.trim().length > 0)
      .map((text) => {
        const failReasons = hardFilterReasons(text, slot, ctx);
        return { slotIndex: i, text: text.trim(), quality: qualityScore(text, slot), hardFilterPassed: failReasons.length === 0, failReasons };
      })
      .filter((c) => c.hardFilterPassed)
  );

  // D2: within-topic near-duplicate removal across ALL surviving candidates (any slot).
  const flat = survivorsBySlot.flat();
  if (flat.length > 1 && isEmbeddingAvailable()) {
    try {
      const vectors = await getEmbeddings(flat.map((c) => c.text));
      const dropped = new Set<number>();
      for (let i = 0; i < flat.length; i++) {
        if (dropped.has(i)) continue;
        for (let j = i + 1; j < flat.length; j++) {
          if (dropped.has(j)) continue;
          if (cosineSimilarity(vectors[i], vectors[j]) > 0.88) {
            if (flat[i].quality >= flat[j].quality) dropped.add(j);
            else dropped.add(i);
          }
        }
      }
      const keep = new Set(flat.filter((_, i) => !dropped.has(i)).map((c) => c));
      for (const slotList of survivorsBySlot) {
        for (let i = slotList.length - 1; i >= 0; i--) {
          if (!keep.has(slotList[i])) slotList.splice(i, 1);
        }
      }
    } catch {
      // Embedding call failed — skip dedup for this topic rather than fail generation.
    }
  }

  // D3: sequential MMR selection, one winner per slot.
  const selectedTexts: string[] = [];
  let selectedVectors: number[][] = [];
  const canEmbedForMmr = isEmbeddingAvailable();
  const selected: (CandidateScored | null)[] = [];

  for (let i = 0; i < slots.length; i++) {
    const candidates = survivorsBySlot[i];
    if (candidates.length === 0) {
      selected.push(null);
      continue;
    }
    let winner = candidates[0];
    if (candidates.length === 1 || !canEmbedForMmr || selectedVectors.length === 0) {
      winner = candidates.reduce((best, c) => (c.quality > best.quality ? c : best), candidates[0]);
    } else {
      try {
        const vectors = await getEmbeddings(candidates.map((c) => c.text));
        let bestMmr = -Infinity;
        candidates.forEach((c, idx) => {
          const maxSim = selectedVectors.length > 0 ? Math.max(...selectedVectors.map((v) => cosineSimilarity(v, vectors[idx]))) : 0;
          const mmr = 0.7 * c.quality - 0.3 * maxSim;
          if (mmr > bestMmr) {
            bestMmr = mmr;
            winner = c;
          }
        });
      } catch {
        winner = candidates.reduce((best, c) => (c.quality > best.quality ? c : best), candidates[0]);
      }
    }
    selected.push(winner);
    selectedTexts.push(winner.text);
    if (canEmbedForMmr) {
      try {
        selectedVectors = await getEmbeddings(selectedTexts);
      } catch {
        // leave selectedVectors as-is; next iteration just degrades to quality-only picking
      }
    }
  }

  return { selected };
}

/**
 * D2's cross-topic pass (cosine > 0.92, run once across ALL topics' winners) — applied after
 * every topic has already picked its own 8 winners. Drops the lower-quality side of each
 * colliding pair; the caller (lib/prompt-suggestions.ts) is responsible for re-filling that
 * slot via D4 (one retry, then the sector pack's fallback template).
 */
export async function dedupAcrossTopics<T extends { text: string; quality: number }>(items: T[]): Promise<{ kept: T[]; droppedIndices: Set<number> }> {
  const droppedIndices = new Set<number>();
  if (items.length < 2 || !isEmbeddingAvailable()) return { kept: items, droppedIndices };
  try {
    const vectors = await getEmbeddings(items.map((i) => i.text));
    for (let i = 0; i < items.length; i++) {
      if (droppedIndices.has(i)) continue;
      for (let j = i + 1; j < items.length; j++) {
        if (droppedIndices.has(j)) continue;
        if (cosineSimilarity(vectors[i], vectors[j]) > 0.92) {
          if (items[i].quality >= items[j].quality) droppedIndices.add(j);
          else droppedIndices.add(i);
        }
      }
    }
  } catch {
    // skip cross-topic dedup on embedding failure
  }
  return { kept: items.filter((_, i) => !droppedIndices.has(i)), droppedIndices };
}

/** D4's final fallback — only reached when even a 1-slot retry LLM call produced nothing
 * usable. Deterministic, code-authored, always available. */
export function fallbackPromptText(pack: SectorPack, slot: SlotSpec, brandIndustry: string, topicName: string): string {
  const template = pack.fallbackTemplates[slot.intent];
  const modifier = slot.modifiers[0] ?? pack.label;
  return template.replace(/\{modifier\}/g, modifier).replace(/\{kategori\}/g, brandIndustry || pack.label).replace(/\{konu\}/g, topicName);
}

/**
 * D5: package-limit crop. Ranks all final prompts by quality descending but guarantees every
 * (topic, intent) pair keeps at least 1 prompt before trimming the rest down to `limit`.
 */
export function cropToLimit<T extends { topic: string; intent: Intent; quality: number }>(items: T[], limit: number): T[] {
  if (items.length <= limit) return items;
  const sorted = [...items].sort((a, b) => b.quality - a.quality);
  const kept: T[] = [];
  const guaranteed = new Set<string>();
  // First pass: guarantee 1 per (topic, intent).
  for (const item of sorted) {
    const key = `${item.topic}::${item.intent}`;
    if (!guaranteed.has(key) && kept.length < limit) {
      guaranteed.add(key);
      kept.push(item);
    }
  }
  // Second pass: fill remaining slots by quality.
  for (const item of sorted) {
    if (kept.length >= limit) break;
    if (!kept.includes(item)) kept.push(item);
  }
  return kept;
}
