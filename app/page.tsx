import Link from "next/link";

const pillars = [
  {
    tag: "SEO",
    color: "text-seo",
    title: "Technical foundation",
    body: "Title/meta, headings, structured data, robots.txt & sitemap, content depth — the classic ranking factors that still gate everything else.",
  },
  {
    tag: "AXO",
    color: "text-accent",
    title: "Agent accessibility",
    body: "Can GPTBot, ClaudeBot, PerplexityBot and Google-Extended actually reach your pages? Most audits skip this; it's checked first here.",
  },
  {
    tag: "AEO",
    color: "text-geo",
    title: "Answer-readiness",
    body: "Answer-first content structure, FAQPage schema, and direct-answer patterns that make a page easy for an LLM to lift and cite.",
  },
  {
    tag: "GEO",
    color: "text-warn",
    title: "AI visibility tracking",
    body: "Run real prompts against ChatGPT, Claude, Gemini and Perplexity. See if you're mentioned, where you rank against competitors, and who gets cited instead.",
  },
];

const gaps = [
  {
    competitor: "Peec AI",
    note: "Strong visibility tracking, but tells you what's happening without telling you how to fix it — no technical audit layer underneath. Self-serve plans also cap tracked models at 3, with paid add-ons per extra engine.",
  },
  {
    competitor: "Seobility",
    note: "GEO features are bolted onto an existing SEO suite; ChatGPT/Gemini tracking is still \"coming soon\" as of this analysis.",
  },
  {
    competitor: "SerpApi",
    note: "Raw AI Overview / search data via API — powerful, but it's infrastructure, not a finished dashboard a marketer can read.",
  },
  {
    competitor: "geo-tool.com / Semust",
    note: "One-off free scores or ads-first dashboards — no combined technical SEO + continuous AI-visibility tracking in one place.",
  },
];

const built = [
  { tag: "Fix layer", body: "Missing meta description, Organization/FAQPage schema — generated from the page's own content, not invented. See /audit → Fixes." },
  { tag: "Gap matrix", body: "Crosses the SEO/AXO audit against real GEO citations per page: cited, blocked, or strong-but-invisible. See /gap." },
  { tag: "Content briefs", body: "The prompts a brand is losing, turned into concrete headings/FAQ targets — closes the loop from diagnosis to what to write next." },
  { tag: "AXO monitoring", body: "Tracks key pages over time and alerts (Slack) the moment a previously-allowed AI crawler gets blocked in robots.txt. See /monitor." },
  { tag: "Multi-client", body: "Save each client's brand/competitors once, reuse across audit/GEO/gap runs, export an Epicsem-branded PDF report. See /clients." },
  { tag: "Uncapped engines", body: "OpenAI, Anthropic, Google, Perplexity are all first-class and included — no per-engine paywall to test the model that actually matters to a client." },
];

export default function Home() {
  return (
    <div className="space-y-16">
      <section className="space-y-4">
        <p className="text-sm uppercase tracking-widest text-ink/40">Basic SEO, extended for the AI era</p>
        <h1 className="text-4xl font-semibold tracking-tight max-w-2xl">
          One score for classic search. One score for whether AI engines even see you.
        </h1>
        <p className="text-ink/60 max-w-2xl">
          Epicsem runs a real technical SEO audit and a real prompt-based AI-visibility test — ChatGPT, Claude,
          Gemini, Perplexity — from the same dashboard, so you're not stitching together four subscriptions to
          answer one question: <em>are we findable, on Google and on AI?</em>
        </p>
        <div className="flex gap-3 pt-2">
          <Link href="/audit" className="rounded-lg bg-accent text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity">
            Run an SEO + AXO audit
          </Link>
          <Link href="/geo" className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
            Test AI visibility
          </Link>
          <Link href="/gap" className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
            Find the gap
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {pillars.map((p) => (
          <div key={p.tag} className="card">
            <div className={`text-xs font-semibold tracking-wide ${p.color}`}>{p.tag}</div>
            <div className="mt-1 font-medium">{p.title}</div>
            <p className="mt-2 text-sm text-ink/60">{p.body}</p>
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Where the existing tools fall short</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {gaps.map((g) => (
            <div key={g.competitor} className="card">
              <div className="font-medium text-sm">{g.competitor}</div>
              <p className="mt-2 text-sm text-ink/60">{g.note}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-ink/40">
          Based on a review of serpapi.com, geo-tool.com, seobility.net's GEO tool, semust.com and Peec AI (Aug 2026).
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">What's actually built to close those gaps</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {built.map((b) => (
            <div key={b.tag} className="card">
              <div className="text-xs font-semibold tracking-wide text-accent">{b.tag}</div>
              <p className="mt-2 text-sm text-ink/60">{b.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
