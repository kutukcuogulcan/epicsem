import { PERSONA_ORDER, PERSONA_STYLE, type Form, type Intent, type PersonaKey, type SectorPack } from "@/lib/sector-packs";

/**
 * Deterministic slot planner — ZERO LLM calls. Per the methodology card: "neyin
 * üretileceğine kod karar verir, LLM sadece cümleyi yazar." For each topic this decides
 * exactly 8 slots' (intent, persona, form, modifiers) — the LLM (lib/prompt-suggestions.ts's
 * fillSlots) is only ever asked to write the sentence for an already-fully-specified slot.
 * This is what makes the distribution consistent across customers instead of depending on
 * whatever mix an unconstrained "write me 8 prompts" call happens to produce.
 *
 * lrm() and planSlotsForTopics() are a direct port of the card's Python lrm()/plan_slots() —
 * verified against the card's own worked example (5 topics × 8 = 40 slots, audience
 * 20/50/30 → 8/20/12) in scripts/verify-slot-planner.mjs before shipping.
 */

export interface SlotSpec {
  topic: string;
  intent: Intent;
  persona: PersonaKey;
  form: Form;
  modifiers: string[];
}

/** Largest Remainder Method — splits `n` integer slots across `weights` (which should sum
 * to ~1) as proportionally as floors allow, then hands the leftover slots to whichever keys
 * have the largest fractional remainder (ties: larger weight, then `order` position). */
export function lrm<K extends string>(weights: Record<K, number>, n: number, order: K[]): Record<K, number> {
  const raw: Record<string, number> = {};
  const out: Record<string, number> = {};
  for (const k of order) {
    raw[k] = weights[k] * n;
    out[k] = Math.floor(raw[k]);
  }
  const rest = n - order.reduce((sum, k) => sum + out[k], 0);
  const rank = [...order].sort((a, b) => {
    const remA = raw[a] - out[a];
    const remB = raw[b] - out[b];
    if (remB !== remA) return remB - remA;
    if (weights[b] !== weights[a]) return weights[b] - weights[a];
    return order.indexOf(a) - order.indexOf(b);
  });
  for (let i = 0; i < rest; i++) out[rank[i]] += 1;
  return out as Record<K, number>;
}

function expandCounts<K extends string>(counts: Record<K, number>, order: K[]): K[] {
  const arr: K[] = [];
  for (const k of order) for (let i = 0; i < counts[k]; i++) arr.push(k);
  return arr;
}

/** Best-effort rearrangement so the same value doesn't land back-to-back — greedy, not
 * exhaustive, but sufficient for an 8-item list with at most 4 distinct values. */
function shuffleNoRepeat<K>(items: K[]): K[] {
  const pool = [...items];
  const result: K[] = [];
  while (pool.length > 0) {
    const last = result[result.length - 1];
    let candidateIdx = pool.map((_, i) => i).filter((i) => pool[i] !== last);
    if (candidateIdx.length === 0) candidateIdx = pool.map((_, i) => i);
    const pick = candidateIdx[Math.floor(Math.random() * candidateIdx.length)];
    result.push(pool[pick]);
    pool.splice(pick, 1);
  }
  return result;
}

function pickModifiers(pack: SectorPack, count: number, usageInTopic: Map<string, number>, totalInTopic: { n: number }): string[] {
  const all = [...pack.modifierPool.city, ...pack.modifierPool.budget, ...pack.modifierPool.size, ...pack.modifierPool.urgency];
  const picked: string[] = [];
  for (let i = 0; i < count; i++) {
    const candidates = all.filter((m) => {
      const used = usageInTopic.get(m) ?? 0;
      if (used >= 2) return false; // same value at most 2× per topic
      const projectedTotal = totalInTopic.n + 1;
      if (pack.modifierPool.city.includes(m)) {
        const cityUsed = [...usageInTopic.entries()]
          .filter(([k]) => pack.modifierPool.city.includes(k))
          .reduce((s, [, v]) => s + v, 0);
        if (projectedTotal > 0 && (cityUsed + 1) / projectedTotal > 0.3) return false; // city ≤ 30%
      }
      if (m === "Türkiye'de") {
        if (projectedTotal > 0 && (used + 1) / projectedTotal > 0.4) return false; // "Türkiye'de" ≤ 40%
      }
      return true;
    });
    if (candidates.length === 0) break;
    candidates.sort((a, b) => (usageInTopic.get(a) ?? 0) - (usageInTopic.get(b) ?? 0)); // least-used first
    const chosen = candidates[0];
    picked.push(chosen);
    usageInTopic.set(chosen, (usageInTopic.get(chosen) ?? 0) + 1);
    totalInTopic.n += 1;
  }
  return picked;
}

/**
 * Plans N slots per topic across ALL given topics, in order — persona assignment runs as
 * one continuous counter across the whole list (not reset per topic), so the audience split
 * balances out over the full set rather than forcing every single topic to hit the exact
 * ratio. `audience` is fractions that should sum to ~1 (e.g. {simple:0.2, informed:0.5,
 * researcher:0.3}).
 */
export function planSlotsForTopics(topics: string[], pack: SectorPack, audience: Record<PersonaKey, number>, n = 8): SlotSpec[] {
  const counts: Record<PersonaKey, number> = { simple: 0, informed: 0, researcher: 0 };
  let total = 0;
  const plan: SlotSpec[] = [];

  for (const topicName of topics) {
    const intentCounts = lrm(pack.intentWeights, n, pack.intentOrder);
    const intentSlots = expandCounts(intentCounts, pack.intentOrder);
    const formCounts = lrm(pack.formWeights, n, pack.formOrder);
    const forms = shuffleNoRepeat(expandCounts(formCounts, pack.formOrder));

    const usageInTopic = new Map<string, number>();
    const totalInTopic = { n: 0 };

    intentSlots.forEach((intent, idx) => {
      let bestPersona: PersonaKey = PERSONA_ORDER[0];
      let bestScore = -Infinity;
      for (const p of PERSONA_ORDER) {
        const d = audience[p] * (total + 1) - counts[p];
        const score = d > 0 ? d * pack.compat[intent][p] : d;
        if (score > bestScore) {
          bestScore = score;
          bestPersona = p;
        }
      }
      counts[bestPersona] += 1;
      total += 1;

      const style = PERSONA_STYLE[bestPersona];
      const modCount = style.minModifiers + Math.floor(Math.random() * (style.maxModifiers - style.minModifiers + 1));
      const modifiers = pickModifiers(pack, modCount, usageInTopic, totalInTopic);

      plan.push({ topic: topicName, intent, persona: bestPersona, form: forms[idx], modifiers });
    });
  }

  return plan;
}
