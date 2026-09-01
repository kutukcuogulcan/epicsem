"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface MonitorCheck {
  id: number;
  score: number;
  aiCrawlScore: number;
  blockedBots: string[];
  createdAt: string;
}

interface MonitoredPage {
  id: number;
  url: string;
  label: string | null;
  slackWebhook: string | null;
  createdAt: string;
  latestCheck: MonitorCheck | null;
}

interface AlertRow {
  id: number;
  monitoredPageId: number;
  message: string;
  acknowledged: boolean;
  createdAt: string;
  url: string;
}

export default function MonitorPage() {
  const [pages, setPages] = useState<MonitoredPage[] | null>(null);
  const [alerts, setAlerts] = useState<AlertRow[] | null>(null);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [slackWebhook, setSlackWebhook] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedTrend, setExpandedTrend] = useState<number | null>(null);
  const [trendData, setTrendData] = useState<Record<number, MonitorCheck[]>>({});
  const [trendLoading, setTrendLoading] = useState<number | null>(null);

  function redirectToLogin() {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }

  async function toggleTrend(pageId: number) {
    if (expandedTrend === pageId) {
      setExpandedTrend(null);
      return;
    }
    setExpandedTrend(pageId);
    if (trendData[pageId]) return;
    setTrendLoading(pageId);
    try {
      const res = await fetch(`/api/monitor/history?pageId=${pageId}`);
      if (res.status === 401) {
        redirectToLogin();
        return;
      }
      const data = await res.json();
      setTrendData((prev) => ({ ...prev, [pageId]: data.history ?? [] }));
    } finally {
      setTrendLoading(null);
    }
  }

  async function refresh() {
    const [pagesRes, alertsRes] = await Promise.all([fetch("/api/monitor"), fetch("/api/monitor/alerts")]);
    if (pagesRes.status === 401 || alertsRes.status === 401) {
      redirectToLogin();
      return;
    }
    const pagesData = await pagesRes.json();
    const alertsData = await alertsRes.json();
    setPages(pagesData.pages ?? []);
    setAlerts(alertsData.alerts ?? []);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function addPage(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) {
      setError("Enter a URL to monitor.");
      return;
    }
    setBusy("add");
    setError(null);
    try {
      const res = await fetch("/api/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, label: label || undefined, slackWebhook: slackWebhook || undefined }),
      });
      if (res.status === 401) {
        redirectToLogin();
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add page");
      setUrl("");
      setLabel("");
      setSlackWebhook("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function removePage(id: number) {
    setBusy(`remove-${id}`);
    try {
      const res = await fetch("/api/monitor", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.status === 401) {
        redirectToLogin();
        return;
      }
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function checkNow(id?: number) {
    setBusy(id ? `check-${id}` : "check-all");
    setError(null);
    try {
      const res = await fetch("/api/monitor/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { pageId: id } : { all: true }),
      });
      if (res.status === 401) {
        redirectToLogin();
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Check failed");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function ackAlert(id: number) {
    const res = await fetch("/api/monitor/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.status === 401) {
      redirectToLogin();
      return;
    }
    await refresh();
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">AXO Monitoring</h1>
        <p className="text-ink/60 text-sm">
          robots.txt and CDN bot-blocking can change silently — a WAF update, a CDN default flip. Track key pages
          here and get an alert the moment a previously-allowed AI crawler (GPTBot, ClaudeBot, PerplexityBot,
          Google-Extended…) gets blocked, instead of finding out from a visibility drop weeks later.
        </p>
      </div>

      {alerts && alerts.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-medium text-sm text-danger">Active alerts</h2>
          {alerts.map((a) => (
            <div key={a.id} className="card border-danger/40 flex items-start justify-between gap-4">
              <div className="text-sm">
                <div className="text-ink/40 text-xs mb-1">{new Date(a.createdAt).toLocaleString()}</div>
                {a.message}
              </div>
              <button
                onClick={() => ackAlert(a.id)}
                className="text-xs text-ink/50 hover:text-ink border border-border rounded-lg px-3 py-1.5 shrink-0"
              >
                Acknowledge
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={addPage} className="card space-y-3">
        <h2 className="font-medium text-sm">Add a page to monitor</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="yourdomain.com/key-page"
            required
            className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent sm:col-span-1"
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional)"
            className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            value={slackWebhook}
            onChange={(e) => setSlackWebhook(e.target.value)}
            placeholder="Slack webhook URL (optional — falls back to SLACK_WEBHOOK_URL in .env)"
            className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <button
          type="submit"
          disabled={busy === "add"}
          className="rounded-lg bg-accent text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {busy === "add" ? "Adding…" : "Add page"}
        </button>
      </form>

      {error && <div className="card border-danger/40 text-danger text-sm">{error}</div>}

      {pages && pages.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium">Monitored pages ({pages.length})</h2>
            <button
              onClick={() => checkNow()}
              disabled={busy === "check-all"}
              className="text-xs rounded-lg border border-border px-3 py-1.5 hover:bg-muted disabled:opacity-50"
            >
              {busy === "check-all" ? "Checking all…" : "Check all now"}
            </button>
          </div>
          <div className="space-y-3">
            {pages.map((p) => (
              <div key={p.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <div className="font-medium">{p.label || p.url}</div>
                    {p.label && <div className="text-ink/40 text-xs">{p.url}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => checkNow(p.id)}
                      disabled={busy === `check-${p.id}`}
                      className="text-xs rounded-lg border border-border px-3 py-1.5 hover:bg-muted disabled:opacity-50"
                    >
                      {busy === `check-${p.id}` ? "Checking…" : "Check now"}
                    </button>
                    {p.latestCheck && (
                      <button
                        onClick={() => toggleTrend(p.id)}
                        className="text-xs rounded-lg border border-border px-3 py-1.5 hover:bg-muted"
                      >
                        {expandedTrend === p.id ? "Hide trend" : "Trend"}
                      </button>
                    )}
                    <button
                      onClick={() => removePage(p.id)}
                      disabled={busy === `remove-${p.id}`}
                      className="text-xs text-danger/70 hover:text-danger px-2"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                {p.latestCheck ? (
                  <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink/50">
                    <span>SEO {p.latestCheck.score}</span>
                    <span>AXO {p.latestCheck.aiCrawlScore}</span>
                    <span className={p.latestCheck.blockedBots.length > 0 ? "text-danger" : "text-seo"}>
                      {p.latestCheck.blockedBots.length > 0
                        ? `Blocked: ${p.latestCheck.blockedBots.join(", ")}`
                        : "No AI crawlers blocked"}
                    </span>
                    <span>Last checked {new Date(p.latestCheck.createdAt).toLocaleString()}</span>
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-ink/30">Not checked yet — click "Check now" for a baseline.</div>
                )}

                {expandedTrend === p.id && (
                  <div className="mt-3 rounded-lg bg-muted p-3">
                    {trendLoading === p.id && <div className="text-xs text-ink/40">Loading trend…</div>}
                    {trendLoading !== p.id && (trendData[p.id]?.length ?? 0) < 2 && (
                      <div className="text-xs text-ink/40">
                        Not enough history yet — run "Check now" a few more times (ideally on different days) to see a
                        trend line here. AXO monitoring's whole point is catching a drop over time, not just a snapshot.
                      </div>
                    )}
                    {trendLoading !== p.id && (trendData[p.id]?.length ?? 0) >= 2 && (
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={trendData[p.id].map((c) => ({
                              date: new Date(c.createdAt).toLocaleDateString(),
                              SEO: c.score,
                              AXO: c.aiCrawlScore,
                            }))}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e0f5" />
                            <XAxis dataKey="date" stroke="#8a8398" fontSize={11} />
                            <YAxis stroke="#8a8398" fontSize={11} domain={[0, 100]} />
                            <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e5e0f5", color: "#1e1b29" }} />
                            <Legend />
                            <Line type="monotone" dataKey="SEO" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} />
                            <Line type="monotone" dataKey="AXO" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {pages && pages.length === 0 && (
        <div className="card text-sm text-ink/50">No pages monitored yet — add one above to start tracking AI crawler access over time.</div>
      )}
    </div>
  );
}
