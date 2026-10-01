/**
 * Shared "pull the JSON object/array out of a raw LLM response" helpers — strips markdown
 * code fences first, falls back to slicing between the first/last bracket when the model
 * added stray commentary around the JSON. Used by the onboarding auto-setup chain
 * (lib/brand-discovery.ts, lib/topic-generator.ts, lib/prompt-suggestions.ts's topic-grounded
 * generator) so all three LLM calls parse responses the same, forgiving way.
 */

function stripFence(text: string): string {
  const cleaned = text.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fence ? fence[1].trim() : cleaned;
}

export function extractJsonArray(text: string): any[] {
  const cleaned = stripFence(text);
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

export function extractJsonObject(text: string): Record<string, any> {
  const cleaned = stripFence(text);
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    throw new Error("not an object");
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        const parsed = JSON.parse(cleaned.slice(start, end + 1));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
      } catch {
        // fall through to the throw below
      }
    }
    throw new Error("Model response wasn't a valid JSON object — try again.");
  }
}
