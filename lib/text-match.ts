// Shared Turkish-aware text matching — used wherever the app has to decide "does this text
// name this brand?" (GEO response analysis, branded-prompt detection, share-of-voice).
//
// Kart: Marka tespiti (Overview/Domain/URL metrics spec, Section 2):
//  - case-insensitive, Turkish-aware casefold (JS's own .toLowerCase() already maps İ→i and I→ı
//    correctly for the tr locale in V8/Node — unlike Python's naive lower() — but we still
//    centralize it here as trLower() so every call site is explicit and consistent).
//  - Turkish possessive/case suffixes can attach directly to a brand name with an apostrophe:
//    "İşbank'ın", "Garanti BBVA'dan" — \b{ad}(?:['’]\w+)?\b catches the bare name AND the
//    suffixed form without also matching an unrelated longer word that happens to start the
//    same way.
//  - A brand name that is also an ordinary dictionary word ("Mikro", "Logo") MUST use word
//    boundaries (\b) — otherwise "mikrobiyoloji" or "logolu" would count as a mention.

export function trLower(s: string): string {
  return s.replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Builds the case-insensitive, Turkish-suffix-aware regex for one brand name or alias. */
function buildNameRegex(name: string): RegExp | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  // Match on the Turkish-casefolded form so İ/I fold correctly, then run the regex with "i"
  // (not "iu") since the subject string passed to .test()/.match() is pre-folded by the caller.
  const escaped = escapeRegExp(trLower(trimmed));
  return new RegExp(`\\b${escaped}(?:['’]\\w+)?\\b`, "i");
}

export interface BrandNames {
  name: string;
  aliases?: string[];
}

/** All name regexes for a brand (its tracked name + any aliases), pre-built once per call. */
function buildBrandRegexes(brand: BrandNames): RegExp[] {
  const names = [brand.name, ...(brand.aliases ?? [])];
  return names.map(buildNameRegex).filter((r): r is RegExp => r !== null);
}

/** Does `text` name this brand (by its tracked name or any alias)? Turkish-aware, suffix-aware,
 * word-boundary-safe so dictionary-word brand names don't false-positive on unrelated words. */
export function brandMentioned(text: string, brand: BrandNames): boolean {
  const folded = trLower(text);
  return buildBrandRegexes(brand).some((re) => re.test(folded));
}

/** Index (0-based) of this brand's first mention within `orderedNames` — names as they appear
 * in response order (e.g. bold-markdown matches or capitalized phrases), Turkish-aware. */
export function findBrandIndex(orderedNames: string[], brand: BrandNames): number {
  const regexes = buildBrandRegexes(brand);
  return orderedNames.findIndex((n) => {
    const folded = trLower(n);
    return regexes.some((re) => re.test(folded));
  });
}
