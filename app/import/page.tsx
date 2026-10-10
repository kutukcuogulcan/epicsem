"use client";

import { useEffect, useRef, useState } from "react";
import type { BulkImportResult } from "@/types";
import PromptBlock from "@/components/PromptBlock";
import { buildBulkImportFixPrompt } from "@/lib/claude-code-prompt";
import FAQSection from "@/components/FAQSection";
import ExampleScenario from "@/components/ExampleScenario";
import ToolPageHeader from "@/components/ToolPageHeader";
import ImportOverview from "@/components/tool/ImportOverview";
import { ISSUE_LABEL, ISSUE_GROUPS, CRITICAL_ISSUES } from "@/lib/bulk-labels";
import type { BulkImportRow } from "@/types";

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
    a: "Hayır. Epicsem siteyi kendi tarayıcısıyla tarar: robots.txt ve sitemap'leri okur, iç linkleri takip eder.",
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

const ROWS_SHOWN = 300;

const PAGE_LIMITS = [50, 150, 300];

function short(u: string) {
  return u.replace(/^https?:\/\/(www\.)?/, "");
}

function Stat({ label, value, bad = false }: { label: string; value: React.ReactNode; bad?: boolean }) {
  return (
    <div className="rounded-lg bg-muted/60 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-ink/40">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${bad ? "text-danger" : "text-ink/80"}`}>{value}</div>
    </div>
  );
}

/** Tablo satırı + tıklayınca açılan Screaming Frog tarzı sayfa ayrıntısı. */
function PageRow({ row, open, onToggle }: { row: BulkImportRow; open: boolean; onToggle: () => void }) {
  const m = row.metrics;
  const sc = row.statusCode;
  return (
    <>
      <tr onClick={onToggle} className={`cursor-pointer border-t border-border align-top hover:bg-muted/40 ${open ? "bg-muted/40" : ""}`}>
        <td className="max-w-xs truncate px-5 py-2.5 font-medium" title={row.url}>
          <span className="mr-1.5 inline-block text-ink/30">{open ? "▾" : "▸"}</span>
          {short(row.url)}
        </td>
        <td className="py-2.5 pr-3">
          <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${sc && sc >= 400 ? "bg-danger/10 text-danger" : sc && sc >= 300 ? "bg-warn/10 text-warn" : sc === 0 ? "bg-danger/10 text-danger" : "bg-muted text-ink/60"}`}>
            {sc === 0 ? "hata" : sc ?? "—"}
          </span>
        </td>
        <td className={`py-2.5 pr-3 tabular-nums ${m?.responseMs && m.responseMs > 1500 ? "text-danger" : "text-ink/60"}`}>{m?.responseMs != null ? `${m.responseMs} ms` : "—"}</td>
        <td className="py-2.5 pr-3 tabular-nums text-ink/60">{row.wordCount ?? "—"}</td>
        <td className="py-2.5 pr-3 tabular-nums text-ink/60">{m ? m.inlinks : "—"}</td>
        <td className="py-2.5 pr-3 tabular-nums text-ink/60">{m?.depth ?? "—"}</td>
        <td className="py-2.5 pr-5">
          {row.issues.length === 0 ? (
            <span className="text-xs font-semibold text-seo">✓</span>
          ) : (
            <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${row.issues.some((i) => CRITICAL_ISSUES.has(i)) ? "bg-danger/10 text-danger" : "bg-warn/10 text-warn"}`}>{row.issues.length}</span>
          )}
        </td>
      </tr>
      {open && (
        <tr className="bg-muted/20">
          <td colSpan={7} className="px-5 pb-5 pt-2">
            <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
              <div className="space-y-2 text-sm">
                <div><span className="text-xs text-ink/40">Title ({row.titleLength ?? 0})</span><div className="font-medium">{row.title ?? <span className="text-danger">yok</span>}</div></div>
                <div><span className="text-xs text-ink/40">Meta açıklama ({row.metaDescriptionLength ?? 0})</span><div className="text-ink/70">{row.metaDescription ?? <span className="text-danger">yok</span>}</div></div>
                <div><span className="text-xs text-ink/40">H1 ({row.h1Count})</span><div className="text-ink/70">{row.h1 ?? <span className="text-danger">yok</span>}</div></div>
                <div><span className="text-xs text-ink/40">Canonical</span><div className="truncate text-ink/70">{row.canonical ?? "—"}</div></div>
                {row.issues.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {row.issues.map((i) => (
                      <span key={i} className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${CRITICAL_ISSUES.has(i) ? "bg-danger/10 text-danger" : "bg-warn/10 text-warn"}`}>{ISSUE_LABEL[i] ?? i}</span>
                    ))}
                  </div>
                )}
              </div>
              {m && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <Stat label="Boyut" value={m.htmlKb != null ? `${m.htmlKb} KB` : "—"} bad={(m.htmlKb ?? 0) > 500} />
                    <Stat label="Görsel / alt'sız" value={`${m.imagesTotal} / ${m.imagesMissingAlt}`} bad={m.imagesMissingAlt > 0} />
                    <Stat label="H2" value={m.h2Count} />
                    <Stat label="İç / dış link" value={`${m.internalOut} / ${m.externalOut}`} />
                    <Stat label="Dil" value={m.lang ?? "—"} bad={!m.lang && sc === 200} />
                    <Stat label="Sitemap" value={m.inSitemap ? "var" : "yok"} />
                  </div>
                  <div className="text-xs text-ink/60">
                    <span className="text-ink/40">Schema: </span>
                    {m.schemaTypes.length ? m.schemaTypes.join(", ") : <span className="text-warn">yok</span>}
                    {row.metaRobots && <><span className="ml-3 text-ink/40">Robots: </span>{row.metaRobots}</>}
                    {m.redirectTarget && <><span className="ml-3 text-ink/40">→ </span>{short(m.redirectTarget)}</>}
                  </div>
                  {m.brokenOutlinks.length > 0 && (
                    <div className="text-xs">
                      <div className="font-semibold text-danger">Kırık sayfalara giden linkler</div>
                      {m.brokenOutlinks.slice(0, 5).map((u) => (
                        <div key={u} className="truncate text-ink/60">{short(u)}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function ImportPage() {
  const [url, setUrl] = useState("");
  const [maxPages, setMaxPages] = useState(150);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [issueFilter, setIssueFilter] = useState<string>("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const [view, setView] = useState<"issues" | "all">("issues");
  const [openUrl, setOpenUrl] = useState<string | null>(null);
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
    setView("issues");
    setOpenUrl(null);
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
  const counts: Record<string, number> = {};
  for (const r of result?.rows ?? []) for (const c of r.issues) counts[c] = (counts[c] ?? 0) + 1;
  const tableRows = !result
    ? []
    : view === "all"
      ? result.rows
      : issueFilter === "all"
        ? [...problemRows].sort((a, b) => b.issues.length - a.issues.length)
        : result.rows.filter((r) => r.issues.includes(issueFilter));

  return (
    <div className="space-y-8">
      <ToolPageHeader
        breadcrumbLabel="Site Taraması"
        title="Site Taraması"
        body="Tüm siteni tek seferde tara — yanıt kodları, kırık iç linkler, yönlendirme zincirleri, yetim sayfalar, title/meta, görseller, schema ve hız tek panoda."
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
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">{result.filename}</h2>
              <p className="text-sm text-ink/50">
                {result.summary.totalRows} sayfa · {problemRows.length} sayfada sorun · {new Date(result.importedAt).toLocaleString("tr-TR")}
              </p>
            </div>
            <div className="flex rounded-xl border border-border bg-panel p-1 text-xs font-semibold">
              {(["issues", "all"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setView(t)}
                  className={`rounded-lg px-3 py-1.5 ${view === t ? "bg-ink text-white" : "text-ink/55 hover:text-ink"}`}
                >
                  {t === "issues" ? "Sorunlar" : `Tüm sayfalar · ${result.rows.length}`}
                </button>
              ))}
            </div>
          </div>

          {view === "issues" && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {ISSUE_GROUPS.map((g) => {
                const items = g.codes.map((code) => ({ code, n: counts[code] ?? 0 })).filter((x) => x.n > 0);
                return (
                  <div key={g.label} className="rounded-2xl border border-border bg-panel p-4">
                    <div className="flex items-center justify-between text-xs font-bold text-ink/50">
                      <span>{g.label}</span>
                      <span className={items.length ? "text-ink/70" : "text-seo"}>{items.length ? items.reduce((a, x) => a + x.n, 0) : "✓"}</span>
                    </div>
                    <div className="mt-2 space-y-1">
                      {items.length === 0 && <div className="text-xs text-ink/35">Sorun yok</div>}
                      {items.map((x) => (
                        <button
                          key={x.code}
                          type="button"
                          onClick={() => setIssueFilter(issueFilter === x.code ? "all" : x.code)}
                          className={`flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-xs transition-colors ${issueFilter === x.code ? "bg-accent text-white" : "hover:bg-muted"}`}
                        >
                          <span className="flex items-center gap-1.5">
                            <span className={`h-1.5 w-1.5 rounded-full ${CRITICAL_ISSUES.has(x.code) ? "bg-danger" : "bg-warn"}`} />
                            {ISSUE_LABEL[x.code] ?? x.code}
                          </span>
                          <span className="font-bold tabular-nums">{x.n}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {problemRows.length === 0 && view === "issues" && (
            <div className="rounded-2xl border border-seo/30 bg-seo/5 p-4 text-sm font-semibold text-seo">Herhangi bir sorun tespit edilmedi — bu tarama temiz döndü.</div>
          )}

          {tableRows.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-border bg-panel">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
                <span className="text-sm font-bold">
                  {view === "all" ? "Tüm sayfalar" : issueFilter === "all" ? "Sorunlu sayfalar" : ISSUE_LABEL[issueFilter]}
                  <span className="ml-2 font-normal text-ink/40">{tableRows.length}</span>
                </span>
                {issueFilter !== "all" && view === "issues" && (
                  <button type="button" onClick={() => setIssueFilter("all")} className="text-xs font-semibold text-accent hover:underline">Filtreyi temizle</button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-ink/45">
                      <th className="px-5 py-2.5 font-medium">Sayfa</th>
                      <th className="py-2.5 pr-3 font-medium">Durum</th>
                      <th className="py-2.5 pr-3 font-medium">Yanıt</th>
                      <th className="py-2.5 pr-3 font-medium">Kelime</th>
                      <th className="py-2.5 pr-3 font-medium" title="Gelen iç link">İç link</th>
                      <th className="py-2.5 pr-3 font-medium" title="Ana sayfadan tık sayısı">Derinlik</th>
                      <th className="py-2.5 pr-5 font-medium">Sorun</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.slice(0, ROWS_SHOWN).map((row) => (
                      <PageRow key={row.url} row={row} open={openUrl === row.url} onToggle={() => setOpenUrl(openUrl === row.url ? null : row.url)} />
                    ))}
                  </tbody>
                </table>
              </div>
              {tableRows.length > ROWS_SHOWN && (
                <p className="border-t border-border px-5 py-2 text-xs text-ink/40">
                  {tableRows.length} sayfadan ilk {ROWS_SHOWN} tanesi gösteriliyor — filtreyi daraltın.
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
