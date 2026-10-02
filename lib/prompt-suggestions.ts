import type { EngineId } from "@/types";
import { PROVIDERS, isDemoMode, runFast } from "@/lib/geo-providers";
import { extractJsonObject } from "@/lib/llm-json";
import { PERSONA_LABEL, type Form, type Intent, type PersonaKey, type SectorPack } from "@/lib/sector-packs";
import type { SlotSpec } from "@/lib/slot-planner";
import { cropToLimit, dedupAcrossTopics, fallbackPromptText, hardFilterReasons, qualityScore, selectPromptsForTopic, type FilterContext } from "@/lib/prompt-filter";

/**
 * Auto-generated GEO test prompts from just a brand name + domain (+ competitors) —
 * closes the "blank page" problem of /geo: a new user with nothing to test yet.
 * Mirrors Peec AI's profile-driven prompt-suggestion engine (their real dashboard
 * generates tracking prompts from a brand profile the same way), grounded in this
 * session's own comparison against arvow.com and Peec's actual project data.
 */

interface BrandRef {
  name: string;
  domain: string;
}

export interface PromptSuggestion {
  topic: string;
  text: string;
  branded: boolean;
}

const PREFERRED_ORDER: EngineId[] = ["anthropic", "openai", "google", "perplexity", "deepseek", "xai"];

function pickProvider() {
  for (const id of PREFERRED_ORDER) {
    const p = PROVIDERS[id];
    if (p.isConfigured()) return p;
  }
  return null;
}

function buildSuggestionPrompt(brand: BrandRef, competitors: BrandRef[]): string {
  const lines: string[] = [];
  lines.push(
    `You are helping set up AI-visibility (GEO) tracking for the brand "${brand.name}" (${brand.domain}).`
  );
  if (competitors.length > 0) {
    lines.push(`Known competitors: ${competitors.map((c) => `${c.name} (${c.domain})`).join(", ")}.`);
  }
  lines.push("");
  lines.push(
    "Generate 8 realistic questions a potential customer might ask an AI assistant (ChatGPT, Claude, Gemini, Perplexity) while researching this category — the kind of prompts a real GEO-tracking tool (like Peec AI) would suggest from a brand profile."
  );
  lines.push(
    "Mix branded prompts (naming the brand directly, e.g. comparisons or trust questions) with non-branded discovery prompts (someone who has never heard of the brand, just researching the category/problem) — aim for roughly 2-3 branded and 5-6 non-branded."
  );
  lines.push("Write every prompt in Turkish, natural phrasing a real person would type.");
  lines.push("");
  lines.push(
    `Respond with ONLY a JSON array, no markdown fences, no commentary, of exactly 8 objects matching this shape:
[{"topic": "short Turkish category label (e.g. Fiyat, Karşılaştırma, Güvenilirlik, Nasıl kullanılır, Alternatifler, Genel)", "text": "the prompt itself", "branded": true or false}]`
  );
  return lines.join("\n");
}

function extractJsonArray(text: string): any[] {
  let cleaned = text.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) cleaned = fence[1].trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    throw new Error("not an array");
  } catch {
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        const parsed = JSON.parse(cleaned.slice(start, end + 1));
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // fall through to the throw below
      }
    }
    throw new Error("Model response wasn't a valid JSON array — try again.");
  }
}

function demoSuggestions(brand: BrandRef, competitors: BrandRef[]): PromptSuggestion[] {
  const competitor = competitors[0]?.name;
  const suggestions: PromptSuggestion[] = [
    { topic: "Genel", text: `${brand.name} nedir, ne işe yarar?`, branded: true },
    { topic: "Güvenilirlik", text: `${brand.name} güvenilir mi?`, branded: true },
    { topic: "Fiyat", text: `${brand.name} ücretsiz mi, fiyatlandırması nasıl?`, branded: true },
    {
      topic: "Karşılaştırma",
      text: competitor ? `${brand.name} ile ${competitor} arasındaki fark ne?` : `${brand.name}'e alternatif olarak ne önerirsiniz?`,
      branded: true,
    },
    { topic: "Nasıl kullanılır", text: `${brand.name} nasıl kullanılır, kuruluma ihtiyaç var mı?`, branded: true },
    { topic: "Keşif", text: "Bu alanda en iyi araçlar/markalar hangileri?", branded: false },
    { topic: "Keşif", text: "Bu konuda araştırma yaparken nelere dikkat etmeliyim?", branded: false },
    { topic: "Yorumlar", text: `${brand.name} hakkında kullanıcı yorumları nasıl?`, branded: true },
  ];
  return suggestions;
}

