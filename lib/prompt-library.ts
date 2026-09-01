export type PromptCategory =
  | "technical-fix"
  | "axo"
  | "schema"
  | "geo-citation"
  | "content-brief"
  | "internal-linking"
  | "programmatic-seo"
  | "golden-content";

export const CATEGORY_LABEL: Record<PromptCategory, string> = {
  "technical-fix": "Technical SEO",
  axo: "AI Crawler Access (AXO)",
  schema: "Schema / Structured Data",
  "geo-citation": "GEO / LLM Citations",
  "content-brief": "Content Briefs",
  "internal-linking": "Internal Linking",
  "programmatic-seo": "Programmatic SEO",
  "golden-content": "Priority Content",
};

export interface PromptTemplate {
  id: string;
  category: PromptCategory;
  title: string;
  description: string;
  prompt: string;
}

/**
 * A curated library of prompts meant to be pasted into Claude Code (or any coding
 * agent with shell + file access) running inside a website's own repo — the same
 * "agent does the SEO work directly on the codebase" pattern popularized by tools
 * like Arvow's Claude Code SEO workflows, written from scratch for Epicsem and, where
 * marked, wired to actually consume a real Epicsem audit/gap-analysis result instead
 * of asking the agent to re-discover everything from zero.
 *
 * These are meant to be edited before use — the bracketed [placeholders] are exactly
 * that. None of this replaces Epicsem's own audit/GEO/gap tools; it's the next step
 * after them: turning findings into code changes without hand-writing every diff.
 */
