/**
 * Yanlış bilgi tespiti (Peec "Facts" karşılığı): AI cevaplarında markayla ilgili söylenenleri
 * projenin Bilgi Bankası'yla karşılaştırır. Doğru kabul edilen tek kaynak Bilgi Bankası'dır;
 * orada yazmayan bir konu hakkında "yanlış" denmez.
 *
 * Uydurma yok: modelin döndürdüğü her bulgu, alıntıladığı AI cümlesi cevapta ve dayandığı
 * Bilgi Bankası cümlesi bilgi bankasında gerçekten geçiyorsa tutulur (keepVerified).
 */

export interface FactAnswer {
  engine: string;
  prompt: string;
  text: string;
}

export interface FactIssue {
  engine: string;
  prompt: string;
  /** AI cevabındaki yanlış cümle (cevaptan birebir). */
  claim: string;
  /** Bilgi Bankası'ndaki doğru bilgi (bilgi bankasından birebir). */
  truth: string;
  /** Kısa açıklama: ne yanlış. */
  why: string;
}

export function factCheckPrompt(brand: string, knowledge: string, answers: FactAnswer[]): string {
  return `You are a strict fact checker for the brand "${brand}".
SOURCE OF TRUTH (the brand's own knowledge base):
"""
${knowledge.slice(0, 8000)}
"""

AI ASSISTANT ANSWERS (numbered):
${answers.map((a, i) => `[${i}] ${a.text.slice(0, 2500)}`).join("\n\n")}

Find statements about "${brand}" in the answers that CONTRADICT the source of truth (wrong price, wrong feature, wrong founding year, wrong location, says a product/feature does not exist when it does, etc.).
Rules:
- Only report a contradiction if the source of truth explicitly states the opposite. If the source of truth says nothing about it, do NOT report it.
- Ignore statements about other brands, opinions and vague wording.
- "claim" must be copied EXACTLY, character for character, from the answer (one sentence or part of it).
- "truth" must be copied EXACTLY from the source of truth.
- "why": one short sentence in Turkish explaining the difference.
Return ONLY JSON: {"issues":[{"answer":0,"claim":"...","truth":"...","why":"..."}]} — empty list if nothing contradicts.`;
}

const norm = (s: string) => s.toLocaleLowerCase("tr").replace(/[“”"']/g, "").replace(/\s+/g, " ").trim();

/** Modelin bulgularından yalnızca alıntıları gerçekten geçenleri tutar; tekrarları atar. */
export function keepVerified(raw: unknown, answers: FactAnswer[], knowledge: string): FactIssue[] {
  const kb = norm(knowledge);
  const out: FactIssue[] = [];
  for (const x of Array.isArray(raw) ? raw : []) {
    const a = answers[Number((x as any)?.answer)];
    const claim = String((x as any)?.claim ?? "").trim();
    const truth = String((x as any)?.truth ?? "").trim();
    if (!a || claim.length < 8 || truth.length < 3) continue;
    if (!norm(a.text).includes(norm(claim)) || !kb.includes(norm(truth))) continue;
    if (out.some((o) => norm(o.claim) === norm(claim) && o.engine === a.engine)) continue;
    out.push({ engine: a.engine, prompt: a.prompt, claim: claim.slice(0, 400), truth: truth.slice(0, 400), why: String((x as any)?.why ?? "").trim().slice(0, 300) });
  }
  return out;
}