/**
 * Step C of the methodology ("LLM slotları doldurur") + Step D ("Filtre ve seçim — kod, LLM
 * yok", Kart 15): lib/slot-planner.ts has ALREADY decided exactly what each prompt needs to
 * be — its topic, intent, persona and form, plus which modifiers to weave in. For each slot
 * the LLM writes TWO alternative sentences (C — a fast/cheap model, temperature 0.7, since
 * this is bulk volume and every candidate still has to survive code-side filtering anyway);
 * lib/prompt-filter.ts's hard filters + within-topic de-dup + MMR then pick the ONE winner
 * per slot (D1-D3), a single retry call re-fills any slot that came up empty, and the sector
 * pack's fallback template (D4) is the last resort if even the retry fails. This is what
 * keeps the intent/persona/form distribution identical across every customer, instead of
 * depending on whatever an unconstrained "write me 8 prompts" call happens to produce.
 */
export interface SlotFilledPrompt {
  topic: string;
  text: string;
  branded: boolean;
  intent: Intent;
  persona: PersonaKey;
  form: Form;
  modifiers: string[];
  /** Internal ranking signal (D3's quality score) — carried through so cross-topic dedup
   * (D2) and the plan-limit crop (D5) can compare prompts; not meant to be a user-facing
   * star rating, just an ordering key. */
  quality: number;
  /** True only when D4's code-authored template had to be used because neither the first
   * call nor the single retry produced anything that survived filtering — rare, but shown
   * so it's never silently indistinguishable from a real LLM sentence. */
  fallback: boolean;
}

export interface BrandProfileRef {
  name: string;
  domain: string;
  description?: string;
  industry?: string;
  productTags?: string[];
}

/** C's system+user prompt (concatenated into one string — this app's LlmProvider.run()
 * takes a single prompt, no separate system/user roles), asking for 2 candidates per slot. */
function buildSlotFillPrompt(
  brand: BrandProfileRef,
  competitors: { name: string }[],
  topicName: string,
  topicDescription: string,
  slots: SlotSpec[],
  pack: SectorPack,
  language: "tr" | "en",
  country: string
): string {
  const lang = language === "en" ? "English" : "Turkish";
  const system = [
    `You write realistic questions that real people type into AI assistants (ChatGPT, Gemini, Perplexity). These questions are used to measure which brands the AI recommends. You will receive a list of SLOTS; for EACH slot write exactly 2 alternative prompts that satisfy every attribute of that slot.`,
    `Global rules:`,
    `- Language: ${lang}, natural conversational style of a native speaker in ${country}. Correct characters (ç, ğ, ı, İ, ö, ş, ü) if writing Turkish. No keyword-style phrasing.`,
    `- Max 200 characters. No quotes, no numbering, no emojis.`,
    `- NEVER mention the brand (${brand.name}) or any competitor${competitors.length > 0 ? ` (${competitors.map((c) => c.name).join(", ")})` : ""}.`,
    `- Every prompt must be answerable with a recommendation of companies/providers/products, so that the AI answer naturally names brands.`,
    `Intent rules:`,
    `- informational: user wants to understand the topic, BUT must also ask which providers/companies/tools stand out.`,
    `- commercial: asks for recommendations, the best options, comparisons or alternatives.`,
    `- transactional: wants to buy/hire/get a quote now; mention a concrete action, price or budget.`,
    `- instructional: how to do something, AND asks which service/tool/provider to use.`,
    `Persona rules:`,
    `- simple: 6-14 words, casual, at most 1 context detail.`,
    `- informed: 12-25 words, names a specific need/feature, 1-2 context details.`,
    `- researcher: 18-35 words, criteria/trade-offs/comparison, 2-3 context details.`,
    `Form rules:`,
    `- question: ends with "?"`,
    `- need: first-person need ("... arıyorum.", "... istiyorum.")`,
    `- imperative: a direct request ("... bul.", "... listele.", "... öner.")`,
    `Use the given modifiers naturally; do not add other specific facts you invent.`,
    `Return ONLY JSON matching the schema.`,
  ].join("\n");

  const user = [
    `Brand context (for relevance only, do not mention the brand):`,
    `- What the brand does: ${brand.description || "(not provided)"}`,
    `- Industry: ${brand.industry || "(not provided)"}`,
    `- Products/services: ${(brand.productTags ?? []).join(", ") || "(not provided)"}`,
    `Topic: ${topicName}${topicDescription ? ` — ${topicDescription}` : ""}`,
    `Example phrasings for this sector (style reference, do not copy): ${JSON.stringify(pack.phraseExamples)}`,
    `Slots:`,
    JSON.stringify(
      slots.map((s, i) => ({ slot_id: i + 1, intent: s.intent, persona: s.persona, form: s.form, modifiers: s.modifiers }))
    ),
    `Respond with ONLY a JSON object, no markdown fences, no commentary, matching exactly:`,
    `{"prompts": [{"slot_id": 1, "candidates": ["...", "..."]}]}`,
  ].join("\n");

  return `${system}\n\n---\n\n${user}`;
}

