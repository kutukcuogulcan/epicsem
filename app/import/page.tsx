"use client";

import { useEffect, useRef, useState } from "react";
import type { BulkImportResult } from "@/types";
import PromptBlock from "@/components/PromptBlock";
import { buildBulkImportFixPrompt } from "@/lib/claude-code-prompt";
import FAQSection from "@/components/FAQSection";
import ExampleScenario from "@/components/ExampleScenario";
import ToolPageHeader from "@/components/ToolPageHeader";
import ImportOverview from "@/components/tool/ImportOverview";

const SCENARIO_STEPS = [
  {
    title: "Sadece site adresi yazılır",
    body: "Kurulum, eklenti ya da masaüstü programı yok — alan adını yazıp \"Siteyi tara\"ya basmak yeterli.",
  },
  {
    title: "Epicsem tüm siteyi kendisi tarar",
    body: "robots.txt ve sitemap'ler okunur, iç linkler takip edilir; her sayfanın durum kodu, title'ı, meta açıklaması, H1'leri, kelime sayısı, canonical ve noindex bilgisi toplanır.",
  },
  {
    title: "Site genelinde sorunlar tek seferde çıkar",
    body: "12 sayfada eksik meta açıklaması, 3 sayfada kırık link, 5 sayfada thin content tespit edilir — hepsi grafikli tek bir panoda.",
  },
  {
    title: "Fix prompt'u kategoriye göre gruplanır",
    body: "\"Fix with Claude Code\" ile her sorun kategorisi için örnek URL'li bir prompt üretilir.",
  },
  {
    title: "Düzelt, tekrar tara, farkı gör",
    body: "Düzeltmelerden sonra aynı siteyi yeniden tara — pano, sorun sayısının taramadan taramaya nasıl düştüğünü gösterir.",
  },
];

const FAQ_ITEMS = [
  {
    q: "Ek bir program ya da dosya gerekiyor mu?",
    a: "Hayır. Epicsem siteyi kendi tarayıcısıyla tarar: robots.txt ve sitemap'leri okur, iç linkleri takip eder. Sadece alan adını yazman yeterli.",
  },
  {
    q: "Kaç sayfa taranıyor?",
    a: "Tarama başına 50, 150 ya da 300 sayfa seçebilirsin. Büyük sitelerde sitemap'teki sayfalar önceliklidir; süre sınırına takılan taramalar \"kısmi\" olarak işaretlenir.",
  },
  {
    q: "Bunun Audit'ten farkı ne?",
    a: "Audit tek bir URL'yi derinlemesine (SEO + AI erişimi) inceler. Site Taraması ise tüm siteyi gezip eksik/tekrarlayan title ve meta açıklaması, thin content, kırık link, eksik H1 ve noindex sayfaları site genelinde tek panoda gösterir.",
  },
  {
    q: "Bulunan sorunları nasıl düzeltirim?",
    a: "\"Fix with Claude Code\" ile her sorun kategorisine göre gruplanmış, örnek URL'li bir prompt üretilir — bunu kendi site kodun/deposu üzerinde çalışan Claude Code'a yapıştırıp toplu düzeltebilirsin.",
  },
];

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

const ROWS_SHOWN = 300;

const PAGE_LIMITS = [50, 150, 300];

