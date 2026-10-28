import { jsonrepair } from "jsonrepair";

/**
 * Shared "pull the JSON object/array out of a raw LLM response" helpers — strips markdown
 * code fences first, falls back to slicing between the first/last bracket when the model
 * added stray commentary, and finally runs jsonrepair (fixes truncated output, unescaped
 * quotes/newlines, trailing commas). Used by the onboarding auto-setup chain and others.
 */

function stripFence(text: string): string {
  const cleaned = text.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)(```|$)/i);
  return fence ? fence[1].trim() : cleaned;
}

function parseLoose(text: string, open: "{" | "["): unknown {
  const cleaned = stripFence(text);
  const close = open === "{" ? "}" : "]";
  const start = cleaned.indexOf(open);
  const body = start > 0 ? cleaned.slice(start) : cleaned;
  const end = body.lastIndexOf(close);
  const candidates = [cleaned, body, ...(end > 0 ? [body.slice(0, end + 1)] : [])];
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      /* sıradaki */
    }
  }
  for (const c of [body, ...(end > 0 ? [body.slice(0, end + 1)] : [])]) {
    try {
      return JSON.parse(jsonrepair(c));
    } catch {
      /* sıradaki */
    }
  }
  return undefined;
}

export function extractJsonArray(text: string): any[] {
  const v = parseLoose(text, "[");
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") {
    const firstArr = Object.values(v as Record<string, unknown>).find(Array.isArray);
    if (firstArr) return firstArr as any[];
  }
  throw new Error("Yapay zekâ yanıtı okunamadı (geçersiz JSON) — tekrar dene.");
}

export function extractJsonObject(text: string): Record<string, any> {
  const v = parseLoose(text, "{");
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, any>;
  throw new Error("Yapay zekâ yanıtı okunamadı (geçersiz JSON) — tekrar dene.");
}

const RETRY_NOTE =
  "\n\nIMPORTANT: Reply with ONE valid JSON value only — no markdown fences, no commentary. Escape every double quote inside strings and keep the output compact.";

/**
 * Modeli çağırır, JSON'u çıkarır; okunamazsa bir kez daha (daha sıkı talimatla) dener.
 * `call` ek talimatı prompt'un sonuna eklemelidir.
 */
export async function runForJsonObject(call: (extra: string) => Promise<{ text: string; model: string }>): Promise<{ parsed: Record<string, any>; model: string }> {
  const first = await call("");
  try {
    return { parsed: extractJsonObject(first.text), model: first.model };
  } catch {
    const second = await call(RETRY_NOTE);
    return { parsed: extractJsonObject(second.text), model: second.model };
  }
}

export async function runForJsonArray(call: (extra: string) => Promise<{ text: string; model: string }>): Promise<{ parsed: any[]; model: string }> {
  const first = await call("");
  try {
    return { parsed: extractJsonArray(first.text), model: first.model };
  } catch {
    const second = await call(RETRY_NOTE);
    return { parsed: extractJsonArray(second.text), model: second.model };
  }
}
