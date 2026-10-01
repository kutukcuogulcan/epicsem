import type { EngineId } from "@/types";
import { PROVIDERS, isDemoMode } from "@/lib/geo-providers";
import { extractJsonArray as extractJsonArrayShared } from "@/lib/llm-json";
import { PERSONA_LABEL, PERSONA_STYLE, type Form, type Intent, type PersonaKey } from "@/lib/sector-packs";
import type { SlotSpec } from "@/lib/slot-planner";

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
 * Step C of the methodology ("LLM slotları doldurur"): lib/slot-planner.ts has ALREADY
 * decided exactly what each prompt needs to be — its topic, intent, persona and form, plus
 * which modifiers to weave in. The LLM's only job here is writing ONE natural sentence per
 * slot that satisfies those constraints; it never chooses the mix itself. This is what keeps
 * the intent/persona/form distribution identical across every customer, instead of depending
 * on whatever an unconstrained "write me 8 prompts" call happens to produce.
 */
export interface SlotFilledPrompt {
  topic: string;
  text: string;
  branded: boolean;
  intent: Intent;
  persona: PersonaKey;
  form: Form;
}

const FORM_LABEL: Record<Form, string> = {
  question: "a direct question",
  need: "a need/want statement (not phrased as a question)",
  imperative: "an imperative/command (e.g. \"recommend me...\", \"find me...\")",
};

function buildSlotFillPrompt(brand: BrandRef, competitors: BrandRef[], topicName: string, slots: SlotSpec[], language: "tr" | "en"): string {
  const lang = language === "en" ? "English" : "Turkish";
  const lines: string[] = [];
  lines.push(
    `You are a copywriter generating AI-visibility (GEO) tracking prompts for the brand "${brand.name}" (${brand.domain}), topic: "${topicName}".`
  );
  if (competitors.length > 0) {
    lines.push(`Known competitors (do not name the brand itself or any competitor in these prompts — they're non-branded discovery prompts): ${competitors.map((c) => c.name).join(", ")}.`);
  }
  lines.push("");
  lines.push(
    `Every decision about WHAT to generate has already been made by code — your only job is writing the sentence for each numbered slot below, in ${lang}, satisfying ALL of its constraints exactly. Do not add, remove, or reinterpret constraints.`
  );
  lines.push("");
  slots.forEach((slot, i) => {
    const style = PERSONA_STYLE[slot.persona];
    lines.push(
      `${i + 1}. Intent: ${slot.intent}. Sentence form: ${FORM_LABEL[slot.form]}. Persona voice: ${PERSONA_LABEL[slot.persona]} — ${style.tone}, ${style.minWords}-${style.maxWords} words. ${
        slot.modifiers.length > 0 ? `Naturally weave in these specifics: ${slot.modifiers.join(", ")}.` : "No specific modifiers required."
      }`
    );
  });
  lines.push("");
  lines.push(
    `Respond with ONLY a JSON array, no markdown fences, no commentary, of exactly ${slots.length} strings in the SAME ORDER as the numbered list above — one sentence per slot:`
  );
  lines.push(`["slot 1 sentence", "slot 2 sentence", ...]`);
  return lines.join("\n");
}

function demoSlotFill(brand: BrandRef, topicName: string, slots: SlotSpec[]): string[] {
  return slots.map((slot) => `[DEMO DATA] ${topicName} (${slot.intent}/${PERSONA_LABEL[slot.persona]}) için gerçek bir prompt üretmek üzere bir model API anahtarı bağlanmalı.`);
}

/** Fills every slot for ONE topic in a single call (one call per topic, run in parallel
 * across topics by the caller — "LLM, paralel" in the methodology). */
async function fillSlotsForTopic(
  brand: BrandRef,
  competitors: BrandRef[],
  topicName: string,
  slots: SlotSpec[],
  language: "tr" | "en"
): Promise<{ prompts: SlotFilledPrompt[]; demoMode: boolean; model: string }> {
  const provider = isDemoMode() ? null : pickProvider();
  if (!provider) {
    const texts = demoSlotFill(brand, topicName, slots);
    return {
      prompts: slots.map((s, i) => ({ topic: topicName, text: texts[i], branded: false, intent: s.intent, persona: s.persona, form: s.form })),
      demoMode: true,
      model: "demo (no API key configured)",
    };
  }

  const prompt = buildSlotFillPrompt(brand, competitors, topicName, slots, language);
  const { text, model } = await provider.run(prompt);
  const parsed = extractJsonArrayShared(text);

  const prompts: SlotFilledPrompt[] = slots.map((s, i) => ({
    topic: topicName,
    text: typeof parsed[i] === "string" && parsed[i].trim() ? String(parsed[i]).trim() : `[NEEDS: ${topicName} için prompt üretilemedi, tekrar deneyin]`,
    branded: false,
    intent: s.intent,
    persona: s.persona,
    form: s.form,
  }));

  return { prompts, demoMode: false, model };
}

/** Orchestrates step C across every topic's slot plan in parallel, then appends the
 * code-templated branded topic (step B6 — zero LLM calls, deterministic patterns, never
 * selected by default since it inflates visibility rather than measuring it honestly). */
export async function fillAllSlots(
  brand: BrandRef,
  competitors: BrandRef[],
  slotsByTopic: Map<string, SlotSpec[]>,
  language: "tr" | "en" = "tr"
): Promise<{ prompts: SlotFilledPrompt[]; demoMode: boolean; model: string }> {
  const entries = Array.from(slotsByTopic.entries());
  const results = await Promise.all(entries.map(([topicName, slots]) => fillSlotsForTopic(brand, competitors, topicName, slots, language)));

  const prompts = results.flatMap((r) => r.prompts);
  const demoMode = results.some((r) => r.demoMode);
  const model = results.find((r) => !r.demoMode)?.model ?? results[0]?.model ?? "demo (no API key configured)";

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
  return items.map((item) => ({ topic, branded: true, ...item }));
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