export default function ImportPage() {
  const [url, setUrl] = useState("");
  const [maxPages, setMaxPages] = useState(150);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [issueFilter, setIssueFilter] = useState<string>("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [loading]);

  function show(data: BulkImportResult) {
    setResult(data);
    setIssueFilter("all");
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function crawl(e: React.FormEvent) {
    e.preventDefault();
    const v = url.trim();
    if (!v) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/import/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: v, maxPages }),
      });
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Tarama başarısız oldu");
      show(data);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti");
    } finally {
      setLoading(false);
    }
  }

  async function loadRun(id: number) {
    setError(null);
    try {
      const res = await fetch(`/api/import/runs?id=${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Tarama yüklenemedi");
      show(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti");
    }
  }

  const problemRows = result ? result.rows.filter((r) => r.issues.length > 0) : [];
  const filteredRows = result
    ? issueFilter === "all"
      ? problemRows
      : result.rows.filter((r) => r.issues.includes(issueFilter))
    : [];
  const issueChips = result
    ? Object.entries(ISSUE_LABEL)
        .map(([code, label]) => ({ code, label, n: result.rows.filter((r) => r.issues.includes(code)).length }))
        .filter((c) => c.n > 0)
        .sort((a, b) => b.n - a.n)
    : [];

  return (
    <div className="space-y-8">
      <ToolPageHeader
        breadcrumbLabel="Site Taraması"
        title="Site Taraması"
        body="Tüm siteni tek seferde tara — kırık linkler, eksik/tekrarlayan title ve meta, thin content ve noindex sayfalar tek panoda."
      />

      <ImportOverview refreshKey={refreshKey} onPick={loadRun} />

      <div id="yeni-tarama" className="scroll-mt-24 pt-4 border-t border-border">
        <h2 className="text-lg font-bold">Yeni tarama</h2>
        <p className="text-sm text-ink/50">Sadece sitenin adresini yaz — sitemap ve iç linkler üzerinden tüm sayfalar otomatik taranır.</p>
      </div>

      <form
        onSubmit={crawl}
        className="flex flex-col sm:flex-row gap-2 rounded-2xl border border-border bg-panel p-2 shadow-sm transition-all focus-within:border-accent/50 focus-within:shadow-lg focus-within:shadow-accent/10"
      >
        <div className="flex flex-1 items-center gap-2 px-3">
          <span className="text-ink/30">🌐</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Taranacak site — ör. siteniz.com"
            disabled={loading}
            className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-ink/35 disabled:opacity-60"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={maxPages}
            onChange={(e) => setMaxPages(Number(e.target.value))}
            disabled={loading}
            className="rounded-xl border border-border bg-panel px-3 py-2.5 text-sm font-semibold text-ink/70 outline-none"
            title="En fazla taranacak sayfa"
          >
            {PAGE_LIMITS.map((n) => (
              <option key={n} value={n}>{n} sayfa</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="rounded-xl bg-accent px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-accent/25 hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Taranıyor…" : "Siteyi tara →"}
          </button>
        </div>
      </form>

      {loading && (
        <div className="rounded-2xl border border-border bg-panel p-5">
          <div className="flex items-center gap-3 text-sm text-ink/70">
            <span className="h-4 w-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
            Sitemap okunuyor, sayfalar taranıyor… <span className="tabular-nums text-ink/40">{elapsed} sn</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-accent transition-all duration-1000" style={{ width: `${Math.min(95, (elapsed / 90) * 100)}%` }} />
          </div>
          <p className="mt-2 text-xs text-ink/40">Sayfa sayısına göre 20 sn – 2 dk sürer.</p>
        </div>
      )}

      {error && <div className="rounded-2xl border border-danger/40 bg-danger/5 p-4 text-sm text-danger">{error}</div>}

      {result && (
        <div ref={resultRef} className="scroll-mt-24 space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold">{result.filename}</h2>
              <p className="text-sm text-ink/50">
                {result.summary.totalRows} sayfa · {problemRows.length} sayfada sorun · {new Date(result.importedAt).toLocaleString("tr-TR")}
              </p>
            </div>
          </div>

          {issueChips.length === 0 ? (
            <div className="rounded-2xl border border-seo/30 bg-seo/5 p-4 text-sm font-semibold text-seo">Herhangi bir sorun tespit edilmedi — bu tarama temiz döndü.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setIssueFilter("all")}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${issueFilter === "all" ? "border-accent bg-accent text-white" : "border-border bg-panel text-ink/60 hover:border-ink/30"}`}
              >
                Tümü · {problemRows.length}
              </button>
              {issueChips.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => setIssueFilter(c.code)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${issueFilter === c.code ? "border-accent bg-accent text-white" : "border-border bg-panel text-ink/60 hover:border-ink/30"}`}
                >
                  {c.label} · {c.n}
                </button>
              ))}
            </div>
          )}

          {filteredRows.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-border bg-panel">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-ink/45">
                      <th className="px-5 py-2.5 font-medium">Sayfa</th>
                      <th className="py-2.5 pr-3 font-medium">Durum</th>
                      <th className="py-2.5 pr-3 font-medium">Title</th>
                      <th className="py-2.5 pr-3 font-medium">Kelime</th>
                      <th className="py-2.5 pr-5 font-medium">Sorunlar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.slice(0, ROWS_SHOWN).map((row) => (
                      <tr key={row.url} className="border-t border-border align-top hover:bg-muted/40">
                        <td className="px-5 py-2.5 max-w-xs truncate font-medium" title={row.url}>{row.url.replace(/^https?:\/\/(www\.)?/, "")}</td>
                        <td className="py-2.5 pr-3">
                          <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${row.statusCode && row.statusCode >= 400 ? "bg-danger/10 text-danger" : row.statusCode && row.statusCode >= 300 ? "bg-warn/10 text-warn" : "bg-muted text-ink/60"}`}>
                            {row.statusCode || "—"}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 max-w-[14rem] truncate text-ink/70" title={row.title ?? ""}>{row.title ?? <span className="text-danger">yok</span>}</td>
                        <td className="py-2.5 pr-3 tabular-nums text-ink/60">{row.wordCount ?? "—"}</td>
                        <td className="py-2.5 pr-5">
                          <div className="flex flex-wrap gap-1">
                            {row.issues.map((i) => (
                              <span key={i} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-ink/60">{ISSUE_LABEL[i] ?? i}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredRows.length > ROWS_SHOWN && (
                <p className="border-t border-border px-5 py-2 text-xs text-ink/40">
                  {filteredRows.length} sayfadan ilk {ROWS_SHOWN} tanesi gösteriliyor — filtreyi daraltın.
                </p>
              )}
            </div>
          )}

          <PromptBlock
            title="Fix with Claude Code"
            description="Bu taramanın bulduğu her sorunu kategoriye göre gruplayıp örnek URL'lerle özetleyen bir prompt — sitenizin repo/CMS'inde çalışan Claude Code'a yapıştırın."
            prompt={buildBulkImportFixPrompt(result)}
          />
        </div>
      )}

      <ExampleScenario heading="50 sayfalık bir site, tek adresle baştan sona taranıyor" steps={SCENARIO_STEPS} />

      <FAQSection items={FAQ_ITEMS} />
    </div>
  );
}