function demoCandidatesForSlots(topicName: string, slots: SlotSpec[]): string[][] {
  return slots.map((slot) => [
    `[DEMO DATA] ${topicName} (${slot.intent}/${PERSONA_LABEL[slot.persona]}) için gerçek bir prompt üretmek üzere bir model API anahtarı bağlanmalı.`,
    `[DEMO DATA] ${topicName} için ikinci aday — gerçek üretim bir model API anahtarı gerektirir.`,
  ]);
}

/** Strips the cosmetic junk the system prompt already asks the model to avoid (wrapping
 * quotes, "1. "-style numbering) in case it slips through anyway — cheap insurance before
 * the real D1 hard filters run. */
function sanitizeCandidate(raw: string): string {
  return raw
    .trim()
    .replace(/^[\d]+[.)]\s*/, "")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .trim();
}

/** One LLM call per topic requesting 2 candidates/slot (C), via the fast/cheap model at
 * temperature 0.7 — never the flagship models the real GEO test uses. Parses the
 * slot_id-keyed response back into slot order (falls back to positional index if a slot_id
 * is missing/out of range, rather than dropping the candidates). */
async function generateCandidatesForTopic(
  brand: BrandProfileRef,
  competitors: { name: string }[],
  topicName: string,
  topicDescription: string,
  slots: SlotSpec[],
  pack: SectorPack,
  language: "tr" | "en",
  country: string
): Promise<{ candidatesBySlot: string[][]; demoMode: boolean; model: string }> {
  if (isDemoMode()) {
    return { candidatesBySlot: demoCandidatesForSlots(topicName, slots), demoMode: true, model: "demo (no API key configured)" };
  }
  const prompt = buildSlotFillPrompt(brand, competitors, topicName, topicDescription, slots, pack, language, country);
  const result = await runFast(prompt, 0.7);
  if (!result) {
    return { candidatesBySlot: demoCandidatesForSlots(topicName, slots), demoMode: true, model: "demo (no API key configured)" };
  }
  const parsed = extractJsonObject(result.text);
  const rawPrompts: any[] = Array.isArray(parsed.prompts) ? parsed.prompts : [];
  const candidatesBySlot: string[][] = slots.map(() => []);
  rawPrompts.forEach((entry, idx) => {
    const slotId = Number(entry?.slot_id);
    const targetIdx = Number.isInteger(slotId) && slotId >= 1 && slotId <= slots.length ? slotId - 1 : idx;
    if (targetIdx < 0 || targetIdx >= slots.length) return;
    const candidates = Array.isArray(entry?.candidates) ? entry.candidates : [];
    candidatesBySlot[targetIdx] = candidates.filter((c: unknown) => typeof c === "string" && c.trim()).map((c: string) => sanitizeCandidate(c));
  });
  return { candidatesBySlot, demoMode: false, model: result.model };
}

export interface FillSlotsOptions {
  brand: BrandProfileRef;
  competitors: { name: string; domain?: string }[];
  /** topic name -> its planned slots (lib/slot-planner.ts's output, grouped). */
  slotsByTopic: Map<string, SlotSpec[]>;
  /** topic name -> its description, for generation context — optional, omit for "more
   * prompts for an existing topic" style calls where only the name is known. */
  topicDescriptions?: Map<string, string>;
  pack: SectorPack;
  language?: "tr" | "en";
  country?: string;
  /** D5's package limit — omit to keep every planned slot's prompt (topics.length × 8). */
  limit?: number;
}

