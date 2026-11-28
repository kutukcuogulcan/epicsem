import type { GeoRunResult } from "../types";

/**
 * Peec tarzı soru önerisi: son testte AI motorlarının cevap yazarken yaptığı aramalar (fan-out) ve takip edilen sorulardan,
 * henüz takip edilmeyen konularda gerçek kullanıcı soruları (1 AI sorgusu, test başına bir kez).
 */
export interface PromptSuggestion {
  text: string;
  topic: string;
  why: string;
}

export function suggestionPrompt(brand: string, runs: GeoRunResult[], competitors: string[], language = "tr"): string {
  const tracked = [...new Set(runs.map((r) => r.promptText))];
  const topics = [...new Set(runs.map((r) => r.topic || "Genel"))];
  const searches = [...new Set(runs.flatMap((r) => r.searchQueries ?? []))].slice(0, 40);
  return `You help a brand choose which questions to track in AI assistants (ChatGPT, Claude, Gemini, Perplexity), like Peec's prompt suggestions.
Brand: ${brand}. Competitors: ${competitors.join(", ") || "—"}. Language of the questions: ${language === "tr" ? "Turkish" : language}.
Already tracked questions (do NOT repeat or paraphrase these):
${tracked.map((q) => `- ${q}`).join("\n")}
Current topics: ${topics.join(", ")}.
Web searches the AI engines actually made while answering the tracked questions (real demand signals):
${searches.length ? searches.map((q) => `- ${q}`).join("\n") : "- (none recorded)"}

Suggest 6–10 NEW questions a real customer would type into an AI assistant in this category, that are NOT covered by the tracked list. Prefer the subtopics visible in the AI searches above (price, comparison, specific needs, location, alternatives). Questions must be natural, specific, and must NOT contain the brand name ${brand} (unbranded discovery questions). Group each under an existing topic or a short new topic name.
Return ONLY JSON: {"suggestions":[{"text":"question","topic":"topic","why":"one short reason, e.g. which AI search or gap it comes from"}]}`;
}

const norm = (s: string) => s.toLocaleLowerCase("tr").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** AI cevabını doğrular: boş, çok kısa, markayı içeren ve zaten takip edilen sorular atılır. */
export function parseSuggestions(raw: Record<string, unknown>, brand: string, tracked: string[]): PromptSuggestion[] {
  const seen = new Set(tracked.map(norm));
  const b = norm(brand);
  const out: PromptSuggestion[] = [];
  for (const x of Array.isArray(raw.suggestions) ? raw.suggestions : []) {
    const text = String((x as any)?.text ?? "").trim().slice(0, 300);
    const n = norm(text);
    if (text.length < 12 || seen.has(n) || (b && n.includes(b))) continue;
    seen.add(n);
    out.push({ text, topic: String((x as any)?.topic ?? "Genel").trim().slice(0, 60) || "Genel", why: String((x as any)?.why ?? "").trim().slice(0, 200) });
  }
  return out.slice(0, 10);
}
