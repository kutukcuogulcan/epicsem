/**
 * Fan-out: motorun cevapta zaten gönderdiği arama sorgularını çıkarır (ek AI çağrısı yok).
 * ChatGPT: output[].type="web_search_call" → action.query / action.queries; Claude: content[].type="server_tool_use"
 * (name web_search) → input.query; Gemini: candidates[0].groundingMetadata.webSearchQueries.
 */
export function extractSearchQueries(engine: "openai" | "anthropic" | "google", data: any): string[] {
  const raw: unknown[] =
    engine === "openai"
      ? (Array.isArray(data?.output) ? data.output : []).filter((o: any) => o?.type === "web_search_call").flatMap((o: any) => [o?.action?.query, ...(Array.isArray(o?.action?.queries) ? o.action.queries : [])])
      : engine === "anthropic"
        ? (Array.isArray(data?.content) ? data.content : []).filter((c: any) => c?.type === "server_tool_use" && c?.name === "web_search").map((c: any) => c?.input?.query)
        : (data?.candidates?.[0]?.groundingMetadata?.webSearchQueries ?? []);
  const seen = new Set<string>();
  return raw
    .map((q) => String(q ?? "").trim())
    .filter((q) => q.length > 1 && !seen.has(q.toLocaleLowerCase("tr")) && seen.add(q.toLocaleLowerCase("tr")))
    .slice(0, 12);
}
