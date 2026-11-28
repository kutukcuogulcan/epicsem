/**
 * Autoblog anahtar kelime kuyruğu bitince (Arvow'daki "auto keyword research" gibi) yeni konular: mevcut kelimelere ve
 * markaya yakın, henüz yazılmamış aramalar. 1 AI sorgusu; kampanya durmak yerine devam eder.
 */
export function refillPrompt(brand: string, domain: string, existing: string[], language = "tr"): string {
  return `You plan blog topics for ${brand} (${domain}). Their autoblog keyword queue is used up. Existing keywords (already written, do NOT repeat or paraphrase):
${existing.map((k) => `- ${k}`).join("\n")}
Suggest 5 NEW search keywords in ${language === "tr" ? "Turkish" : language} that real people search, closely related to the existing ones and to what ${brand} offers: specific long-tail queries (how-to, cost, comparison, problem/solution), 2–6 words each, no brand names of competitors.
Return ONLY JSON: {"keywords":["...","..."]}`;
}

const norm = (s: string) => s.toLocaleLowerCase("tr").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Geçerli, tekrarsız ve daha önce kullanılmamış en fazla 5 anahtar kelime. */
export function parseRefill(raw: Record<string, unknown>, existing: string[]): string[] {
  const seen = new Set(existing.map(norm));
  const out: string[] = [];
  for (const k of Array.isArray(raw.keywords) ? raw.keywords : []) {
    const kw = String(k ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
    const n = norm(kw);
    if (n.split(" ").length < 2 || seen.has(n)) continue;
    seen.add(n);
    out.push(kw);
  }
  return out.slice(0, 5);
}
