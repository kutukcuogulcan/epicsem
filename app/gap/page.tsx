"use client";

import { useEffect, useMemo, useState } from "react";
import type { EngineId, GapRow, GeoVisibilitySummary } from "@/types";
import type { ContentBrief } from "@/lib/content-brief";
import PromptBlock from "@/components/PromptBlock";
import UsageMeter from "@/components/UsageMeter";
import Breadcrumb from "@/components/Breadcrumb";
import StatCard from "@/components/StatCard";
import { buildContentBriefPrompt } from "@/lib/claude-code-prompt";

const ENGINE_LABEL: Record<EngineId, string> = {
  openai: "ChatGPT (OpenAI)",
  anthropic: "Claude (Anthropic)",
  google: "Gemini (Google)",
  perplexity: "Perplexity",
  deepseek: "DeepSeek",
  xai: "Grok (xAI)",
  meta: "Meta AI (demo only)",
  microsoft: "Copilot (demo only)",
};

const DEFAULT_ENGINES: EngineId[] = ["openai", "anthropic", "google", "perplexity"];

const EN_PROMPT_PRESET = "best tools for [your category]\nhow to choose a [your category] tool\n[brand] vs [competitor]";
const TR_PROMPT_PRESET =
  "[kategori] için en iyi markalar hangileri?\nİstanbul'da [kategori] konusunda hangi firmayı önerirsiniz?\n[marka] güvenilir mi?\n[marka] ile [rakip] arasındaki fark ne?";

const VERDICT_LABEL: Record<GapRow["verdict"], string> = {
  blocked: "Blocked from AI",
  invisible: "Strong but invisible",
  cited: "Cited",
  "needs-work": "Needs work",
};

const VERDICT_BADGE: Record<GapRow["verdict"], string> = {
  blocked: "badge-critical",
  invisible: "badge-info",
  cited: "badge-pass",
  "needs-work": "badge-warning",
};

interface BrandRow {
  name: string;
  domain: string;
}

