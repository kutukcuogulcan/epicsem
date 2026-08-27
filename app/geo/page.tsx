"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EngineId, GeoRunResult, GeoVisibilitySummary, SourceDomainStat, SourceDomainType } from "@/types";

const ENGINE_LABEL: Record<EngineId, string> = {
  openai: "ChatGPT (OpenAI)",
  anthropic: "Claude (Anthropic)",
  google: "Gemini (Google)",
  perplexity: "Perplexity",
};

const EN_PROMPT_PRESET = "best tools for [your category]\nhow to choose a [your category] tool\n[brand] vs [competitor]";
const TR_PROMPT_PRESET =
  "[kategori] için en iyi markalar hangileri?\nİstanbul'da [kategori] konusunda hangi firmayı önerirsiniz?\n[marka] güvenilir mi?\n[marka] ile [rakip] arasındaki fark ne?";

const DOMAIN_TYPE_COLOR: Record<SourceDomainType, string> = {
  You: "bg-seo",
  Competitor: "bg-danger",
  Reference: "bg-accent",
  UGC: "bg-warn",
  Other: "bg-ink/20",
};

function sentimentColor(score: number | null) {
  if (score == null) return "text-ink/40";
  if (score >= 70) return "text-seo";
  if (score >= 50) return "text-warn";
  return "text-danger";
}

interface BrandRow {
  name: string;
  domain: string;
}