/**
 * Orchestrates C+D across every topic's slot plan in parallel (one generation call per
 * topic), then appends the code-templated branded topic (step B6 — zero LLM calls,
 * deterministic patterns, never selected by default since it inflates visibility rather
 * than measuring it honestly).
 */
export async function fillAllSlots(opts: FillSlotsOptions): Promise<{ prompts: SlotFilledPrompt[]; demoMode: boolean; model: string }> {
  const { brand, pack } = opts;
  const language = opts.language ?? "tr";
  const country = opts.country ?? "Türkiye";
  const excludedNames = [brand.name, brand.domain.replace(/^www\./, "").split(".")[0], ...opts.competitors.map((c) => c.name)];
  const filterCtx: FilterContext = { language, excludedNames, pack };

  const entries = Array.from(opts.slotsByTopic.entries());

  const perTopic = await Promise.all(
    entries.map(async ([topicName, slots]) => {
      const topicDescription = opts.topicDescriptions?.get(topicName) ?? "";
      const gen = await generateCandidatesForTopic(brand, opts.competitors, topicName, topicDescription, slots, pack, language, country);

      // Demo-mode placeholder text is never meant to satisfy D1's hard filters (it doesn't
      // read like a real prompt at all) — running it through the filter/MMR/fallback
      // pipeline would silently replace the clearly-labeled "[DEMO DATA]" text with the
      // fallback template, which LOOKS like real generated content. Demo mode always skips
      // straight to its own labeled output instead, same convention as every other
      // generator in this app (lib/topic-generator.ts, lib/brand-discovery.ts).
      if (gen.demoMode) {
        const prompts: SlotFilledPrompt[] = slots.map((slot, i) => ({
          topic: topicName,
          text: gen.candidatesBySlot[i]?.[0] ?? `[DEMO DATA] ${topicName} için gerçek bir prompt üretmek üzere bir model API anahtarı bağlanmalı.`,
          branded: false,
          intent: slot.intent,
          persona: slot.persona,
          form: slot.form,
          modifiers: slot.modifiers,
          quality: 0.5,
          fallback: false,
        }));
        return { prompts, demoMode: true, model: gen.model };
      }

      const selection = await selectPromptsForTopic({ topic: topicName, slots, candidatesBySlot: gen.candidatesBySlot }, filterCtx);

      // D4: one retry call, scoped to only the slots that came up empty.
      const emptyIndices = selection.selected.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
      let retryGen: { candidatesBySlot: string[][]; demoMode: boolean; model: string } | null = null;
      if (emptyIndices.length > 0 && !gen.demoMode) {
        const retrySlots = emptyIndices.map((i) => slots[i]);
        retryGen = await generateCandidatesForTopic(brand, opts.competitors, topicName, topicDescription, retrySlots, pack, language, country);
        emptyIndices.forEach((slotIdx, retryIdx) => {
          const candidates = (retryGen!.candidatesBySlot[retryIdx] ?? []).filter((t) => hardFilterReasons(t, slots[slotIdx], filterCtx).length === 0);
          if (candidates.length > 0) {
            const best = candidates.reduce((a, b) => (qualityScore(a, slots[slotIdx]) >= qualityScore(b, slots[slotIdx]) ? a : b));
            selection.selected[slotIdx] = { slotIndex: slotIdx, text: best, quality: qualityScore(best, slots[slotIdx]), hardFilterPassed: true, failReasons: [] };
          }
        });
      }

      const prompts: SlotFilledPrompt[] = slots.map((slot, i) => {
        const picked = selection.selected[i];
        if (picked) {
          return { topic: topicName, text: picked.text, branded: false, intent: slot.intent, persona: slot.persona, form: slot.form, modifiers: slot.modifiers, quality: picked.quality, fallback: false };
        }
        // D4 final fallback — neither the first call nor the retry produced anything usable.
        const text = fallbackPromptText(pack, slot, brand.industry ?? "", topicName);
        return { topic: topicName, text, branded: false, intent: slot.intent, persona: slot.persona, form: slot.form, modifiers: slot.modifiers, quality: qualityScore(text, slot), fallback: true };
      });

      return { prompts, demoMode: gen.demoMode, model: gen.model };
    })
  );

  let prompts = perTopic.flatMap((r) => r.prompts);
  const demoMode = perTopic.some((r) => r.demoMode);
  const model = perTopic.find((r) => !r.demoMode)?.model ?? perTopic[0]?.model ?? "demo (no API key configured)";

  // D2's cross-topic pass — runs once across every topic's winners. A dropped item falls
  // back to its template rather than a second LLM round-trip (documented in
  // lib/prompt-filter.ts's dedupAcrossTopics doc comment as a deliberate scope limit).
  if (!demoMode && prompts.length > 1) {
    const { droppedIndices } = await dedupAcrossTopics(prompts);
    if (droppedIndices.size > 0) {
      prompts = prompts.map((p, i) => {
        if (!droppedIndices.has(i)) return p;
        const slot: SlotSpec = { topic: p.topic, intent: p.intent, persona: p.persona, form: p.form, modifiers: p.modifiers };
        const text = fallbackPromptText(pack, slot, brand.industry ?? "", p.topic);
        return { ...p, text, fallback: true, quality: qualityScore(text, slot) };
      });
    }
  }

  // D5: package-limit crop, guaranteeing at least 1 prompt per (topic, intent).
  if (opts.limit != null) {
    prompts = cropToLimit(prompts, opts.limit);
  }

  return { prompts, demoMode, model };
}

