"use client";

import { useEffect, useRef, useState } from "react";
import type { BulkImportResult } from "@/types";
import PromptBlock from "@/components/PromptBlock";
import { buildBulkImportFixPrompt } from "@/lib/claude-code-prompt";
import Breadcrumb from "@/components/Breadcrumb";
import FAQSection from "@/components/FAQSection";
import ExampleScenario from "@/components/ExampleScenario";

const SCENARIO_STEPS = [
  {
    title: "Screaming Frog ile site taranır",
    body: "Kullanıcı kendi Screaming Frog'unda siteyi tarar ve \"Internal → All\" olarak CSV dışa aktarır.",
  },
  {
    title: "CSV /import'a yüklenir",
    body: "Dosya sürükle-bırak ile yüklenir, 25MB'a kadar dosyalar kabul edilir.",
  },
  {
    title: "Site genelinde sorunlar tek seferde çıkar",
    body: "12 sayfada eksik meta açıklaması, 3 sayfada kırık link, 5 sayfada thin content tespit edilir — hepsi tek bir özet tabloda.",
  },
  {
    title: "Fix prompt'u kategoriye göre gruplanır",
    body: "\"Fix with Claude Code\" ile her sorun kategorisi için örnek URL'li bir prompt üretilir.",
  },
  {
    title: "Geliştirici toplu düzeltme yapar",
    body: "Prompt, sitenin reposunda çalışan Claude Code'a yapıştırılır ve sorunlar toplu şekilde düzeltilir.",
  },
];

const FAQ_ITEMS = [
  {
    q: "Hangi dosyayı yükleyebilirim?",
    a: "Screaming Frog'da Internal → All olarak dışa aktardığın CSV dosyasını, 25MB'a kadar. Başka bir crawler'ın CSV'si aynı sütun isimlerini kullanmıyorsa doğru eşlenmeyebilir.",
  },
  {
    q: "Bunun Audit'ten farkı ne?",
    a: "Audit tek bir URL'yi anlık olarak tarar. Bulk Import ise daha önce Screaming Frog'la taranmış tüm bir sitenin sonucunu işleyip eksik/tekrarlayan title ve meta açıklaması, thin content, kırık link, eksik H1 ve noindex sayfaları tek seferde, tüm site genelinde gösterir.",
  },
  {
    q: "Bulunan sorunları nasıl düzeltirim?",
    a: "\"Fix with Claude Code\" ile her sorun kategorisine göre gruplanmış, örnek URL'li bir prompt üretilir — bunu kendi site kodun/deposu üzerinde çalışan Claude Code'a yapıştırıp toplu düzeltebilirsin.",
  },
];

interface RunListItem {
  id: number;
  filename: string;
  rowCount: number;
  createdAt: string;
}

const ISSUE_LABEL: Record<string, string> = {
  broken: "Kırık (4xx/5xx)",
  redirect: "Yönlendirme",
  "missing-title": "Eksik title",
  "title-too-long": "Title çok uzun",
  "duplicate-title": "Tekrarlayan title",
  "missing-meta-description": "Eksik meta açıklaması",
  "meta-description-too-long": "Meta açıklaması çok uzun",
  "duplicate-meta-description": "Tekrarlayan meta açıklaması",
  "missing-h1": "Eksik H1",
  "multiple-h1": "Birden çok H1",
  "thin-content": "Yetersiz içerik",
  "non-indexable": "İndekslenemez",
  "noindex-tag": "Noindex etiketi",
};