export default function GeoPage() {
  const [brand, setBrand] = useState<BrandRow>({ name: "", domain: "" });
  const [competitors, setCompetitors] = useState<BrandRow[]>([{ name: "", domain: "" }]);
  const [promptsText, setPromptsText] = useState(
    "best tools for [your category]\nhow to choose a [your category] tool\n[brand] vs [competitor]"
  );
  const [engines, setEngines] = useState<EngineId[]>(["openai", "anthropic", "google", "perplexity"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<GeoRunResult[] | null>(null);
  const [summaries, setSummaries] = useState<GeoVisibilitySummary[] | null>(null);
  const [sourceDistribution, setSourceDistribution] = useState<SourceDomainStat[] | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [previousSummaries, setPreviousSummaries] = useState<GeoVisibilitySummary[] | null>(null);
  const [previousRunAt, setPreviousRunAt] = useState<string | null>(null);
  const [clientId, setClientId] = useState<number | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("clientId");
    if (!id) return;
    fetch(`/api/clients/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.client) return;
        setClientId(data.client.id);
        setBrand({ name: data.client.name, domain: data.client.domain });
        if (data.client.competitors.length > 0) setCompetitors(data.client.competitors);
      })
      .catch(() => {});
  }, []);

  const prompts = useMemo(
    () => promptsText.split("\n").map((p) => p.trim()).filter(Boolean),
    [promptsText]
  );

  function updateCompetitor(i: number, field: keyof BrandRow, value: string) {
    setCompetitors((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));
  }

  async function runTest(e: React.FormEvent) {
    e.preventDefault();
    if (!brand.name || !brand.domain || prompts.length === 0) return;
    setLoading(true);
    setError(null);
    setRuns(null);
    setSummaries(null);
    setSourceDistribution(null);
    setPreviousSummaries(null);
    setPreviousRunAt(null);
    try {
      const res = await fetch("/api/geo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand,
          competitors: competitors.filter((c) => c.name && c.domain),
          prompts,
          engines,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Test failed");
      setRuns(data.runs);
      setSummaries(data.summaries);
      setSourceDistribution(data.sourceDistribution);
      setDemoMode(data.demoMode);
      if (data.previousRun) {
        setPreviousSummaries(data.previousRun.summaries);
        setPreviousRunAt(data.previousRun.createdAt);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const chartData = summaries?.map((s) => ({
    name: s.brand,
    Visibility: Math.round(s.visibility * 100),
    "Share of voice": Math.round(s.shareOfVoice * 100),
  }));

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">GEO / AEO Visibility Test</h1>
        <p className="text-ink/60 text-sm">
          Runs your prompts against ChatGPT, Claude, Gemini and Perplexity, then measures whether your brand is
          mentioned, where it ranks against competitors, and which sources get cited.
        </p>
      </div>

      <form onSubmit={runTest} className="space-y-5">
        <div className="card space-y-3">
          <h2 className="font-medium text-sm">Your brand</h2>
          <div className="grid grid-cols-2 gap-3">
            <input
              value={brand.name}
              onChange={(e) => setBrand((b) => ({ ...b, name: e.target.value }))}
              placeholder="Brand name"
              className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <input
              value={brand.domain}
              onChange={(e) => setBrand((b) => ({ ...b, domain: e.target.value }))}
              placeholder="brand-domain.com"
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
          <p className="text-xs text-ink/30">
            Turkish-market tip: LLMs often answer a Turkish question with a different citation mix than the
            English equivalent — test both if your audience is Turkish, don't assume the English result transfers.
          </p>
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
          {loading ? "Running…" : `Run ${prompts.length} prompt(s) × ${engines.length} engine(s)`}
        </button>
      </form>

      {error && <div className="card border-danger/40 text-danger text-sm">{error}</div>}

      {demoMode && summaries && (
        <div className="card border-warn/40 text-warn text-sm">
          Running in <strong>demo mode</strong> — no LLM API keys are configured, so responses below are simulated
          (clearly marked) to show how the dashboard works. Add real keys in <code>.env</code> to get live results.
        </div>
      )}

      {summaries && (
        <div className="card">
          <h2 className="font-medium mb-4">Visibility & share of voice</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e0f5" />
                <XAxis dataKey="name" stroke="#8a8398" fontSize={12} />
                <YAxis stroke="#8a8398" fontSize={12} unit="%" />
                <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e5e0f5", color: "#1e1b29" }} />
                <Legend />
                <Bar dataKey="Visibility" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Share of voice" fill="#a78bfa" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-ink/40 text-left">
                <tr>
                  <th className="py-2 pr-4">#</th>
                  <th className="py-2 pr-4">Brand</th>
                  <th className="py-2 pr-4">Visibility</th>
                  <th className="py-2 pr-4">SOV</th>
                  <th className="py-2 pr-4">Sentiment</th>
                  <th className="py-2 pr-4">Position</th>
                  <th className="py-2 pr-4">Citations</th>
                  {previousSummaries && <th className="py-2 pr-4">Δ visibility</th>}
                </tr>
              </thead>
              <tbody>
                {summaries.map((s) => {
                  const prev = previousSummaries?.find((p) => p.brand === s.brand);
                  const delta = prev ? Math.round((s.visibility - prev.visibility) * 100) : null;
                  return (
                    <tr key={s.brand} className="border-t border-border">
                      <td className="py-2 pr-4 text-ink/40">{s.rank}</td>
                      <td className="py-2 pr-4 font-medium">{s.brand}</td>
                      <td className="py-2 pr-4">{Math.round(s.visibility * 100)}%</td>
                      <td className="py-2 pr-4">{Math.round(s.shareOfVoice * 100)}%</td>
                      <td className={`py-2 pr-4 ${sentimentColor(s.avgSentiment)}`}>
                        <span className="mr-1.5">●</span>
                        {s.avgSentiment ?? "—"}
                      </td>
                      <td className="py-2 pr-4">{s.avgPosition ? `#${s.avgPosition.toFixed(1)}` : "—"}</td>
                      <td className="py-2 pr-4">{s.citationCount}</td>
                      {previousSummaries && (
                        <td className={`py-2 pr-4 ${delta == null ? "text-ink/30" : delta > 0 ? "text-seo" : delta < 0 ? "text-danger" : "text-ink/40"}`}>
                          {delta == null ? "new" : `${delta > 0 ? "+" : ""}${delta}pp`}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-ink/30">
              {previousSummaries
                ? `Compared against the previous run for this brand (${new Date(previousRunAt ?? "").toLocaleString()}).`
                : "First recorded run for this brand — run it again later to see period-over-period trend here."}
            </p>
          </div>
        </div>
      )}

      {sourceDistribution && sourceDistribution.length > 0 && (
        <div className="card">
          <h2 className="font-medium">Source distribution</h2>
          <p className="text-sm text-ink/50 mb-4">Which domains the AI engines cited across all runs.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            <div className="space-y-2">
              <div className="text-xs text-ink/40 mb-1">Top domains</div>
              {sourceDistribution.slice(0, 8).map((d) => {
                const max = sourceDistribution[0].count;
                const width = Math.max(6, Math.round((d.count / max) * 100));
                return (
                  <div key={d.domain} className="flex items-center gap-3 text-sm">
                    <div className="w-32 truncate text-ink/70">{d.domain}</div>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${DOMAIN_TYPE_COLOR[d.type]}`} style={{ width: `${width}%` }} />
                    </div>
                    <div className="w-6 text-right text-ink/50 text-xs">{d.count}</div>
                  </div>
                );
              })}
            </div>
            <div className="space-y-2">
              <div className="text-xs text-ink/40 mb-1">
                Domain types · {sourceDistribution.reduce((s, d) => s + d.count, 0)} total citations
              </div>
              {(["You", "Competitor", "Reference", "UGC", "Other"] as SourceDomainType[]).map((type) => {
                const total = sourceDistribution.reduce((s, d) => s + d.count, 0) || 1;
                const count = sourceDistribution.filter((d) => d.type === type).reduce((s, d) => s + d.count, 0);
                if (count === 0) return null;
                return (
                  <div key={type} className="flex items-center gap-2 text-sm">
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${DOMAIN_TYPE_COLOR[type]}`} />
                    <span className="flex-1 text-ink/70">{type}</span>
                    <span className="text-ink/50 text-xs">{Math.round((count / total) * 100)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {runs && (
        <div className="space-y-3">
          <h2 className="font-medium">Individual runs</h2>
          {runs.map((r, i) => (
            <div key={i} className="card">
              <button
                type="button"
                onClick={() => setExpanded(expanded === i ? null : i)}
                className="w-full flex items-center justify-between text-left"
              >
                <div className="text-sm">
                  <span className="font-medium">{ENGINE_LABEL[r.engine]}</span>
                  <span className="text-ink/40"> · {r.model}</span>
                  <span className="text-ink/40"> · &ldquo;{r.promptText}&rdquo;</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className={r.mentioned ? "text-seo" : "text-ink/30"}>
                    {r.mentioned ? `Mentioned (#${r.position})` : "Not mentioned"}
                  </span>
                  {r.sentiment != null && <span className="text-ink/50">sentiment {r.sentiment}</span>}
                </div>
              </button>
              {expanded === i && (
                <div className="mt-4 space-y-3 text-sm">
                  <pre className="whitespace-pre-wrap text-ink/70 bg-muted rounded-lg p-3">{r.responseText}</pre>
                  {r.citations.length > 0 && (
                    <div>
                      <div className="text-ink/40 text-xs mb-1">Citations</div>
                      <ul className="space-y-1">
                        {r.citations.map((c, ci) => (
                          <li key={ci} className={c.isOwnDomain ? "text-seo" : "text-ink/60"}>
                            {c.domain} {c.isOwnDomain && "(your domain)"}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