export const PROMPT_LIBRARY: PromptTemplate[] = [
  {
    id: "technical-audit-fix",
    category: "technical-fix",
    title: "Technical SEO audit + fix",
    description:
      "Point this at any website codebase. The agent crawls the route/page structure itself, finds the standard technical issues, and fixes the ones that are safe to fix without a human decision.",
    prompt: `You are doing a technical SEO pass on this codebase. Work in this order:

1. Discover the page/route structure (framework-appropriate: app/pages router, static site generator config, or plain HTML files — inspect the repo first, don't assume).
2. For every page, check: <title> present and under 60 chars, meta description present and under 160 chars, exactly one <h1>, heading hierarchy doesn't skip levels, canonical tag present and self-referencing (or correctly pointing at a canonical variant), images have alt text, no orphaned pages missing from the sitemap.
3. Check robots.txt and the sitemap.xml (or sitemap index) exist, are valid, and are not accidentally blocking real crawlers.
4. Group findings into: (a) safe to auto-fix (missing alt text, missing meta description scaffolding, malformed heading order), (b) needs a human decision (title/meta copy rewrites, canonical strategy changes, content restructuring).
5. Fix everything in group (a) directly in the code. For group (b), write a short markdown report at the repo root (SEO_AUDIT_FINDINGS.md) listing each issue, the file/line, and a recommended fix — but don't apply it.
6. Run the project's existing build/lint/test commands (check package.json or equivalent) after your changes to confirm nothing broke.

Do not invent facts about the site's content, business, or audience — every fix must be derivable from the code and content already in the repo.`,
  },
  {
    id: "axo-crawler-access",
    category: "axo",
    title: "AI crawler access repair (AXO)",
    description:
      "Specifically for the failure mode Epicsem's /audit and /monitor catch: robots.txt or a WAF/CDN rule silently blocking GPTBot, ClaudeBot, PerplexityBot, or Google-Extended.",
    prompt: `Check whether this site's robots.txt, meta robots tags, or any CDN/WAF config file in this repo (Cloudflare rules, nginx config, vercel.json, netlify.toml, etc.) blocks any of these AI crawler user-agents: GPTBot, ChatGPT-User, ClaudeBot, anthropic-ai, PerplexityBot, Google-Extended, CCBot, Bytespider, Amazonbot.

1. List every place in the repo that references robots.txt rules, User-Agent blocks, or bot-blocking middleware.
2. For each AI crawler above, determine: allowed, blocked, or not mentioned (which usually means allowed, unless there's a catch-all Disallow).
3. If any of them are blocked and there's no comment/commit message explaining why, flag it — this is very often accidental (a copy-pasted robots.txt template, or a "block all bots except these two" rule that predates these crawlers existing).
4. Propose the minimal robots.txt diff to allow all of the above while leaving any deliberate blocks (scrapers, known-bad bots) untouched. Show the diff, don't apply it automatically — this is a business decision (some sites deliberately block AI training crawlers even while wanting search/answer-engine visibility; ClaudeBot/GPTBot/PerplexityBot vs. training-only crawlers like CCBot/Bytespider are not the same tradeoff).
5. If the site is on a platform where robots.txt isn't the actual enforcement point (Cloudflare Bot Fight Mode, a WAF managed rule, etc.), say so explicitly and point to where that setting actually lives instead of just editing a robots.txt that isn't the real blocker.`,
  },
  {
    id: "schema-generator",
    category: "schema",
    title: "JSON-LD schema generator for a page type",
    description:
      "Generates and wires in real structured data (Organization, Article, FAQPage, Product, BreadcrumbList) from a page's own content — the same principle as Epicsem's audit Fixes: nothing invented, only what's already on the page.",
    prompt: `For [paste a URL or a file path to the page component], generate JSON-LD structured data:

1. Read the page's actual rendered content — headings, body text, any existing FAQ-style Q&A, breadcrumb trail, author/date info, price/availability if it's a product page.
2. Decide the correct schema type(s): Article for a blog post, Product for a product page, FAQPage only if there is genuine Q&A content already on the page (don't invent questions), Organization for the site-wide identity, BreadcrumbList if there's a visible breadcrumb nav.
3. Write the JSON-LD using only facts present on the page or in the site's existing config (company name, logo URL, sameAs social profiles if already linked elsewhere in the codebase). Never fabricate a rating, review count, price, or availability that isn't actually shown.
4. Wire it into the page using whatever pattern the rest of the codebase already uses for <head> injection (check 2-3 other pages first for the convention — a Next.js <Script type="application/ld+json">, a Helmet call, a static <script> tag, etc.) rather than introducing a new pattern.
5. Validate the JSON-LD is syntactically correct (parse it as JSON before finishing) and show the final snippet.`,
  },
  {
    id: "llm-citation-gap",
    category: "geo-citation",
    title: "LLM citation reverse-engineering",
    description:
      "Takes Epicsem's own /geo or /gap output (paste the JSON or the on-screen results) and works out, page by page, what a competitor's cited page has that yours doesn't.",
    prompt: `I ran a GEO visibility test in Epicsem and here are the results (paste the JSON export or a summary of: which prompts my brand [BRAND] won/lost, which competitor domains got cited instead, and the source-distribution breakdown):

[PASTE EPICSEM GEO/GAP RESULTS HERE]

For each prompt where a competitor was cited and I wasn't:
1. Fetch or describe (if you have access) the competitor's cited page.
2. Compare its structure against my closest equivalent page in this repo: does it answer the question in the first 1-2 sentences (vs. burying the answer), does it use a table/list/FAQ format the prompt is asking for, does it cite its own sources, is it noticeably more specific/recent/first-hand than mine?
3. Write a short, concrete diff for my page: not "add more content" but "add a comparison table with these 4 columns" or "answer the exact question in the H1/first paragraph instead of the third paragraph."
4. Prioritize by how many lost prompts each fix would plausibly help with — one structural fix (e.g., "always answer-first") usually explains several losses at once, do that first.

Do not guess at the competitor's actual traffic or rankings — this is about content structure and citation-worthiness, which is directly observable, not about numbers you don't have.`,
  },
  {
    id: "content-brief-from-gap",
    category: "content-brief",
    title: "Turn a gap analysis into a content brief",
    description:
      "Feeds Epicsem's /gap page's own Content Briefs section (the prompts a page is losing + the audit's content gaps) into a structured brief the agent can then draft from — this is the step Arvow's reviewers complained produces \"thin\" content when skipped.",
    prompt: `Here is one content brief from an Epicsem gap analysis run — a page that's technically fine but isn't winning AI citations yet:

[PASTE ONE CONTENT BRIEF: url, verdict, contentGaps, suggestedHeadings]

Using only this brief and the page's own existing content (read the actual current page first):
1. Propose a heading structure that leads with a direct, complete answer to the strongest "suggested heading" prompt in the first paragraph under the H1 — not after three paragraphs of preamble.
2. For each contentGap listed, write the specific paragraph, table, or FAQ entry that closes it — grounded in facts already established elsewhere in this codebase/site (product specs, pricing already shown elsewhere, docs already written), never invented statistics or claims.
3. Where a gap requires a fact this repo doesn't have (a stat, a case study number, a third-party comparison), leave a clearly marked [NEEDS: specific fact] placeholder instead of making one up — a wrong invented number is worse than an honest gap.
4. Keep the byline/tone consistent with 2-3 other existing pages on this site (read them first) rather than introducing a new voice.
5. Output the final draft as ready-to-review markdown, not a live edit — a human should read this once before it goes anywhere near a CMS.`,
  },
  {
    id: "internal-linking-audit",
    category: "internal-linking",
    title: "Internal linking / orphan page audit",
    description:
      "Finds pages with no (or very few) internal links pointing to them — the single highest-leverage, purely-mechanical SEO fix, and one a coding agent can actually verify correctly by reading the whole codebase.",
    prompt: `Build a map of every page/route in this site and every internal link between them:

1. Enumerate all pages (from the router config, a content directory, or a sitemap file — whichever this repo actually has).
2. Search the codebase for every internal <a href> / <Link> / equivalent, and build a from-page -> to-page link graph.
3. Identify orphan pages (zero incoming internal links) and near-orphans (only linked from one place, e.g. only the sitemap, or only a footer that's easy to miss).
4. For each orphan/near-orphan, suggest 2-3 specific existing pages that should link to it, with the exact anchor text and where in that page's content the link would fit naturally (not just "add it to the footer") — base this on actual topical relevance between the pages' real content, not just alphabetical proximity.
5. Also flag the reverse problem: any page with an unusually large number of internal links pointing at it relative to the rest of the site (possible sign of it being over-optimized as a link-dump, or — more often — the correct hub page, which is worth confirming rather than flagging as wrong).
6. Output a table: orphan page | suggested source page | suggested anchor text | why (one line).`,
  },
  {
    id: "programmatic-seo-pages",
    category: "programmatic-seo",
    title: "Programmatic SEO page set (from real data only)",
    description:
      "For scaling a page template across a list of entities — cities, integrations, comparisons — grounded strictly in structured data that already exists in the repo, not generated filler.",
    prompt: `I want to generate a page for each item in [this data file / this array / this list — point at the actual data source, e.g. a JSON file of cities, integrations, or products in this repo].

1. First find or design a single page template component that has real, distinct content slots (not just a title swap) — at minimum: a specific fact or two unique to that entity, not just the entity's name substituted into a generic paragraph.
2. Check what data is actually available per entity in this repo/data source. List which template slots CAN be filled with real, distinct data and which ones would currently only have generic boilerplate.
3. For any slot that would be generic/thin, either: propose where real per-entity data could realistically be sourced (an API this repo already calls, a CSV the user could supply), or explicitly recommend cutting that slot rather than shipping thin, near-duplicate pages — thin programmatic pages are the single most common reason this tactic backfires (duplicate-content penalties, wasted crawl budget).
4. Generate the actual pages only for the entities where the result would be genuinely distinct, not the full list by default.
5. Include a canonical/noindex recommendation for any borderline-thin pages you do generate, so they don't compete against each other in search.`,
  },
  {
    id: "golden-content-piece",
    category: "golden-content",
    title: "Golden content piece for one priority keyword",
    description:
      "One comprehensive, answer-first, citation-worthy page for a single high-priority keyword or question — the deliberate opposite of the programmatic-scale prompt above: quality over breadth for the terms that matter most.",
    prompt: `Target keyword/question: [paste one specific, high-priority keyword or the exact question your customers ask]

Before writing anything:
1. Search this repo for everything already written on this topic (existing pages, docs, README sections, past blog posts) so the new piece doesn't duplicate or contradict them.
2. List the sub-questions a genuinely complete answer needs to cover (think: what would make an AI answer engine or a search user say "this fully answered it, I don't need to check another source").

Then draft the page:
3. Open with a direct, complete answer to the core question in the first 2-3 sentences — no throat-clearing intro.
4. Cover every sub-question from step 2, each under its own heading, in the order a reader would actually need them.
5. Use tables/comparison formats wherever the content is inherently comparative — this is measurably what gets pulled into AI-generated answers over prose paragraphs saying the same thing.
6. Every specific claim, number, or comparison must trace back to something already true and documented in this repo/site (product specs, pricing, docs) or be marked [NEEDS: source] — do not invent statistics, benchmarks, or "studies show" claims.
7. End with an FAQ section only if it adds genuinely new sub-questions not already covered above (don't pad with restated content just to have an FAQ block).
8. Output as markdown, and separately propose the JSON-LD schema for it (see the schema-generator prompt above) once the content is final.`,
  },
];

export function getPromptsByCategory(): Record<PromptCategory, PromptTemplate[]> {
  const grouped = {} as Record<PromptCategory, PromptTemplate[]>;
  for (const p of PROMPT_LIBRARY) {
    if (!grouped[p.category]) grouped[p.category] = [];
    grouped[p.category].push(p);
  }
  return grouped;
}
