"use client";

import { useEffect, useState } from "react";
import type { BulkImportResult } from "@/types";
import PromptBlock from "@/components/PromptBlock";
import { buildBulkImportFixPrompt } from "@/lib/claude-code-prompt";
import FAQSection from "@/components/FAQSection";
import ExampleScenario from "@/components/ExampleScenario";
import ToolPageHeader from "@/components/ToolPageHeader";
import SiteAuditReport, { type RunSummary } from "@/components/tool/SiteAuditReport";
import GhostChart from "@/components/tool/GhostChart";

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

export default function ImportPage() {
  const [url, setUrl] = useState("");
  const [maxPages, setMaxPages] = useState(150);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [currentId, setCurrentId] = useState<number | null>(null);

  async function loadRuns(): Promise<RunSummary[]> {
    try {
      const r = await fetch("/api/import/runs");
      const d = r.ok ? await r.json() : { runs: [] };
      setRuns(d.runs ?? []);
      return d.runs ?? [];
    } catch {
      setRuns([]);
      return [];
    }
  }

  async function loadRun(id: number) {
    setError(null);
    try {
      const res = await fetch(`/api/import/runs?id=${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Tarama yüklenemedi");
      setResult(data);
      setCurrentId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti");
    }
  }

  // Sayfa açılınca son taramanın raporu hemen görünsün (Ahrefs'teki proje panosu gibi).
  useEffect(() => {
    loadRuns().then((list) => {
      if (list.length) loadRun(list[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [loading]);

  async function crawl(e: React.FormEvent) {
    e.preventDefault();
    const v = url.trim();
    if (!v) return;
    setLoading(true);
    setError(null);
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
      await loadRuns();
      setResult(data);
      setCurrentId(data.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <ToolPageHeader
        breadcrumbLabel="Site Taraması"
        title="Site Taraması"
        body="Tüm siteni tara: sağlık skoru, hatalar/uyarılar/bildirimler, tematik puanlar ve her sorun için neden önemli, nasıl düzeltilir."
      />

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
            Sitemap okunuyor, sayfalar ve linkler taranıyor… <span className="tabular-nums text-ink/40">{elapsed} sn</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-accent transition-all duration-1000" style={{ width: `${Math.min(95, (elapsed / 90) * 100)}%` }} />
          </div>
          <p className="mt-2 text-xs text-ink/40">Sayfa sayısına göre 20 sn – 2 dk sürer.</p>
        </div>
      )}

      {error && <div className="rounded-2xl border border-danger/40 bg-danger/5 p-4 text-sm text-danger">{error}</div>}

      {runs === null && !result && (
        <div className="space-y-3 animate-pulse">
          <div className="grid gap-4 lg:grid-cols-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-44 rounded-2xl bg-muted" />)}
          </div>
          <div className="h-28 rounded-2xl bg-muted" />
        </div>
      )}

      {runs !== null && runs.length === 0 && !result && !loading && (
        <GhostChart
          title="Henüz site taraması yok"
          body="Yukarıya sitenin adresini yaz — sağlık skoru, hatalar, uyarılar, durum kodları ve tık derinliği burada tek bir raporla gösterilir."
        />
      )}

      {result && (
        <>
          <SiteAuditReport result={result} runs={runs ?? []} currentId={currentId} onSelectRun={loadRun} />
          <PromptBlock
            title="Fix with Claude Code"
            description="Bu taramanın bulduğu her sorunu kategoriye göre gruplayıp örnek URL'lerle özetleyen bir prompt — sitenizin repo/CMS'inde çalışan Claude Code'a yapıştırın."
            prompt={buildBulkImportFixPrompt(result)}
          />
        </>
      )}

      <ExampleScenario heading="50 sayfalık bir site, tek adresle baştan sona taranıyor" steps={SCENARIO_STEPS} />

      <FAQSection items={FAQ_ITEMS} />
    </div>
  );
}
