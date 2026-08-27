// Lightweight response analyzer: brand mention detection, position, naive sentiment,
// and citation extraction from a raw AI-answer text.
// (Production upgrade path: replace the sentiment heuristic with an LLM-as-judge call.)

const POSITIVE_WORDS = [
  "best", "excellent", "great", "strong", "leading", "top", "trusted", "reliable",
  "recommended", "popular", "innovative", "well-regarded", "solid", "outstanding",
  "efficient", "affordable", "user-friendly", "praised",
];
const NEGATIVE_WORDS = [
  "poor", "weak", "expensive", "limited", "outdated", "unreliable", "complicated",
  "confusing", "lacking", "issues", "problems", "criticized", "disappointing", "buggy",
];

export interface AnalyzedResponse {
  mentioned: boolean;
  position: number | null;
  sentiment: number | null;
  citations: { url: string; domain: string; isOwnDomain: boolean }[];
}

export function analyzeResponse(text: string, brandName: string, brandDomain: string): AnalyzedResponse {
  const lowerText = text.toLowerCase();
  const nameVariants = [brandName.toLowerCase(), brandDomain.toLowerCase().replace(/^www\./, "")];
  const mentioned = nameVariants.some((v) => lowerText.includes(v));

  let position: number | null = null;
  if (mentioned) {
    // crude "position" proxy: rank by first-mention order among **bolded** names or capitalized names
    const boldMatches = Array.from(text.matchAll(/\*\*([^*]+)\*\*/g)).map((m) => m[1].trim());
    const namesInOrder = boldMatches.length > 0 ? boldMatches : extractCapitalizedPhrases(text);
    const idx = namesInOrder.findIndex((n) => n.toLowerCase().includes(brandName.toLowerCase()));
    position = idx >= 0 ? idx + 1 : 1;
  }

  const sentiment = mentioned ? scoreSentiment(extractSentenceWindow(text, brandName)) : null;

  const citations = extractCitations(text, brandDomain);

  return { mentioned, position, sentiment, citations };
}

function extractSentenceWindow(text: string, brandName: string): string {
  const idx = text.toLowerCase().indexOf(brandName.toLowerCase());
  if (idx === -1) return text;
  const start = Math.max(0, idx - 120);
  const end = Math.min(text.length, idx + 200);
  return text.slice(start, end);
}

function scoreSentiment(window: string): number {
  const lower = window.toLowerCase();
  let score = 70; // neutral-positive baseline (most brand mentions in AI answers are neutral-to-favorable)
  for (const w of POSITIVE_WORDS) if (lower.includes(w)) score += 4;
  for (const w of NEGATIVE_WORDS) if (lower.includes(w)) score -= 6;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function extractCapitalizedPhrases(text: string): string[] {
  const matches = text.match(/\b([A-Z][a-zA-Z0-9]+(?:\s[A-Z][a-zA-Z0-9]+)*)\b/g) ?? [];
  return Array.from(new Set(matches));
}

function extractCitations(text: string, brandDomain: string): { url: string; domain: string; isOwnDomain: boolean }[] {
  const urlRegex = /https?:\/\/[^\s)\]]+/g;
  const found = text.match(urlRegex) ?? [];
  const seen = new Set<string>();
  const results: { url: string; domain: string; isOwnDomain: boolean }[] = [];
  for (const url of found) {
    const cleaned = url.replace(/[.,)]+$/, "");
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    try {
      const domain = new URL(cleaned).hostname.replace(/^www\./, "");
      results.push({ url: cleaned, domain, isOwnDomain: domain === brandDomain.replace(/^www\./, "") });
    } catch {
      // skip malformed URL
    }
  }
  return results;
}
