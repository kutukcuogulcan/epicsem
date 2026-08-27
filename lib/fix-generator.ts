import type { CheerioAPI } from "cheerio";
import type { GeneratedFaqItem, GeneratedFix } from "@/types";

/**
 * Deterministic, no-API-key-needed "fix" generation. Everything here is built from
 * content that already exists on the page — nothing is invented. If there isn't
 * enough real material to work with (e.g. no question-shaped headings for FAQ schema),
 * the generator says so instead of fabricating filler content.
 */

const MAX_META_LENGTH = 155;

export function generateMetaDescription($: CheerioAPI, title: string | null): GeneratedFix | null {
  // Prefer the first substantial paragraph — closest thing to a real summary a human wrote.
  let source = "";
  $("p").each((_, el) => {
    if (source) return;
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text.length >= 40) source = text;
  });

  if (!source) {
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();
    source = bodyText;
  }

  if (!source) return null;

  let draft = source.length > MAX_META_LENGTH ? source.slice(0, MAX_META_LENGTH) : source;
  if (source.length > MAX_META_LENGTH) {
    const lastSpace = draft.lastIndexOf(" ");
    draft = (lastSpace > 100 ? draft.slice(0, lastSpace) : draft).trim() + "…";
  }

  return {
    kind: "meta-description",
    label: "Draft meta description",
    note: "Built from the page's own first paragraph — read it before publishing, it's a starting point, not final copy.",
    code: draft,
  };
}

export function generateOrganizationSchema(url: string, title: string | null, htmlLang?: string | null): GeneratedFix {
  const parsed = new URL(url);
  const domain = parsed.hostname.replace(/^www\./, "");
  const name = title ? title.split(/[|\-–—]/)[0].trim() : domain;
  const siteUrl = parsed.origin;
  const isTurkish = (htmlLang ?? "").startsWith("tr");

  const code = `{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "${name.replace(/"/g, '\\"')}",
  "url": "${siteUrl}",
  "logo": "${siteUrl}/logo.png"${isTurkish ? ',\n  "areaServed": "TR"' : ""}
}`;

  return {
    kind: "organization-schema",
    label: "Organization JSON-LD",
    note: isTurkish
      ? "Paste inside a <script type=\"application/ld+json\"> tag in <head>. Replace the logo URL with a real one. lang=\"tr\" was detected, so an \"areaServed\": \"TR\" hint was added — remove it if this brand doesn't primarily serve the Turkish market."
      : "Paste inside a <script type=\"application/ld+json\"> tag in <head>. Replace the logo URL with a real one — this is the one field that couldn't be read off the page.",
    code,
  };
}

export function generateFaqSchema($: CheerioAPI): GeneratedFix | null {
  const items: GeneratedFaqItem[] = [];

  $("h2, h3").each((_, el) => {
    const heading = $(el).text().trim();
    if (!heading.endsWith("?")) return;
    const answerParts: string[] = [];
    let sibling = $(el).next();
    let guard = 0;
    while (sibling.length && !/^h[1-3]$/i.test(sibling.prop("tagName") ?? "") && guard < 5) {
      const text = sibling.text().trim();
      if (text) answerParts.push(text);
      sibling = sibling.next();
      guard++;
    }
    const answer = answerParts.join(" ").trim();
    if (answer.length >= 20) items.push({ question: heading, answer });
  });

  if (items.length === 0) return null;

  const code = `{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
${items
  .map(
    (item) => `    {
      "@type": "Question",
      "name": "${item.question.replace(/"/g, '\\"')}",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "${item.answer.replace(/"/g, '\\"').slice(0, 400)}"
      }
    }`
  )
  .join(",\n")}
  ]
}`;

  return {
    kind: "faq-schema",
    label: `FAQPage JSON-LD (${items.length} question${items.length > 1 ? "s" : ""} found on the page)`,
    note: "Extracted from headings on the page that end in \"?\" plus the text right after them — check the answers read well before publishing.",
    code,
  };
}
