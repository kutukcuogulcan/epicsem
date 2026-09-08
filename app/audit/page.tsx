"use client";

import { useEffect, useState } from "react";
import type { SeoAuditResult, IssueCategory } from "@/types";
import ScoreGauge from "@/components/ScoreGauge";
import IssueCard from "@/components/IssueCard";
import FixCard from "@/components/FixCard";
import PromptBlock from "@/components/PromptBlock";
import { buildAuditFixPrompt } from "@/lib/claude-code-prompt";
import Breadcrumb from "@/components/Breadcrumb";
import FAQSection from "@/components/FAQSection";
import ExampleScenario from "@/components/ExampleScenario";
import { useAgencyName } from "@/lib/use-agency-name";

const SCENARIO_STEPS = [
  {
    title: "Domain girilir",
    body: "Site sahibi kendi domainini /audit'e girer ve taramayı başlatır.",
  },
  {
    title: "İki farklı skor çıkar",
    body: "Teknik SEO skoru 82/100 — title, meta, schema düzgün. Ama AXO skoru 35/100: robots.txt dosyası GPTBot'u ve ClaudeBot'u engelliyor.",
  },
  {
    title: "Fix prompt'u üretilir",
    body: "\"Fix with Claude Code\" ile robots.txt'teki engeli kaldıracak somut bir prompt oluşturulur — hiçbir şey uydurulmaz, sadece taranan sayfanın kendi verisine dayanır.",
  },
  {
    title: "Geliştirici düzeltmeyi uygular",
    body: "Prompt, sitenin kendi reposunda çalışan Claude Code'a yapıştırılır, robots.txt güncellenir ve yayına alınır.",
  },
  {
    title: "Sonraki koşuda ilerleme görülür",
    body: "Bir hafta sonra tekrar audit çalıştırıldığında AXO skoru 35'ten 88'e çıkar, engellenen bot sayısı 0'a iner — bu ilerleme indirilebilir bir PDF rapor olarak müşteriyle paylaşılır.",
  },
];

const FAQ_ITEMS = [
  {
    q: "Bu denetim tam olarak neyi kontrol ediyor?",
    a: "Title/meta açıklaması, başlık (H1) yapısı, structured data (schema), robots.txt & sitemap varlığı — ve ayrıca GPTBot, ClaudeBot, PerplexityBot, Google-Extended gibi AI crawler'ların sayfaya gerçekten erişip erişemediği.",
  },
  {
    q: "SEO skoru ile AXO skoru arasındaki fark ne?",
    a: "SEO skoru klasik teknik sağlamlığı ölçer (başlıklar, meta, schema). AXO skoru özellikle AI motorlarının crawler'larının sayfaya erişip erişemediğini ölçer — bir site teknik olarak sağlam olup SEO'da yüksek puan alırken, robots.txt'i GPTBot'u engellediği için AXO'da düşük çıkabilir.",
  },
  {
    q: "Önerilen düzeltmeler nereden geliyor, uyduruluyor mu?",
    a: "Hayır — fix önerileri (meta açıklaması, Organization/FAQ şeması) sadece taranan sayfanın kendi içeriğinden üretiliyor. Model bir şeye dayanak bulamazsa onu üretmiyor.",
  },
  {
    q: "Sonucu müşterime nasıl gönderebilirim?",
    a: "Denetim tamamlandıktan sonra \"Download PDF report\" ile indirilebilir bir PDF alabilirsin. \"Ajans adınız\" kutusuna kendi ajans/marka adını yazarsan PDF'in üst kısmında Epicsem yerine o isim görünür — bu isim tarayıcında hatırlanır, tekrar yazmana gerek kalmaz. Birden fazla müşterin varsa Clients'a kaydedip her koşuyu o müşteriyle ilişkilendirebilirsin.",
  },
];

const CATEGORY_LABEL: Record<IssueCategory, string> = {
  meta: "Meta & title",
  headings: "Başlıklar",
  schema: "Structured data",
  crawlability: "Crawlability",
  "ai-crawlability": "AI crawler erişimi (AXO)",
  performance: "Performans",
  content: "İçerik derinliği",
  localization: "Dil & yerelleştirme",
};

interface PreviousAuditRun {
  score: number;
  aiCrawlScore: number;
  blockedBots: number;
  createdAt: string;
}

function TrendChip({ label, delta, lowerIsBetter = false }: { label: string; delta: number; lowerIsBetter?: boolean }) {
  if (delta === 0) return <span className="text-ink/40">{label} değişmedi</span>;
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  return (
    <span className={improved ? "text-seo" : "text-danger"}>
      {label} {delta > 0 ? "+" : ""}
      {delta} (önceki koşuya göre)
    </span>
  );
}