const BRANDED_TOPIC_SUFFIX = "Hakkında";

/** B6 of the methodology: a separate "[Marka] Hakkında" topic, 6 fixed-pattern prompts,
 * `branded: true` — entirely code-templated, no LLM call, because the patterns are already
 * fully specified and don't need creative variation. Returned so the wizard CAN offer it,
 * but it is never pre-selected (naming the brand directly inflates visibility rather than
 * measuring real discovery, same caution as lib/brand-discovery.ts's competitor warning). */
export function generateBrandedTopicPrompts(brand: BrandRef, competitors: BrandRef[]): SlotFilledPrompt[] {
  const topic = `${brand.name} ${BRANDED_TOPIC_SUFFIX}`;
  const competitor = competitors[0]?.name;
  const items: Array<{ text: string; intent: Intent; persona: PersonaKey; form: Form }> = [
    { text: `${brand.name} güvenilir mi?`, intent: "informational", persona: "simple", form: "question" },
    { text: `${brand.name} hakkında ne düşünüyorsun?`, intent: "informational", persona: "simple", form: "question" },
    {
      text: competitor ? `${brand.name} ile ${competitor} arasındaki fark ne?` : `${brand.name}'in rakiplerinden farkı ne?`,
      intent: "commercial",
      persona: "informed",
      form: "question",
    },
    { text: `${brand.name}'e alternatif olarak ne önerirsin?`, intent: "commercial", persona: "informed", form: "need" },
    { text: `${brand.name} hakkında kullanıcı yorumları nasıl?`, intent: "informational", persona: "researcher", form: "question" },
    { text: `${brand.name} ile çalışmadan önce nelere dikkat etmeliyim?`, intent: "commercial", persona: "researcher", form: "need" },
  ];
  return items.map((item) => ({ topic, branded: true, modifiers: [], quality: 1, fallback: false, ...item }));
}

export async function generatePromptSuggestions(
  brand: BrandRef,
  competitors: BrandRef[]
): Promise<{ suggestions: PromptSuggestion[]; demoMode: boolean; model: string }> {
  const provider = isDemoMode() ? null : pickProvider();
  if (!provider) {
    return { suggestions: demoSuggestions(brand, competitors), demoMode: true, model: "demo (no API key configured)" };
  }

  const prompt = buildSuggestionPrompt(brand, competitors);
  const { text, model } = await provider.run(prompt);
  const parsed = extractJsonArray(text);

  const suggestions = parsed
    .filter((item) => item && typeof item.text === "string" && item.text.trim().length >= 3)
    .map((item) => ({
      topic: typeof item.topic === "string" && item.topic.trim() ? item.topic.trim() : "Genel",
      text: String(item.text).trim(),
      branded: Boolean(item.branded),
    }));

  if (suggestions.length === 0) {
    throw new Error("Model didn't return any usable prompt suggestions — try again.");
  }

  return { suggestions, demoMode: false, model };
}
