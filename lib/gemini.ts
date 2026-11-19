/**
 * Gemini çağrıları için ortak yardımcı. Google eski modelleri yeni anahtarlara kapatıyor
 * ("models/gemini-2.5-flash is no longer available to new users" → 404). Bu yüzden sabit bir
 * model adı yerine sırayla dener: GEMINI_MODEL (varsa) → istenen model → güncel yedekler.
 * Kapalı çıkan model süreç boyunca bir daha denenmez.
 */

const FALLBACKS = ["gemini-2.5-flash", "gemini-3.8-flash"];
const unavailable = new Set<string>();

export function geminiModelCandidates(preferred?: string): string[] {
  const list = [process.env.GEMINI_MODEL, preferred, ...FALLBACKS].filter((m): m is string => Boolean(m));
  return [...new Set(list)].filter((m) => !unavailable.has(m));
}

/** generateContent çağırır; model kapalıysa (404) sıradakine geçer. Başarılı yanıtın JSON'u ve kullanılan model döner. */
export async function geminiGenerate(body: unknown, opts: { preferred?: string; signal?: AbortSignal } = {}): Promise<{ data: any; model: string }> {
  const key = process.env.GOOGLE_AI_API_KEY ?? "";
  let lastErr = "Gemini modeli bulunamadı";
  for (const model of geminiModelCandidates(opts.preferred)) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
    if (res.status === 404) {
      unavailable.add(model);
      lastErr = `Google AI API error: 404 ${(await res.text()).slice(0, 200)}`;
      continue;
    }
    if (!res.ok) throw new Error(`Google AI API error: ${res.status} ${(await res.text()).slice(0, 300)}`);
    return { data: await res.json(), model };
  }
  throw new Error(lastErr);
}
