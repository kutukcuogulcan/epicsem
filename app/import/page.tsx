"use client";

import { useEffect, useRef, useState } from "react";
import type { BulkImportResult } from "@/types";
import PromptBlock from "@/components/PromptBlock";
import { buildBulkImportFixPrompt } from "@/lib/claude-code-prompt";
import Breadcrumb from "@/components/Breadcrumb";

interface RunListItem {
  id: number;
  filename: string;
  rowCount: number;
  createdAt: string;
}

const ISSUE_LABEL: Record<string, string> = {
  broken: "Broken (4xx/5xx)",
  redirect: "Redirect",
  "missing-title": "Missing title",
  "title-too-long": "Title too long",
  "duplicate-title": "Duplicate title",
  "missing-meta-description": "Missing meta description",
  "meta-description-too-long": "Meta description too long",
  "duplicate-meta-description": "Duplicate meta description",
  "missing-h1": "Missing H1",
  "multiple-h1": "Multiple H1s",
  "thin-content": "Thin content",
  "non-indexable": "Non-indexable",
  "noindex-tag": "Noindex tag",
};

const SUMMARY_LABEL: Record<string, string> = {
  missingTitle: "Missing title",
  duplicateTitles: "URLs with duplicate title",
  titleTooLong: "Title too long",
  missingMetaDescription: "Missing meta description",
  duplicateMetaDescriptions: "URLs with duplicate meta description",
  metaDescriptionTooLong: "Meta description too long",
  missingH1: "Missing H1",
  multipleH1: "Multiple H1s",
  thinContent: "Thin content (<200 words)",
  brokenLinks: "Broken (4xx/5xx)",
  redirects: "Redirects",
  nonIndexable: "Non-indexable",
  noindexTag: "Noindex tag",
};

const ROWS_SHOWN = 300;

function SummaryTile({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  if (value === 0) return null;
  return (
    <div className="rounded-lg bg-muted px-3 py-2 text-sm flex items-center justify-between gap-3">
      <span className="text-ink/60">{label}</span>
      <span className={warn ? "text-danger font-medium" : "font-medium"}>{value}</span>
    </div>
  );
}

export default function ImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [issueFilter, setIssueFilter] = useState<string>("all");
  const [history, setHistory] = useState<RunListItem[]>([]);

  useEffect(() => {
    fetch("/api/import/screaming-frog")
      .then((res) => (res.status === 401 ? { runs: [] } : res.json()))
      .then((data) => setHistory(data.runs ?? []))
      .catch(() => {});
  }, [result]);

  async function upload(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Only .csv files are supported — export 'Internal → All' from Screaming Frog.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setIssueFilter("all");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/import/screaming-frog", { method: "POST", body: form });
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function loadRun(id: number) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/import/screaming-frog?id=${id}`);
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load import");
      setResult(data);
      setIssueFilter("all");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const filteredRows = result
    ? issueFilter === "all"
      ? result.rows.filter((r) => r.issues.length > 0)
      : result.rows.filter((r) => r.issues.includes(issueFilter))
    : [];

  const issueCounts = result
    ? Object.entries(result.summary).filter(([k, v]) => k !== "totalRows" && (v as number) > 0)
    : [];

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Breadcrumb items={[{ label: "Ana Sayfa", href: "/" }, { label: "Bulk Import" }]} />
        <h1 className="text-2xl font-semibold">Bulk Site Import (Screaming Frog)</h1>
        <p className="text-ink/60 text-sm max-w-3xl">
          Epicsem's own audit checks one URL at a time — for a full site sweep, export{" "}
          <span className="text-ink/80">Internal → All</span> as CSV from Screaming Frog and drop it here. Epicsem
          maps the columns, flags missing/duplicate titles &amp; meta descriptions, thin content, broken links,
          missing H1s and noindex pages across every URL in the crawl — something no single-page tool (Arvow
          included) does at all.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) upload(file);
        }}
        className={`card border-2 border-dashed text-center py-10 cursor-pointer transition-colors ${
          dragOver ? "border-accent bg-accent/5" : "border-border"
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = "";
          }}
        />
        <p className="text-sm text-ink/70">
          {loading ? "Parsing…" : "Drop a Screaming Frog CSV export here, or click to choose a file"}
        </p>
        <p className="text-xs text-ink/40 mt-1">.csv only, up to 25MB</p>
      </div>

      {error && <div className="card border-danger/40 text-danger text-sm">{error}</div>}

      {history.length > 0 && !result && (
        <div className="card space-y-2">
          <h2 className="font-medium text-sm">Previous imports</h2>
          <div className="space-y-1">
            {history.map((h) => (
              <button
                key={h.id}
                onClick={() => loadRun(h.id)}
                className="w-full flex items-center justify-between text-sm rounded-lg hover:bg-muted px-3 py-2 text-left"
              >
                <span>{h.filename}</span>
                <span className="text-ink/40 text-xs">{h.rowCount} URLs · {new Date(h.createdAt).toLocaleString()}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-6">
          <div className="card space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-medium">{result.filename}</h2>
              <span className="text-xs text-ink/40">{result.summary.totalRows} URLs · imported {new Date(result.importedAt).toLocaleString()}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {issueCounts.map(([key, value]) => (
                <SummaryTile
                  key={key}
                  label={SUMMARY_LABEL[key] ?? key}
                  value={value as number}
                  warn={["brokenLinks", "missingTitle", "missingMetaDescription"].includes(key)}
                />
              ))}
              {issueCounts.length === 0 && (
                <div className="text-sm text-seo col-span-full">No issues detected — this crawl came back clean.</div>
              )}
            </div>
          </div>

          <PromptBlock
            title="Fix with Claude Code"
            description="A prompt summarizing every issue this crawl found, grouped by category with sample URLs — paste it into Claude Code running in your site's repo/CMS to fix what's safe to fix in bulk."
            prompt={buildBulkImportFixPrompt(result)}
          />

          {filteredRows.length > 0 && (
            <div className="card space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="font-medium">URLs with issues ({result.rows.filter((r) => r.issues.length > 0).length})</h2>
                <select
                  value={issueFilter}
                  onChange={(e) => setIssueFilter(e.target.value)}
                  className="text-xs rounded-lg bg-panel border border-border px-2 py-1.5 outline-none"
                >
                  <option value="all">All issues</option>
                  {Object.entries(ISSUE_LABEL).map(([code, label]) => (
                    <option key={code} value={code}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-ink/40 border-b border-border">
                      <th className="py-2 pr-3">URL</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Title</th>
                      <th className="py-2 pr-3">Words</th>
                      <th className="py-2">Issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.slice(0, ROWS_SHOWN).map((row) => (
                      <tr key={row.url} className="border-b border-border/50 align-top">
                        <td className="py-2 pr-3 max-w-xs truncate" title={row.url}>{row.url}</td>
                        <td className="py-2 pr-3">{row.statusCode ?? "—"}</td>
                        <td className="py-2 pr-3 max-w-xs truncate" title={row.title ?? ""}>{row.title ?? <span className="text-danger">missing</span>}</td>
                        <td className="py-2 pr-3">{row.wordCount ?? "—"}</td>
                        <td className="py-2 text-ink/60">
                          {row.issues.map((i) => ISSUE_LABEL[i] ?? i).join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredRows.length > ROWS_SHOWN && (
                  <p className="text-xs text-ink/40 pt-2">
                    Showing first {ROWS_SHOWN} of {filteredRows.length} matching URLs — narrow with the filter above to see more specific results.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