export default function GapPage() {
  const [brand, setBrand] = useState<BrandRow>({ name: "", domain: "" });
  const [competitors, setCompetitors] = useState<BrandRow[]>([{ name: "", domain: "" }]);
  const [promptsText, setPromptsText] = useState(
    "best tools for [your category]\nhow to choose a [your category] tool\n[brand] vs [competitor]"
  );
  const [pageUrlsText, setPageUrlsText] = useState("");
  const [engines, setEngines] = useState<EngineId[]>(DEFAULT_ENGINES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<GeoVisibilitySummary[] | null>(null);
  const [gapMatrix, setGapMatrix] = useState<GapRow[] | null>(null);
  const [contentBriefs, setContentBriefs] = useState<ContentBrief[] | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [generatingUrl, setGeneratingUrl] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("clientId");
    if (!id) return;
    fetch(`/api/clients/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.client) return;
        setBrand({ name: data.client.name, domain: data.client.domain });
        if (data.client.competitors.length > 0) setCompetitors(data.client.competitors);
        setPageUrlsText(data.client.domain);
      })
      .catch(() => {});
  }, []);

  const prompts = useMemo(
    () => promptsText.split("\n").map((p) => p.trim()).filter(Boolean),
    [promptsText]
  );
  const pageUrls = useMemo(
    () => pageUrlsText.split("\n").map((p) => p.trim()).filter(Boolean),
    [pageUrlsText]
  );

  function updateCompetitor(i: number, field: keyof BrandRow, value: string) {
    setCompetitors((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));
  }

  async function generateArticle(brief: ContentBrief) {
    setGeneratingUrl(brief.url);
    setGenerateError(null);
    try {
      const res = await fetch("/api/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...brief, brandName: brand.name, brandDomain: brand.domain }),
      });
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Content generation failed");
      window.location.href = `/content?draftId=${data.draft.id}`;
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Something went wrong");
      setGeneratingUrl(null);
    }
  }

  async function downloadPdf() {
    if (!gapMatrix) return;
    const res = await fetch("/api/report/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName: brand.name,
        clientDomain: brand.domain,
        geo: summaries ? { summaries } : null,
        gap: { gapMatrix, contentBriefs: contentBriefs ?? [] },
      }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = "epicsem-gap-report.pdf";
    a.click();
    URL.revokeObjectURL(objectUrl);
  }

  async function runAnalysis(e: React.FormEvent) {
    e.preventDefault();
    if (!brand.name || !brand.domain) {
      setError("Enter your brand name and domain.");
      return;
    }
    if (prompts.length === 0) {
      setError("Enter at least one prompt.");
      return;
    }
    if (pageUrls.length === 0) {
      setError("Enter at least one page URL to audit.");
      return;
    }
    if (engines.length === 0) {
      setError("Pick at least one engine.");
      return;
    }
    setLoading(true);
    setError(null);
    setSummaries(null);
    setGapMatrix(null);
    setContentBriefs(null);
    try {
      const res = await fetch("/api/gap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand,
          competitors: competitors.filter((c) => c.name && c.domain),
          prompts,
          engines,
          pageUrls,
        }),
      });
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      setSummaries(data.summaries);
      setGapMatrix(data.gapMatrix);
      setContentBriefs(data.contentBriefs);
      setDemoMode(data.demoMode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Breadcrumb items={[{ label: "Ana Sayfa", href: "/" }, { label: "Gap Analysis" }]} />
        <h1 className="text-2xl font-semibold">Gap Analysis</h1>
        <p className="text-ink/60 text-sm">
          Crosses your SEO + AXO audit against the GEO visibility test: for each page you list, is it
          technically sound, is it open to AI crawlers, and — the question neither number alone answers —
          does any AI engine actually cite it?
        </p>
        <UsageMeter metric="engineQueries" />
      </div>

      <form onSubmit={runAnalysis} className="space-y-5">
        <div className="card space-y-3">
          <h2 className="font-medium text-sm">Your brand</h2>
          <div className="grid grid-cols-2 gap-3">
            <input
              value={brand.name}
              onChange={(e) => setBrand((b) => ({ ...b, name: e.target.value }))}
              placeholder="Brand name"
              required
              className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <input
              value={brand.domain}
              onChange={(e) => setBrand((b) => ({ ...b, domain: e.target.value }))}
              placeholder="brand-domain.com"
              required
              className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
        </div>

        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-sm">Competitors (optional)</h2>
            <button
              type="button"
              onClick={() => setCompetitors((c) => [...c, { name: "", domain: "" }])}
              className="text-xs text-accent hover:underline"
            >
              + Add competitor
            </button>
          </div>
          {competitors.map((c, i) => (
            <div key={i} className="grid grid-cols-2 gap-3">
              <input
                value={c.name}
                onChange={(e) => updateCompetitor(i, "name", e.target.value)}
                placeholder="Competitor name"
                className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <input
                value={c.domain}
                onChange={(e) => updateCompetitor(i, "domain", e.target.value)}
                placeholder="competitor-domain.com"
                className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
          ))}
        </div>

        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-sm">Prompts (one per line)</h2>
            <div className="flex gap-2 text-xs">
              <button type="button" onClick={() => setPromptsText(EN_PROMPT_PRESET)} className="text-accent hover:underline">
                EN example
              </button>
              <span className="text-ink/20">·</span>
              <button type="button" onClick={() => setPromptsText(TR_PROMPT_PRESET)} className="text-accent hover:underline">
                TR örnek
              </button>
            </div>
          </div>
          <textarea
            value={promptsText}
            onChange={(e) => setPromptsText(e.target.value)}
            rows={4}
            className="w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent font-mono"
          />
        </div>

        <div className="card space-y-3">
          <h2 className="font-medium text-sm">Your key pages to audit (one URL per line)</h2>
          <textarea
            value={pageUrlsText}
            onChange={(e) => setPageUrlsText(e.target.value)}
            rows={3}
            placeholder={"yourdomain.com\nyourdomain.com/blog/your-best-article"}
            className="w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent font-mono"
          />
        </div>

        <div className="card space-y-3">
          <h2 className="font-medium text-sm">Engines</h2>
          <div className="flex flex-wrap gap-4 text-sm">
            {(Object.keys(ENGINE_LABEL) as EngineId[]).map((eng) => (
              <label key={eng} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={engines.includes(eng)}
                  onChange={(e) =>
                    setEngines((prev) =>
                      e.target.checked ? [...prev, eng] : prev.filter((x) => x !== eng)
                    )
                  }
                />
                {ENGINE_LABEL[eng]}
              </label>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-accent text-white px-5 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? "Analyzing…" : `Analyze ${pageUrls.length || 0} page(s) against ${prompts.length} prompt(s)`}
        </button>
      </form>

      {error && <div className="card border-danger/40 text-danger text-sm">{error}</div>}

      {demoMode && gapMatrix && (
        <div className="card border-warn/40 text-warn text-sm">
          Running in <strong>demo mode</strong> — GEO citations are simulated at the domain/homepage level, so
          deeper pages will usually show 0 exact-URL citations here even when the domain is being cited overall.
          Add real API keys in <code>.env</code> for citations with real page paths.
        </div>
      )}

      {gapMatrix && (
        <div className="flex justify-end">
          <button
            onClick={downloadPdf}
            className="text-xs rounded-lg border border-border px-3 py-1.5 hover:bg-muted text-ink/70"
          >
            Download PDF report
          </button>
        </div>
      )}

      {summaries && (
        <div className="space-y-3">
          <h2 className="font-medium">Visibility summary</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {summaries.map((s) => (
              <StatCard
                key={s.brand}
                label={s.brand}
                value={`${Math.round(s.visibility * 100)}%`}
                description={`Share of voice ${Math.round(s.shareOfVoice * 100)}%`}
                tone={s.rank === 1 ? "seo" : "accent"}
              />
            ))}
          </div>
        </div>
      )}

      {gapMatrix && (
        <div className="card">
          <h2 className="font-medium">Gap matrix</h2>
          <p className="text-sm text-ink/50 mb-4">Per-page cross-analysis of technical health vs. actual AI citation.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-ink/40 text-left">
                <tr>
                  <th className="py-2 pr-4">Page</th>
                  <th className="py-2 pr-4">SEO</th>
                  <th className="py-2 pr-4">AXO</th>
                  <th className="py-2 pr-4">Blocked bots</th>
                  <th className="py-2 pr-4">Cited (page)</th>
                  <th className="py-2 pr-4">Cited (domain)</th>
                  <th className="py-2 pr-4">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {gapMatrix.map((row) => (
                  <tr key={row.url} className="border-t border-border">
                    <td className="py-2 pr-4 max-w-[220px] truncate" title={row.url}>{row.url}</td>
                    <td className="py-2 pr-4">{row.seoScore}</td>
                    <td className="py-2 pr-4">{row.aiCrawlScore}</td>
                    <td className="py-2 pr-4">{row.blockedBots || "—"}</td>
                    <td className="py-2 pr-4">{row.citedExact}</td>
                    <td className="py-2 pr-4">{row.citedDomain}</td>
                    <td className="py-2 pr-4">
                      <span className={`badge ${VERDICT_BADGE[row.verdict]}`}>{VERDICT_LABEL[row.verdict]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-ink/30">
            "Strong but invisible" = good SEO/AXO scores, not blocked, but no AI engine cited it in this run —
            the page that's technically ready but isn't winning citations yet. That's usually a content-shape
            problem (not answer-first enough, no FAQ schema), not a technical one — check the audit's Fixes section.
          </p>
        </div>
      )}

      {contentBriefs && contentBriefs.length > 0 && (
        <div className="space-y-3">
          <div>
            <h2 className="font-medium">Content briefs</h2>
            <p className="text-sm text-ink/50">
              For each page that isn't winning yet: the prompts it's losing in this run, and the concrete content
              gaps the audit found. Built from this run's own data — nothing invented.
            </p>
          </div>
          <div className="space-y-3">
            {contentBriefs.map((brief) => (
              <div key={brief.url} className="card space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm font-medium truncate" title={brief.url}>{brief.url}</div>
                  <span className={`badge ${VERDICT_BADGE[brief.verdict]}`}>{VERDICT_LABEL[brief.verdict]}</span>
                </div>
                <p className="text-xs text-ink/50">{brief.reason}</p>

                {brief.contentGaps.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-ink/60 mb-1">Content gaps</div>
                    <ul className="text-xs text-ink/60 space-y-1 list-disc list-inside">
                      {brief.contentGaps.map((g, i) => (
                        <li key={i}>{g}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {brief.suggestedHeadings.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-ink/60 mb-1">
                      Prompts this brand isn't winning — turn these into headings/FAQ entries
                    </div>
                    <ul className="text-xs text-accent space-y-1 list-disc list-inside">
                      {brief.suggestedHeadings.map((h, i) => (
                        <li key={i}>{h}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <PromptBlock
                  bare
                  title="Fix with Claude Code"
                  description="A prompt pre-filled with this page's exact gaps — paste it into Claude Code running in your site's repo."
                  prompt={buildContentBriefPrompt(brief, brand.name)}
                />

                <div className="border-t border-border pt-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-ink/50">
                    Or let Epicsem draft it — grounded only in this brief's real data, published as a WordPress
                    draft for you to review, never auto-published.
                  </p>
                  <button
                    type="button"
                    onClick={() => generateArticle(brief)}
                    disabled={generatingUrl === brief.url}
                    className="text-xs rounded-lg bg-accent text-white px-3 py-1.5 hover:opacity-90 disabled:opacity-50 shrink-0"
                  >
                    {generatingUrl === brief.url ? "Generating…" : "Generate article"}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {generateError && <div className="card border-danger/40 text-danger text-sm">{generateError}</div>}
        </div>
      )}
    </div>
  );
}
