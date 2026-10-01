/**
 * Minimal embeddings helper for topic-candidate dedup (lib/topic-generator.ts's A4.2:
 * "ad + açıklama embedding cosine > 0.80 ise skoru düşük olan atılır"). Uses OpenAI's
 * text-embedding-3-small directly (no other configured provider in this app exposes an
 * embeddings endpoint). When OPENAI_API_KEY isn't configured, isEmbeddingAvailable() is
 * false and callers skip the dedup step entirely rather than fail — same demo-mode-friendly
 * degradation as the rest of the app, documented at the call site in topic-generator.ts.
 */

export function isEmbeddingAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: texts }),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings API error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.data as { embedding: number[] }[]).map((d) => d.embedding);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
