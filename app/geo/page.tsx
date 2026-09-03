"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EngineId, GeoRunResult, GeoVisibilitySummary, SourceDomainStat, SourceDomainType, TopicVisibility } from "@/types";
import UsageMeter from "@/components/UsageMeter";
import Breadcrumb from "@/components/Breadcrumb";
import StatCard from "@/components/StatCard";
import ScoreBadge from "@/components/ScoreBadge";

interface GeoHistoryRun {
  id: number;
  brandName: string;
  brandDomain: string;
  demoMode: boolean;
  summaries: GeoVisibilitySummary[];
  createdAt: string;
}

const TREND_COLORS = ["#7c3aed", "#059669", "#dc2626", "#d97706", "#2563eb", "#db2777"];

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

// Pre-checked by default — the four engines with a real API integration. DeepSeek/Grok
// have real integrations too but are opt-in by default to keep a first run fast; Meta AI
// and Copilot have no public API at all (see lib/geo-providers.ts) so they always run
// simulated — still useful to include since they're real, commonly-cited GEO surfaces.
const DEFAULT_ENGINES: EngineId[] = ["openai", "anthropic", "google", "perplexity"];

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

interface BrandRow {
  name: string;
  domain: string;
}

interface PromptInput {
  text: string;
  topic: string;
}

// "Fiyat: X ürünü ne kadar tutar?" → { topic: "Fiyat", text: "X ürünü ne kadar tutar?" }.
// The prefix must be short (≤3 words) so a normal prompt that happens to contain a colon
// (a URL, a ratio, a quote) isn't misread as a topic tag — falls back to "Genel" otherwise.
function parsePromptLine(line: string): PromptInput {
  const m = line.match(/^([^:]{1,24}):\s*(.+)$/);
  if (m && m[1].trim().split(/\s+/).length <= 3) {
    return { topic: m[1].trim(), text: m[2].trim() };
  }
  return { topic: "Genel", text: line };
}

