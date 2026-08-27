import type { EngineId } from "@/types";

/**
 * Demo-mode response generator. Produces a plausible, structured AI-answer-style
 * paragraph mentioning the tracked brand and 1-2 competitors with source links,
 * so the GEO dashboard is fully explorable before any API keys are configured.
 * This is clearly labeled as simulated data everywhere it's surfaced in the UI.
 */
export function simulateResponse(
  promptText: string,
  engine: EngineId,
  brandName: string,
  brandDomain: string,
  competitors: { name: string; domain: string }[]
): { text: string; model: string } {
  const seed = hashString(promptText + engine + brandName);
  const rng = mulberry32(seed);

  const pool = [brandName, ...competitors.map((c) => c.name)];
  const mentionedCount = 1 + Math.floor(rng() * pool.length);
  const shuffled = [...pool].sort(() => rng() - 0.5).slice(0, mentionedCount);
  const brandMentioned = shuffled.includes(brandName);
  if (!brandMentioned && rng() > 0.4) shuffled.push(brandName); // ~60% chance to still include it

  const domainByName: Record<string, string> = { [brandName]: brandDomain };
  for (const c of competitors) domainByName[c.name] = c.domain;

  const openings = [
    "Based on current reviews and comparisons,",
    "Several options stand out here.",
    "Here's a breakdown of the top choices:",
    "Looking at recent analyses,",
  ];

  const lines = shuffled.map((name) => {
    const domain = domainByName[name] ?? `${name.toLowerCase().replace(/\s+/g, "")}.com`;
    const praiseWords = ["well-regarded", "widely used", "a strong option", "frequently recommended", "solid for most use cases"];
    const praise = praiseWords[Math.floor(rng() * praiseWords.length)];
    return `**${name}** (${domain}) is ${praise} for this — see [${domain}](https://${domain}).`;
  });

  const model =
    engine === "openai" ? "gpt-4o (simulated)" :
    engine === "anthropic" ? "claude-sonnet-4-5 (simulated)" :
    engine === "google" ? "gemini-2.5-flash (simulated)" :
    "sonar (simulated)";

  const text = `${openings[Math.floor(rng() * openings.length)]}\n\n${lines.join("\n\n")}\n\n[DEMO DATA — connect a real API key in .env to replace this with a live model response]`;

  return { text, model };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
