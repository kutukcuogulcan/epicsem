"use client";

import { useEffect, useState } from "react";
import type { CmsConnection, ContentDraft } from "@/types";
import UsageMeter from "@/components/UsageMeter";
import Breadcrumb from "@/components/Breadcrumb";

interface DraftListItem {
  id: number;
  sourceUrl: string;
  article: { title: string; demoMode: boolean };
  status: ContentDraft["status"];
  createdAt: string;
}

export default function ContentStudioPage() {
  const [connections, setConnections] = useState<CmsConnection[]>([]);
  const [drafts, setDrafts] = useState<DraftListItem[]>([]);
  const [selectedDraft, setSelectedDraft] = useState<ContentDraft | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);

  const [connForm, setConnForm] = useState({ label: "", siteUrl: "", wpUsername: "", wpAppPassword: "" });
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [savingConn, setSavingConn] = useState(false);
  const [connError, setConnError] = useState<string | null>(null);

  const [selectedConnectionId, setSelectedConnectionId] = useState<number | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  function refreshConnections() {
    fetch("/api/cms/connections")
      .then((res) => (res.status === 401 ? { connections: [] } : res.json()))
      .then((data) => setConnections(data.connections ?? []))
      .catch(() => {});
  }

  function refreshDrafts() {
    fetch("/api/content")
      .then((res) => (res.status === 401 ? { drafts: [] } : res.json()))
      .then((data) => setDrafts(data.drafts ?? []))
      .catch(() => {});
  }

  function loadDraft(id: number) {
    setLoadingDraft(true);
    fetch(`/api/content?id=${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.draft) {
          setSelectedDraft(data.draft);
          window.history.replaceState(null, "", `/content?draftId=${id}`);
        }
      })
      .finally(() => setLoadingDraft(false));
  }

  useEffect(() => {
    refreshConnections();
    refreshDrafts();
    const id = new URLSearchParams(window.location.search).get("draftId");
    if (id) loadDraft(Number(id));
  }, []);

  useEffect(() => {
    if (connections.length > 0 && selectedConnectionId === null) setSelectedConnectionId(connections[0].id);
  }, [connections, selectedConnectionId]);

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    setConnError(null);
    try {
      const res = await fetch("/api/cms/connections/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteUrl: connForm.siteUrl,
          wpUsername: connForm.wpUsername,
          wpAppPassword: connForm.wpAppPassword,
        }),
      });
      const data = await res.json();
      setTestResult(
        data.ok
          ? { ok: true, message: `Connected as ${data.siteUserName ?? connForm.wpUsername}.` }
          : { ok: false, message: data.error ?? "Connection failed." }
      );
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : "Connection failed." });
    } finally {
      setTesting(false);
    }
  }

  async function saveConnection(e: React.FormEvent) {
    e.preventDefault();
    setSavingConn(true);
    setConnError(null);
    try {
      const res = await fetch("/api/cms/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(connForm),
      });
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save connection");
      setConnForm({ label: "", siteUrl: "", wpUsername: "", wpAppPassword: "" });
      setTestResult(null);
      refreshConnections();
    } catch (err) {
      setConnError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSavingConn(false);
    }
  }

  async function deleteConnection(id: number) {
    await fetch(`/api/cms/connections?id=${id}`, { method: "DELETE" });
    refreshConnections();
  }

  async function publish() {
    if (!selectedDraft || !selectedConnectionId) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch("/api/content/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: selectedDraft.id, connectionId: selectedConnectionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Publish failed");
      loadDraft(selectedDraft.id);
      refreshDrafts();
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Breadcrumb items={[{ label: "Ana Sayfa", href: "/" }, { label: "Content Studio" }]} />
        <h1 className="text-2xl font-semibold">Content Studio</h1>
        <p className="text-ink/60 text-sm max-w-3xl">
          Articles generated on <a href="/gap" className="text-accent hover:underline">Gap Analysis</a> land here.
          Every draft is grounded only in that page's real audit/gap findings — anything the model couldn't ground
          is left as an explicit <code>[NEEDS: …]</code> placeholder instead of an invented fact. Publishing always
          creates a <strong>WordPress draft</strong>, never a live post — review and hit publish yourself in WordPress.
        </p>
        <UsageMeter metric="contentGenerations" />
      </div>

      <div className="card space-y-4">
        <h2 className="font-medium">WordPress connections</h2>
        {connections.length === 0 && <p className="text-sm text-ink/40">No connections yet — add one below.</p>}
        <div className="space-y-2">
          {connections.map((c) => (
            <div key={c.id} className="flex items-center justify-between text-sm rounded-lg bg-muted px-3 py-2">
              <div>
                <span className="font-medium">{c.label}</span>{" "}
                <span className="text-ink/40">— {c.siteUrl} ({c.wpUsername}, {c.wpAppPasswordMasked})</span>
              </div>
              <button onClick={() => deleteConnection(c.id)} className="text-xs text-danger hover:underline">
                Remove
              </button>
            </div>
          ))}
        </div>

        <form onSubmit={saveConnection} className="space-y-2 border-t border-border pt-4">
          <div className="grid grid-cols-2 gap-2">
            <input
              value={connForm.label}
              onChange={(e) => setConnForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="Label (e.g. Client's WP site)"
              required
              className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <input
              value={connForm.siteUrl}
              onChange={(e) => setConnForm((f) => ({ ...f, siteUrl: e.target.value }))}
              placeholder="https://client-site.com"
              required
              className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <input
              value={connForm.wpUsername}
              onChange={(e) => setConnForm((f) => ({ ...f, wpUsername: e.target.value }))}
              placeholder="WordPress username"
              required
              className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <input
              value={connForm.wpAppPassword}
              onChange={(e) => setConnForm((f) => ({ ...f, wpAppPassword: e.target.value }))}
              placeholder="Application password"
              type="password"
              required
              className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <p className="text-xs text-ink/40">
            In WordPress: Users → Profile → Application Passwords → add a new one. Not your real login password.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={testConnection}
              disabled={testing || !connForm.siteUrl || !connForm.wpUsername || !connForm.wpAppPassword}
              className="text-xs rounded-lg border border-border px-3 py-1.5 hover:bg-muted disabled:opacity-50"
            >
              {testing ? "Testing…" : "Test connection"}
            </button>
            <button
              type="submit"
              disabled={savingConn || !connForm.label}
              className="text-xs rounded-lg bg-accent text-white px-3 py-1.5 hover:opacity-90 disabled:opacity-50"
            >
              {savingConn ? "Saving…" : "Save connection"}
            </button>
            {testResult && (
              <span className={testResult.ok ? "text-xs text-seo" : "text-xs text-danger"}>{testResult.message}</span>
            )}
          </div>
          {connError && <div className="text-xs text-danger">{connError}</div>}
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <div className="card space-y-2 h-fit">
          <h2 className="font-medium text-sm">Drafts</h2>
          {drafts.length === 0 && (
            <p className="text-xs text-ink/40">
              None yet — generate one from a content brief on <a href="/gap" className="text-accent hover:underline">Gap Analysis</a>.
            </p>
          )}
          {drafts.map((d) => (
            <button
              key={d.id}
              onClick={() => loadDraft(d.id)}
              className={`w-full text-left text-xs rounded-lg px-3 py-2 hover:bg-muted ${
                selectedDraft?.id === d.id ? "bg-muted" : ""
              }`}
            >
              <div className="font-medium truncate">{d.article.title}</div>
              <div className="text-ink/40 flex items-center gap-2">
                <span>{d.status === "published-to-wp" ? "Published to WP" : "Draft"}</span>
                {d.article.demoMode && <span className="text-warn">demo</span>}
              </div>
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {loadingDraft && <div className="card text-sm text-ink/40">Loading…</div>}

          {!loadingDraft && !selectedDraft && (
            <div className="card text-sm text-ink/40">Select a draft on the left, or generate a new one from Gap Analysis.</div>
          )}

          {!loadingDraft && selectedDraft && (
            <div className="card space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="font-medium">{selectedDraft.article.title}</h2>
                  <p className="text-xs text-ink/40 mt-1">
                    For {selectedDraft.sourceUrl} · {selectedDraft.article.model}
                    {selectedDraft.article.demoMode && " · simulated — no API key configured"}
                  </p>
                </div>
                {selectedDraft.status === "published-to-wp" && (
                  <span className="badge badge-pass">Published to WordPress</span>
                )}
              </div>

              <p className="text-sm text-ink/70 italic">{selectedDraft.article.metaDescription}</p>

              {selectedDraft.article.openPlaceholders.length > 0 && (
                <div className="rounded-lg border border-warn/40 bg-warn/5 p-3 text-xs text-warn space-y-1">
                  <div className="font-medium">Needs a human before this is ready to publish:</div>
                  {selectedDraft.article.openPlaceholders.map((p, i) => (
                    <div key={i}>{p}</div>
                  ))}
                </div>
              )}

              <pre className="whitespace-pre-wrap text-sm text-ink/80 bg-muted rounded-lg p-4 max-h-[28rem] overflow-y-auto font-sans">
                {selectedDraft.article.bodyMarkdown}
              </pre>

              {selectedDraft.status === "published-to-wp" ? (
                <div className="flex gap-3 text-sm">
                  {selectedDraft.publishedPostUrl && (
                    <a href={selectedDraft.publishedPostUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                      View post
                    </a>
                  )}
                  {selectedDraft.publishedEditUrl && (
                    <a href={selectedDraft.publishedEditUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                      Edit in WordPress
                    </a>
                  )}
                </div>
              ) : (
                <div className="border-t border-border pt-3 space-y-2">
                  {connections.length === 0 ? (
                    <p className="text-xs text-ink/40">Add a WordPress connection above to publish this draft.</p>
                  ) : (
                    <div className="flex items-center gap-3 flex-wrap">
                      <select
                        value={selectedConnectionId ?? ""}
                        onChange={(e) => setSelectedConnectionId(Number(e.target.value))}
                        className="text-sm rounded-lg bg-panel border border-border px-2 py-1.5 outline-none"
                      >
                        {connections.map((c) => (
                          <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                      </select>
                      <button
                        onClick={publish}
                        disabled={publishing}
                        className="text-sm rounded-lg bg-accent text-white px-4 py-1.5 hover:opacity-90 disabled:opacity-50"
                      >
                        {publishing ? "Publishing…" : "Publish as WordPress draft"}
                      </button>
                    </div>
                  )}
                  {publishError && <div className="text-xs text-danger">{publishError}</div>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
