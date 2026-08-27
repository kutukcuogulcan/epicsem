"use client";

import { useEffect, useState } from "react";
import type { SeoAuditResult, IssueCategory } from "@/types";
import ScoreGauge from "@/components/ScoreGauge";
import IssueCard from "@/components/IssueCard";
import FixCard from "@/components/FixCard";

const CATEGORY_LABEL: Record<IssueCategory, string> = {
  meta: "Meta & titles",
  headings: "Headings",
  schema: "Structured data",
  crawlability: "Crawlability",
  "ai-crawlability": "AI crawler access (AXO)",
  performance: "Performance",
  content: "Content depth",
  localization: "Language & localization",
};

interface PreviousAuditRun {
  score: number;
  aiCrawlScore: number;
  blockedBots: number;
  createdAt: string;
}

function TrendChip({ label, delta, lowerIsBetter = false }: { label: string; delta: number; lowerIsBetter?: boolean }) {
  if (delta === 0) return <span className="text-ink/40">{label} unchanged</span>;
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  return (
    <span className={improved ? "text-seo" : "text-danger"}>
      {label} {delta > 0 ? "+" : ""}
      {delta} vs last run
    </span>
  );
}

export default function AuditPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SeoAuditResult | null>(null);
  const [previousRun, setPreviousRun] = useState<PreviousAuditRun | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("clientId");
    if (!id) return;
    fetch(`/api/clients/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.client) setUrl(data.client.domain);
      })
      .catch(() => {});
  }, []);

  async function runAudit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) {
      setError("Enter a URL to audit.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setPreviousRun(null);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Audit failed");
      setResult(data);
      setPreviousRun(data.previousRun ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function downloadPdf() {
    if (!result) return;
    const res = await fetch("/api/report/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName: result.meta.title || result.url,
        clientDomain: result.url,
        audit: result,
      }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = "epicsem-audit-report.pdf";
    a.click();
    URL.revokeObjectURL(objectUrl);
  }

  const groupedIssues = result
    ? (Object.keys(CATEGORY_LABEL) as IssueCategory[]).map((cat) => ({
        cat,
        issues: result.issues.filter((i) => i.category === cat),
      })).filter((g) => g.issues.length > 0)
    : [];

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">SEO + AXO Audit</h1>
        <p className="text-ink/60 text-sm">
          Checks the fundamentals (title, meta, headings, schema, sitemap) plus whether AI crawlers —
          GPTBot, ClaudeBot, PerplexityBot, Google-Extended — can actually reach the page.
        </p>
      </div>

      <form onSubmit={runAudit} className="flex gap-3">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="example.com"
          required
          className="flex-1 rounded-lg bg-panel border border-border px-4 py-2.5 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-accent text-white px-5 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? "Auditing…" : "Run audit"}
        </button>
      </form>

      {error && <div className="card border-danger/40 text-danger text-sm">{error}</div>}

      {result && (
        <div className="space-y-8">
          <div className="flex justify-end">
            <button
              onClick={downloadPdf}
              className="text-xs rounded-lg border border-border px-3 py-1.5 hover:bg-muted text-ink/70"
            >
              Download PDF report
            </button>
          </div>
          <div className="card flex flex-wrap items-center gap-8">
            <ScoreGauge label="Technical SEO score" score={result.score} colorClass="text-seo" />
            <ScoreGauge label="AI crawlability (AXO) score" score={result.aiCrawlScore} colorClass="text-accent" />
            <div className="text-sm text-ink/60 space-y-1">
              <div><span className="text-ink/40">URL:</span> {result.url}</div>
              <div><span className="text-ink/40">Title:</span> {result.meta.title ?? "—"}</div>
              <div><span className="text-ink/40">Word count:</span> ~{result.meta.wordCount}</div>
              <div><span className="text-ink/40">Structured data:</span> {result.meta.hasSchema ? result.meta.schemaTypes.join(", ") : "none"}</div>
              {previousRun && (
                <div className="flex flex-wrap gap-x-4 pt-1 text-xs">
                  <TrendChip label="SEO" delta={result.score - previousRun.score} />
                  <TrendChip label="AXO" delta={result.aiCrawlScore - previousRun.aiCrawlScore} />
                  <TrendChip
                    label="Blocked bots"
                    delta={result.meta.aiBotAccess.filter((b) => !b.allowed).length - previousRun.blockedBots}
                    lowerIsBetter
                  />
                </div>
              )}
              {!previousRun && (
                <div className="pt-1 text-xs text-ink/30">First recorded run for this URL — future runs will show a trend here.</div>
              )}
            </div>
          </div>

          <div className="card">
            <h2 className="font-medium mb-3">AI crawler access</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
              {result.meta.aiBotAccess.map((b) => (
                <div key={b.bot} className="flex items-center justify-between rounded-lg bg-muted px-3 py-2">
                  <span>{b.bot} <span className="text-ink/40">({b.engine})</span></span>
                  <span className={b.allowed ? "text-seo" : "text-danger"}>{b.allowed ? "Allowed" : "Blocked"}</span>
                </div>
              ))}
            </div>
          </div>

          {result.fixes.length > 0 && (
            <div className="space-y-3">
              <div>
                <h2 className="font-medium">Fixes</h2>
                <p className="text-sm text-ink/50">
                  Generated from this page's own content — nothing invented. Review before publishing, then paste.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {result.fixes.map((fix, i) => (
                  <FixCard key={i} fix={fix} />
                ))}
              </div>
            </div>
          )}

          {groupedIssues.map((group) => (
            <div key={group.cat} className="space-y-3">
              <h2 className="font-medium">{CATEGORY_LABEL[group.cat]}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {group.issues.map((issue, i) => (
                  <IssueCard key={i} issue={issue} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