export default function GeoPage() {
  const [brand, setBrand] = useState<BrandRow>({ name: "", domain: "" });
  const [competitors, setCompetitors] = useState<BrandRow[]>([{ name: "", domain: "" }]);
  const [promptsText, setPromptsText] = useState(
    "best tools for [your category]\nhow to choose a [your category] tool\n[brand] vs [competitor]"
  );
  const [engines, setEngines] = useState<EngineId[]>(DEFAULT_ENGINES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<GeoRunResult[] | null>(null);
  const [summaries, setSummaries] = useState<GeoVisibilitySummary[] | null>(null);
  const [sourceDistribution, setSourceDistribution] = useState<SourceDomainStat[] | null>(null);
  const [topicBreakdown, setTopicBreakdown] = useState<TopicVisibility[] | null>(null);
  const [brandedSplit, setBrandedSplit] = useState<{ branded: number; discovery: number } | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [previousSummaries, setPreviousSummaries] = useState<GeoVisibilitySummary[] | null>(null);
  const [previousRunAt, setPreviousRunAt] = useState<string | null>(null);
  const [clientId, setClientId] = useState<number | null>(null);
  const [history, setHistory] = useState<GeoHistoryRun[] | null>(null);
  const [runResultsFilter, setRunResultsFilter] = useState("");
  const [runEngineFilter, setRunEngineFilter] = useState<EngineId | "all">("all");

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
    () => promptsText.split("\n").map((p) => p.trim()).filter(Boolean).map(parsePromptLine),
    [promptsText]
  );

  function updateCompetitor(i: number, field: keyof BrandRow, value: string) {
    setCompetitors((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));
  }

  // Fills the textarea with brand-grounded prompts from /api/geo/suggest-prompts (LLM-backed,
  // demo-template fallback) instead of a new user staring at a blank "one prompt per line" box.
  async function suggestPrompts() {
    if (!brand.name || !brand.domain) {
      setError("Prompt önerisi için önce marka adı ve alan adını girin.");
      return;
    }
    setSuggesting(true);
    setError(null);
    try {
      const res = await fetch("/api/geo/suggest-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand,
          competitors: competitors.filter((c) => c.name && c.domain),
        }),
      });
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Prompt suggestion failed");
      const lines = (data.suggestions as { topic: string; text: string }[]).map((s) => `${s.topic}: ${s.text}`);
      setPromptsText(lines.join("\n"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSuggesting(false);
    }
  }

  async function runTest(e: React.FormEvent) {
    e.preventDefault();
    if (!brand.name || !brand.domain) {
      setError("Enter your brand name and domain.");
      return;
    }
    if (prompts.length === 0) {
      setError("Enter at least one prompt.");
      return;
    }
    if (engines.length === 0) {
      setError("Pick at least one engine.");
      return;
    }
    setLoading(true);
    setError(null);
    setRuns(null);
    setSummaries(null);
    setSourceDistribution(null);
    setTopicBreakdown(null);
    setBrandedSplit(null);
    setPreviousSummaries(null);
    setPreviousRunAt(null);
    setHistory(null);
    setRunResultsFilter("");
    setRunEngineFilter("all");
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
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Test failed");
      setRuns(data.runs);
      setSummaries(data.summaries);
      setSourceDistribution(data.sourceDistribution);
      if (Array.isArray(data.topicBreakdown)) setTopicBreakdown(data.topicBreakdown);
      if (data.brandedSplit) setBrandedSplit(data.brandedSplit);
      setDemoMode(data.demoMode);
      if (data.previousRun) {
        setPreviousSummaries(data.previousRun.summaries);
        setPreviousRunAt(data.previousRun.createdAt);
      }
      if (Array.isArray(data.history)) setHistory(data.history);
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

  // Trend chart: one line per brand in the CURRENT comparison, plotted across every
  // historical run recorded for this domain — a brand that wasn't tracked in an older
  // run just has no point there (connectNulls skips the gap instead of dropping to 0).
  const trendData = useMemo(() => {
    if (!history || history.length < 2) return null;
    return history.map((h) => {
      const point: Record<string, string | number> = {
        date: new Date(h.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      };
      h.summaries.forEach((s) => {
        point[s.brand] = Math.round(s.visibility * 100);
      });
      return point;
    });
  }, [history]);
  const trendBrands = summaries?.map((s) => s.brand) ?? [];

  // The three headline numbers, own-brand only — mirrors the stat-card row real
  // AI-visibility dashboards (e.g. Arvow's LLM Visibility Tracker) lead with, instead
  // of making you read them out of the comparison table below.
  const ownSummary = summaries?.find((s) => s.domain === brand.domain) ?? summaries?.[0] ?? null;
  const filteredRuns = runs?.filter(
    (r) =>
      (runEngineFilter === "all" || r.engine === runEngineFilter) &&
      (runResultsFilter.trim() === "" || r.promptText.toLowerCase().includes(runResultsFilter.trim().toLowerCase()))
  );

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Breadcrumb items={[{ label: "Ana Sayfa", href: "/" }, { label: "GEO/AEO Visibility" }]} />
        <h1 className="text-2xl font-semibold">GEO / AEO Visibility Test</h1>
        <p className="text-ink/60 text-sm">
          Runs your prompts against ChatGPT, Claude, Gemini and Perplexity, then measures whether your brand is
          mentioned, where it ranks against competitors, and which sources get cited.
        </p>
        <UsageMeter metric="engineQueries" />
      </div>

      <form onSubmit={runTest} className="space-y-5">
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
              <button
                type="button"
                onClick={suggestPrompts}
                disabled={suggesting}
                className="text-accent hover:underline disabled:opacity-50"
              >
                {suggesting ? "Öneriler hazırlanıyor…" : "✨ Prompt öner"}
              </button>
              <span className="text-ink/20">·</span>
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
            Bir satırı <code>Konu: prompt metni</code> şeklinde yazarsanız (örn. <code>Fiyat: X ne kadar tutar?</code>)
            sonuçlarda konu bazında görünürlük kırılımı çıkar — konu vermezseniz &ldquo;Genel&rdquo; sayılır.
          </p>
          <p className="text-xs text-ink/30">
            Turkish-market tip: LLMs often answer a Turkish question with a different citation mix than the
            English equivalent — test both if your audience is Turkish, don't assume the English result transfers.
          </p>
          <UsageMeter metric="promptSuggestions" />
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

      {summaries && ownSummary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Visibility"
            value={`${Math.round(ownSummary.visibility * 100)}%`}
            description={`${ownSummary.brand} kaç promptta görünüyor`}
            tone={ownSummary.visibility >= 0.5 ? "seo" : ownSummary.visibility >= 0.2 ? "warn" : "danger"}
          />
          <StatCard
            label="Sentiment"
            value={ownSummary.avgSentiment != null ? String(ownSummary.avgSentiment) : "—"}
            description="AI seni ne kadar olumlu tanımlıyor"
            tone={
              ownSummary.avgSentiment == null
                ? "ink"
                : ownSummary.avgSentiment >= 70
                  ? "seo"
                  : ownSummary.avgSentiment >= 50
                    ? "warn"
                    : "danger"
            }
          />
          <StatCard
            label="Prompts"
            value={String(prompts.length)}
            description={`${engines.length} motor üzerinden test edildi`}
          />
          {brandedSplit && (
            <StatCard
              label="Marka bilinen / keşif"
              value={`${brandedSplit.branded} / ${brandedSplit.discovery}`}
              description="Markanı zaten bilen vs. kategoriyi araştıran sorular"
            />
          )}
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
                      <td className="py-2 pr-4">
                        <ScoreBadge score={Math.round(s.visibility * 100)} display={`${Math.round(s.visibility * 100)}%`} />
                      </td>
                      <td className="py-2 pr-4">
                        <ScoreBadge score={Math.round(s.shareOfVoice * 100)} display={`${Math.round(s.shareOfVoice * 100)}%`} />
                      </td>
                      <td className="py-2 pr-4">
                        <ScoreBadge score={s.avgSentiment} kind="sentiment" />
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

      {trendData && (
        <div className="card">
          <h2 className="font-medium mb-1">Visibility trend</h2>
          <p className="text-sm text-ink/50 mb-4">
            Visibility per brand across every recorded run for this domain ({trendData.length} runs).
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e0f5" />
                <XAxis dataKey="date" stroke="#8a8398" fontSize={12} />
                <YAxis stroke="#8a8398" fontSize={12} unit="%" />
                <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e5e0f5", color: "#1e1b29" }} />
                <Legend />
                {trendBrands.map((b, i) => (
                  <Line
                    key={b}
                    type="monotone"
                    dataKey={b}
                    stroke={TREND_COLORS[i % TREND_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
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

      {topicBreakdown && topicBreakdown.length > 1 && (
        <div className="card">
          <h2 className="font-medium">Konu bazında görünürlük</h2>
          <p className="text-sm text-ink/50 mb-4">
            {ownSummary?.brand ?? "Markanız"} her prompt konusunda ne kadar görünüyor — hangi konularda görünmez
            olduğunuzu gösterir (Peec AI&apos;deki topic/tag kırılımına benzer).
          </p>
          <div className="space-y-2">
            {topicBreakdown.map((t) => {
              const pct = Math.round(t.visibility * 100);
              return (
                <div key={t.topic} className="flex items-center gap-3 text-sm">
                  <div className="w-36 truncate text-ink/70">{t.topic}</div>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${pct >= 50 ? "bg-seo" : pct >= 20 ? "bg-warn" : "bg-danger"}`}
                      style={{ width: `${Math.max(4, pct)}%` }}
                    />
                  </div>
                  <div className="w-24 text-right text-ink/50 text-xs">
                    {pct}% ({t.mentionedCount}/{t.totalCount})
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {runs && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-medium">
              Individual runs <span className="text-ink/30 font-normal">· {filteredRuns?.length ?? 0}/{runs.length}</span>
            </h2>
            <div className="flex items-center gap-2">
              <input
                value={runResultsFilter}
                onChange={(e) => {
                  setRunResultsFilter(e.target.value);
                  setExpanded(null);
                }}
                placeholder="Search prompts…"
                className="rounded-lg bg-muted border border-border px-3 py-1.5 text-xs outline-none focus:border-accent w-48"
              />
              <select
                value={runEngineFilter}
                onChange={(e) => {
                  setRunEngineFilter(e.target.value as EngineId | "all");
                  setExpanded(null);
                }}
                className="rounded-lg bg-muted border border-border px-2 py-1.5 text-xs outline-none focus:border-accent"
              >
                <option value="all">All engines</option>
                {Array.from(new Set(runs.map((r) => r.engine))).map((eng) => (
                  <option key={eng} value={eng}>
                    {ENGINE_LABEL[eng]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {filteredRuns?.length === 0 && (
            <div className="card text-sm text-ink/40 text-center py-6">No runs match this filter.</div>
          )}
          {filteredRuns?.map((r, i) => (
            <div key={i} className="card">
              <button
                type="button"
                onClick={() => setExpanded(expanded === i ? null : i)}
                className="w-full flex items-center justify-between text-left gap-4"
              >
                <div className="text-sm min-w-0">
                  <span className="font-medium">{ENGINE_LABEL[r.engine]}</span>
                  <span className="text-ink/40"> · {r.model}</span>
                  {r.topic && r.topic !== "Genel" && <span className="badge bg-ink/5 text-ink/50 ml-2">{r.topic}</span>}
                  <span className="text-ink/40"> · &ldquo;{r.promptText}&rdquo;</span>
                </div>
                <div className="flex items-center gap-3 text-xs shrink-0">
                  {r.sentiment != null && <ScoreBadge score={r.sentiment} kind="sentiment" />}
                  <span
                    className={`badge ${r.mentioned ? "badge-pass" : "bg-ink/5 text-ink/40"}`}
                  >
                    {r.mentioned ? `Mentioned #${r.position}` : "Not mentioned"}
                  </span>
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