const SUMMARY_LABEL: Record<string, string> = {
  missingTitle: "Eksik title",
  duplicateTitles: "Tekrarlayan title'lı URL",
  titleTooLong: "Title çok uzun",
  missingMetaDescription: "Eksik meta açıklaması",
  duplicateMetaDescriptions: "Tekrarlayan meta açıklamalı URL",
  metaDescriptionTooLong: "Meta açıklaması çok uzun",
  missingH1: "Eksik H1",
  multipleH1: "Birden çok H1",
  thinContent: "Yetersiz içerik (<200 kelime)",
  brokenLinks: "Kırık (4xx/5xx)",
  redirects: "Yönlendirmeler",
  nonIndexable: "İndekslenemez",
  noindexTag: "Noindex etiketi",
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
      setError("Yalnızca .csv dosyaları destekleniyor — Screaming Frog'dan 'Internal → All' olarak dışa aktarın.");
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
      if (!res.ok) throw new Error(data.error ?? "İçe aktarma başarısız oldu");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti");
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
      if (!res.ok) throw new Error(data.error ?? "İçe aktarma yüklenemedi");
      setResult(data);
      setIssueFilter("all");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti");
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
        <Breadcrumb items={[{ label: "Ana Sayfa", href: "/" }, { label: "Toplu İçe Aktarma" }]} />
        <h1 className="text-3xl font-extrabold tracking-tight">Toplu Site İçe Aktarma (Screaming Frog)</h1>
        <p className="text-ink/60 text-sm max-w-3xl">
          Epicsem&apos;in kendi denetimi tek seferde bir URL&apos;yi kontrol eder — tüm site için{" "}
          <span className="text-ink/80">Internal → All</span> olarak Screaming Frog&apos;dan CSV dışa aktarıp
          buraya bırakın. Epicsem sütunları eşler, taramadaki her URL genelinde eksik/tekrarlayan title &amp; meta
          açıklamaları, thin content, kırık linkler, eksik H1&apos;ler ve noindex sayfaları işaretler — tek sayfalık
          hiçbir aracın (Arvow dahil) yapamadığı bir şey.
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
          {loading ? "Ayrıştırılıyor…" : "Bir Screaming Frog CSV dışa aktarımını buraya bırakın, ya da dosya seçmek için tıklayın"}
        </p>
        <p className="text-xs text-ink/40 mt-1">Yalnızca .csv, 25MB'a kadar</p>
      </div>

      {error && <div className="card border-danger/40 text-danger text-sm">{error}</div>}

      {history.length > 0 && !result && (
        <div className="card space-y-2">
          <h2 className="font-bold text-sm">Önceki içe aktarmalar</h2>
          <div className="space-y-1">
            {history.map((h) => (
              <button
                key={h.id}
                onClick={() => loadRun(h.id)}
                className="w-full flex items-center justify-between text-sm rounded-lg hover:bg-muted px-3 py-2 text-left"
              >
                <span>{h.filename}</span>
                <span className="text-ink/40 text-xs">{h.rowCount} URL · {new Date(h.createdAt).toLocaleString()}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-6">
          <div className="card space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-bold">{result.filename}</h2>
              <span className="text-xs text-ink/40">{result.summary.totalRows} URL · içe aktarıldı {new Date(result.importedAt).toLocaleString()}</span>
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
                <div className="text-sm text-seo col-span-full">Herhangi bir sorun tespit edilmedi — bu tarama temiz döndü.</div>
              )}
            </div>
          </div>

          <PromptBlock
            title="Fix with Claude Code"
            description="Bu taramanın bulduğu her sorunu kategoriye göre gruplayıp örnek URL'lerle özetleyen bir prompt — sitenizin repo/CMS'inde çalışan Claude Code'a yapıştırın ve toplu düzeltmesi güvenli olanları düzeltin."
            prompt={buildBulkImportFixPrompt(result)}
          />

          {filteredRows.length > 0 && (
            <div className="card space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="font-bold">Sorunlu URL'ler ({result.rows.filter((r) => r.issues.length > 0).length})</h2>
                <select
                  value={issueFilter}
                  onChange={(e) => setIssueFilter(e.target.value)}
                  className="text-xs rounded-lg bg-panel border border-border px-2 py-1.5 outline-none"
                >
                  <option value="all">Tüm sorunlar</option>
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
                      <th className="py-2 pr-3">Durum</th>
                      <th className="py-2 pr-3">Title</th>
                      <th className="py-2 pr-3">Kelime</th>
                      <th className="py-2">Sorunlar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.slice(0, ROWS_SHOWN).map((row) => (
                      <tr key={row.url} className="border-b border-border/50 align-top">
                        <td className="py-2 pr-3 max-w-xs truncate" title={row.url}>{row.url}</td>
                        <td className="py-2 pr-3">{row.statusCode ?? "—"}</td>
                        <td className="py-2 pr-3 max-w-xs truncate" title={row.title ?? ""}>{row.title ?? <span className="text-danger">yok</span>}</td>
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
                    {filteredRows.length} eşleşen URL'den ilk {ROWS_SHOWN} tanesi gösteriliyor — daha spesifik sonuçlar için yukarıdaki filtreyi daraltın.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <ExampleScenario heading="50 sayfalık bir site, tek CSV ile toplu taranıyor" steps={SCENARIO_STEPS} />

      <FAQSection items={FAQ_ITEMS} />
    </div>
  );
}