export default function AuditPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SeoAuditResult | null>(null);
  const [previousRun, setPreviousRun] = useState<PreviousAuditRun | null>(null);
  const [agencyName, setAgencyName] = useAgencyName();

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
      setError("Taranacak bir URL girin.");
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
      if (!res.ok) throw new Error(data.error ?? "Denetim başarısız oldu");
      setResult(data);
      setPreviousRun(data.previousRun ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti");
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
        agencyName: agencyName.trim() || undefined,
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
        <Breadcrumb items={[{ label: "Ana Sayfa", href: "/" }, { label: "SEO + AXO Audit" }]} />
        <h1 className="text-3xl font-extrabold tracking-tight">SEO + AXO Audit</h1>
        <p className="text-ink/60 text-sm">
          Title, meta, başlıklar, schema ve sitemap gibi temelleri kontrol eder — ayrıca GPTBot, ClaudeBot,
          PerplexityBot, Google-Extended gibi AI crawler&apos;ların sayfaya gerçekten erişip erişemediğini gösterir.
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
          className="rounded-lg bg-accent text-white px-5 py-2.5 text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? "Taranıyor…" : "Denetimi başlat"}
        </button>
      </form>

      {error && <div className="card border-danger/40 text-danger text-sm">{error}</div>}

      {result && (
        <div className="space-y-8">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <input
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              placeholder="Ajans adınız (opsiyonel — PDF'te görünür)"
              className="w-64 rounded-lg bg-panel border border-border px-3 py-1.5 text-xs outline-none focus:border-accent"
            />
            <button
              onClick={downloadPdf}
              className="text-xs rounded-lg border border-border px-3 py-1.5 hover:bg-muted text-ink/70"
            >
              PDF rapor indir
            </button>
          </div>

          <PromptBlock
            title="Fix with Claude Code"
            description="Bu denetimin bulgularıyla önceden doldurulmuş bir prompt — sitenizin reposunda çalışan Claude Code'a yapıştırın, güvenle otomatik düzeltilebilecekleri düzeltsin."
            prompt={buildAuditFixPrompt(result)}
          />
          <div className="card flex flex-wrap items-center gap-8">
            <ScoreGauge label="Teknik SEO skoru" score={result.score} colorClass="text-seo" />
            <ScoreGauge label="AI crawlability (AXO) skoru" score={result.aiCrawlScore} colorClass="text-accent" />
            <div className="text-sm text-ink/60 space-y-1">
              <div><span className="text-ink/40">URL:</span> {result.url}</div>
              <div><span className="text-ink/40">Başlık:</span> {result.meta.title ?? "—"}</div>
              <div><span className="text-ink/40">Kelime sayısı:</span> ~{result.meta.wordCount}</div>
              <div><span className="text-ink/40">Structured data:</span> {result.meta.hasSchema ? result.meta.schemaTypes.join(", ") : "yok"}</div>
              {previousRun && (
                <div className="flex flex-wrap gap-x-4 pt-1 text-xs">
                  <TrendChip label="SEO" delta={result.score - previousRun.score} />
                  <TrendChip label="AXO" delta={result.aiCrawlScore - previousRun.aiCrawlScore} />
                  <TrendChip
                    label="Engellenen bot"
                    delta={result.meta.aiBotAccess.filter((b) => !b.allowed).length - previousRun.blockedBots}
                    lowerIsBetter
                  />
                </div>
              )}
              {!previousRun && (
                <div className="pt-1 text-xs text-ink/30">Bu URL için ilk kaydedilen koşu — sonraki koşularda burada bir trend görünecek.</div>
              )}
            </div>
          </div>

          <div className="card">
            <h2 className="font-bold mb-3">AI crawler erişimi</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
              {result.meta.aiBotAccess.map((b) => (
                <div key={b.bot} className="flex items-center justify-between rounded-lg bg-muted px-3 py-2">
                  <span>{b.bot} <span className="text-ink/40">({b.engine})</span></span>
                  <span className={b.allowed ? "text-seo" : "text-danger"}>{b.allowed ? "İzinli" : "Engelli"}</span>
                </div>
              ))}
            </div>
          </div>

          {result.fixes.length > 0 && (
            <div className="space-y-3">
              <div>
                <h2 className="font-bold">Düzeltmeler</h2>
                <p className="text-sm text-ink/50">
                  Bu sayfanın kendi içeriğinden üretildi — hiçbir şey uydurulmadı. Yayınlamadan önce gözden geçirip yapıştırın.
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
              <h2 className="font-bold">{CATEGORY_LABEL[group.cat]}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {group.issues.map((issue, i) => (
                  <IssueCard key={i} issue={issue} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ExampleScenario heading="Bir mobilya e-ticaret sitesi audit'ten geçiyor" steps={SCENARIO_STEPS} />

      <FAQSection items={FAQ_ITEMS} />
    </div>
  );
}
