import { CATEGORY_LABEL, getPromptsByCategory, type PromptCategory } from "@/lib/prompt-library";
import PromptBlock from "@/components/PromptBlock";

export const metadata = {
  title: "Claude Code SEO Prompts — Epicsem",
  description:
    "A free library of Claude Code prompts for technical SEO, AXO crawler access, schema, GEO citation gaps, and content briefs — grounded in real audit data, not generic templates.",
};

export default function PromptsPage() {
  const grouped = getPromptsByCategory();
  const categories = Object.keys(grouped) as PromptCategory[];

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Claude Code SEO Prompts</h1>
        <p className="text-ink/60 text-sm max-w-3xl">
          A free library of prompts for running SEO work directly inside your website's own codebase with Claude
          Code (or any coding agent with shell + file access) — technical fixes, AI crawler access, schema
          generation, GEO citation gaps, content briefs, internal linking, and more. Every prompt is built to stay
          grounded in what's actually in your repo — no invented statistics, no thin auto-generated pages.
        </p>
        <p className="text-ink/40 text-xs max-w-3xl">
          These are static templates you fill in yourself. For a prompt pre-filled with your own real findings, run
          an <a href="/audit" className="text-accent hover:underline">audit</a> or a{" "}
          <a href="/gap" className="text-accent hover:underline">gap analysis</a> first — both have a "Fix with
          Claude Code" button that generates one from that specific result.
        </p>
      </div>

      {categories.map((cat) => (
        <div key={cat} className="space-y-3">
          <h2 className="font-medium text-lg">{CATEGORY_LABEL[cat]}</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {grouped[cat].map((p) => (
              <PromptBlock key={p.id} title={p.title} description={p.description} prompt={p.prompt} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
