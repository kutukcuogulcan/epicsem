"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import type { EngineId, GeoRunResult, GeoVisibilitySummary, SourceDomainStat, SourceDomainType, TopicVisibility, UrlStat, UrlType } from "@/types";
import UsageMeter from "@/components/UsageMeter";
import StatCard from "@/components/StatCard";
import GaugeStatCard from "@/components/GaugeStatCard";
import GradientBar from "@/components/GradientBar";
import SavedPromptsPanel from "@/components/SavedPromptsPanel";
import ScoreBadge from "@/components/ScoreBadge";
import FAQSection from "@/components/FAQSection";
import ExampleScenario from "@/components/ExampleScenario";
import ToolPageHeader from "@/components/ToolPageHeader";
import GeoOverview from "@/components/tool/GeoOverview";
import OnboardingWizard from "@/components/OnboardingWizard";

const SCENARIO_STEPS = [
  {
    title: "Marka ve rakipler girilir",
    body: "Marka adı, domain ve iki rakip eklenir.",
  },
  {
    title: "Prompt önerisi istenir",
    body: "\"✨ Prompt öner\" ile hem markayı adıyla soran hem de kategoriyi genel soran promptlar otomatik oluşturulur; \"Fiyat: X ne kadar tutar?\" gibi konu etiketleriyle işaretlenir.",
  },
  {
    title: "Test dört motora gönderilir",
    body: "ChatGPT, Claude, Gemini ve Perplexity'e aynı promptlar gönderilir.",
  },
  {
    title: "Sonuç: marka-bilinende görünür, keşifte görünmez",
    body: "Marka adıyla sorulan promptlarda %90 görünürlük çıkar, ama \"bu kategoride en iyi markalar hangileri?\" gibi keşif promptlarında %10'un altında kalır — markayı henüz bilmeyen biri AI'dan onu hiç duymuyor.",
  },
  {
    title: "Konu kırılımı zayıf noktayı gösterir",
    body: "\"Fiyat\" konulu promptlarda görünürlük en düşük çıkar — bu bulgu hangi içeriğin öncelikli üretilmesi gerektiğini gösterir.",
  },
];

const FAQ_ITEMS = [
  {
    q: "Hangi AI motorlarını gerçekten test ediyor?",
    a: "ChatGPT (OpenAI), Claude (Anthropic), Gemini (Google) ve Perplexity gerçek API entegrasyonuyla çalışır; DeepSeek ve Grok da gerçek entegre. Meta AI ve Microsoft Copilot'un genel API'si olmadığı için bu ikisi her zaman simüle çalışır — ekranda \"demo only\" olarak işaretli.",
  },
  {
    q: "Sonuçlar gerçek mi, simülasyon mu?",
    a: "İlgili motorun API anahtarı tanımlıysa gerçek bir sorgu gönderilir. Tanımlı değilse sistem demo modda çalışır ve sonuçlar gerçekçi ama simüle edilmiştir — bu durum ekranda açıkça \"demo mode\" olarak belirtilir.",
  },
  {
    q: "\"Konu: prompt metni\" etiketlemesi ne işe yarar?",
    a: "Bir satırı Konu: prompt metni şeklinde yazarsan (örn. Fiyat: X ne kadar tutar?) sonuçlarda hangi konularda görünür, hangi konularda görünmez olduğunu ayrı ayrı gösteren bir kırılım çıkar. Konu vermezsen \"Genel\" sayılır.",
  },
  {
    q: "Marka-bilinen (branded) ve keşif (discovery) prompt farkı ne?",
    a: "Marka-bilinen bir prompt markanı adıyla soruyor (\"X güvenilir mi?\"); keşif promptu ise markanı hiç duymamış birinin sorabileceği genel bir kategori sorusu (\"bu alanda en iyi araçlar hangileri?\"). İkisi ayrı ölçülür çünkü ikisi farklı bir şey söyler: biri seni zaten bilenler, diğeri seni henüz keşfetmemiş olanlar için görünürlüğünü gösterir.",
  },
  {
    q: "Aylık kaç sorgu hakkım var?",
    a: "Ücretsiz planda GEO/AEO ve Gap Analysis birlikte, ayda toplam 300 AI motor sorgusu (prompt sayısı × motor sayısı) içeriyor. Demo modda hiçbir sorgu bu kotadan düşmez.",
  },
];

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
  meta: "Meta AI (sadece demo)",
  microsoft: "Copilot (sadece demo)",
};

// Pre-checked by default — the four engines with a real API integration. DeepSeek/Grok
// have real integrations too but are opt-in by default to keep a first run fast; Meta AI
// and Copilot have no public API at all (see lib/geo-providers.ts) so they always run
// simulated — still useful to include since they're real, commonly-cited GEO surfaces.
const DEFAULT_ENGINES: EngineId[] = ["openai", "anthropic", "google", "perplexity"];

const EN_PROMPT_PRESET = "best tools for [your category]\nhow to choose a [your category] tool\n[brand] vs [competitor]";
const TR_PROMPT_PRESET =
  "[kategori] için en iyi markalar hangileri?\nİstanbul'da [kategori] konusunda hangi firmayı önerirsiniz?\n[marka] güvenilir mi?\n[marka] ile [rakip] arasındaki fark ne?";

// 8-category domain-type taxonomy (Kart: Overview/Domain/URL metrics spec §8).
const DOMAIN_TYPE_COLOR: Record<SourceDomainType, string> = {
  You: "bg-seo",
  Competitor: "bg-danger",
  Corporate: "bg-blue-400",
  Editorial: "bg-orange-400",
  Government: "bg-slate-500",
  Reference: "bg-accent",
  UGC: "bg-warn",
  Other: "bg-ink/20",
};

const DOMAIN_TYPE_LABEL: Record<SourceDomainType, string> = {
  You: "Siz",
  Competitor: "Rakip",
  Corporate: "Kurumsal",
  Editorial: "Editoryal",
  Government: "Kamu/Kurum",
  Reference: "Referans",
  UGC: "Kullanıcı içeriği",
  Other: "Diğer",
};

const DOMAIN_TYPE_ORDER: SourceDomainType[] = ["You", "Competitor", "Corporate", "Editorial", "Government", "Reference", "UGC", "Other"];

// 11-category URL-type taxonomy (Kart §8).
const URL_TYPE_LABEL: Record<UrlType, string> = {
  Home: "Ana sayfa",
  Category: "Kategori",
  Product: "Ürün",
  Listicle: "Listicle",
  Comparison: "Karşılaştırma",
  Profile: "Profil",
  Alternative: "Alternatif",
  Discussion: "Tartışma",
  HowTo: "Nasıl yapılır",
  Article: "Makale",
  Other: "Diğer",
};

/** Kart §6 — Retrieval rate/Citation rate are averages, never percentages: never ×100, never "%". */
function fmtRate(n: number): string {
  return n.toFixed(2);
}

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
  const [urlStats, setUrlStats] = useState<UrlStat[] | null>(null);
  const [chatCount, setChatCount] = useState<number>(0);
  const [insufficientData, setInsufficientData] = useState(false);
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
  const [resultsTab, setResultsTab] = useState<"visibility" | "sentiment" | "prompts" | "sources" | "urls">("visibility");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [overviewKey, setOverviewKey] = useState(0);
  const autoRunRef = useRef(false);

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

  // Fires exactly once after the onboarding wizard finishes — waits for the brand/prompts
  // state it just set to actually land (state updates aren't visible in the same tick the
  // wizard's onComplete callback runs in) before auto-submitting the real GEO test.
  useEffect(() => {
    if (autoRunRef.current && brand.name && brand.domain && prompts.length > 0) {
      autoRunRef.current = false;
      runTest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, prompts]);

  function handleWizardComplete(wizardBrand: BrandRow, wizardCompetitors: BrandRow[], wizardPromptsText: string) {
    setBrand(wizardBrand);
    setCompetitors(wizardCompetitors.length > 0 ? wizardCompetitors : [{ name: "", domain: "" }]);
    setPromptsText(wizardPromptsText);
    // Deliberately NOT closing the wizard here — it stays mounted showing its own
    // "running" animation (driven by the `running` prop below) until the real test this
    // triggers actually finishes, then closes itself.
    autoRunRef.current = true;
  }

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
      if (!res.ok) throw new Error(data.error ?? "Prompt önerisi başarısız oldu");
      const lines = (data.suggestions as { topic: string; text: string }[]).map((s) => `${s.topic}: ${s.text}`);
      setPromptsText(lines.join("\n"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti");
    } finally {
      setSuggesting(false);
    }
  }

  async function runTest(e?: React.FormEvent) {
    e?.preventDefault();
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
    setUrlStats(null);
    setChatCount(0);
    setInsufficientData(false);
    setTopicBreakdown(null);
    setBrandedSplit(null);
    setPreviousSummaries(null);
    setPreviousRunAt(null);
    setHistory(null);
    setRunResultsFilter("");
    setRunEngineFilter("all");
    setResultsTab("visibility");
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
      if (!res.ok) throw new Error(data.error ?? "Test başarısız oldu");
      setRuns(data.runs);
      setSummaries(data.summaries);
      setOverviewKey((k) => k + 1);
      setSourceDistribution(data.sourceDistribution);
      if (Array.isArray(data.urlStats)) setUrlStats(data.urlStats);
      if (typeof data.chatCount === "number") setChatCount(data.chatCount);
      setInsufficientData(Boolean(data.insufficientData));
      if (Array.isArray(data.topicBreakdown)) setTopicBreakdown(data.topicBreakdown);
      if (data.brandedSplit) setBrandedSplit(data.brandedSplit);
      setDemoMode(data.demoMode);
      if (data.previousRun) {
        setPreviousSummaries(data.previousRun.summaries);
        setPreviousRunAt(data.previousRun.createdAt);
      }
      if (Array.isArray(data.history)) setHistory(data.history);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti");
    } finally {
      setLoading(false);
    }
  }

  const chartData = summaries?.map((s) => ({
    name: s.brand,
    "Görünürlük": Math.round(s.visibility * 100),
    "Pazar payı": Math.round(s.shareOfVoice * 100),
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

  // Same history rows as the visibility trend, plotting avgSentiment instead — real,
  // already-persisted data (geo_runs.summaries_json includes avgSentiment per brand per
  // run), so this costs nothing extra to compute. A brand/run with no sentiment score
  // yet (avgSentiment null — e.g. it was never mentioned) just leaves a gap in its line.
  const sentimentTrendData = useMemo(() => {
    if (!history || history.length < 2) return null;
    return history.map((h) => {
      const point: Record<string, string | number> = {
        date: new Date(h.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      };
      h.summaries.forEach((s) => {
        if (s.avgSentiment != null) point[s.brand] = s.avgSentiment;
      });
      return point;
    });
  }, [history]);

  // The three headline numbers, own-brand only — mirrors the stat-card row real
  // AI-visibility dashboards (e.g. Arvow's LLM Visibility Tracker) lead with, instead
  // of making you read them out of the comparison table below.
  const ownSummary = summaries?.find((s) => s.domain === brand.domain) ?? summaries?.[0] ?? null;

  // Per-AI-engine breakdown (ChatGPT vs Claude vs Gemini vs Perplexity vs …) — the
  // "LLM Breakdown" panel real AI-visibility dashboards (e.g. Arvow) show next to their
  // headline number. Only computable from the current run's raw results (engine-level
  // data isn't persisted in geo_runs, only brand/topic aggregates), so this reflects the
  // latest test only, not history.
  const engineBreakdown = useMemo(() => {
    if (!runs || runs.length === 0) return null;
    const byEngine = new Map<EngineId, { mentioned: number; total: number; sentiments: number[] }>();
    for (const r of runs) {
      const cur = byEngine.get(r.engine) ?? { mentioned: 0, total: 0, sentiments: [] };
      cur.total += 1;
      if (r.mentioned) cur.mentioned += 1;
      if (r.sentiment != null) cur.sentiments.push(r.sentiment);
      byEngine.set(r.engine, cur);
    }
    return Array.from(byEngine.entries())
      .map(([engine, v]) => ({
        engine,
        visibility: Math.round((v.mentioned / v.total) * 100),
        sentiment: v.sentiments.length ? Math.round(v.sentiments.reduce((a, b) => a + b, 0) / v.sentiments.length) : null,
        total: v.total,
      }))
      .sort((a, b) => b.visibility - a.visibility);
  }, [runs]);

  const filteredRuns = runs?.filter(
    (r) =>
      (runEngineFilter === "all" || r.engine === runEngineFilter) &&
      (runResultsFilter.trim() === "" || r.promptText.toLowerCase().includes(runResultsFilter.trim().toLowerCase()))
  );

  return (
    <div className="space-y-8">
      <ToolPageHeader
        breadcrumbLabel="GEO/AEO Visibility"
        title="GEO / AEO Visibility"
        body="Markanın ChatGPT, Claude, Gemini ve Perplexity cevaplarında ne sıklıkla, kaçıncı sırada ve hangi kaynaklarla geçtiği."
      >
        <UsageMeter metric="engineQueries" />
      </ToolPageHeader>

      <GeoOverview refreshKey={overviewKey} />

      <div id="yeni-test" className="scroll-mt-24 pt-4 border-t border-border">
        <h2 className="text-lg font-bold">Yeni test</h2>
        <p className="text-sm text-ink/50">Adresini gir, gerisini biz kuralım — ya da markayı ve promptları elle yaz.</p>
      </div>

      {wizardOpen ? (
        <OnboardingWizard onComplete={handleWizardComplete} onClose={() => setWizardOpen(false)} running={loading} />
      ) : (
        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          className="group flex w-full items-center gap-4 rounded-2xl border border-accent/30 bg-gradient-to-r from-accent/[0.06] to-transparent p-5 text-left transition-all hover:border-accent hover:shadow-lg hover:shadow-accent/10"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-lg text-white shadow-md shadow-accent/30">🪄</span>
          <span className="flex-1">
            <span className="block font-bold">URL ile otomatik kur</span>
            <span className="block text-sm text-ink/55">Adresini gir; marka profili, rakipler, konu başlıkları ve promptlar senin için üretilsin.</span>
          </span>
          <span className="text-accent transition-transform group-hover:translate-x-1">→</span>
        </button>
      )}

      {!wizardOpen && (
      <form onSubmit={runTest} className="space-y-5">
        <div className="card space-y-3">
          <h2 className="font-bold text-sm">Markanız</h2>
          <div className="grid grid-cols-2 gap-3">
            <input
              value={brand.name}
              onChange={(e) => setBrand((b) => ({ ...b, name: e.target.value }))}
              placeholder="Marka adı"
              required
              className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <input
              value={brand.domain}
              onChange={(e) => setBrand((b) => ({ ...b, domain: e.target.value }))}
              placeholder="marka-domaini.com"
              required
              className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
        </div>

        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm">Rakipler (opsiyonel)</h2>
            <button
              type="button"
              onClick={() => setCompetitors((c) => [...c, { name: "", domain: "" }])}
              className="text-xs text-accent hover:underline"
            >
              + Rakip ekle
            </button>
          </div>
          {competitors.map((c, i) => (
            <div key={i} className="grid grid-cols-2 gap-3">
              <input
                value={c.name}
                onChange={(e) => updateCompetitor(i, "name", e.target.value)}
                placeholder="Rakip adı"
                className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <input
                value={c.domain}
                onChange={(e) => updateCompetitor(i, "domain", e.target.value)}
                placeholder="rakip-domaini.com"
                className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
          ))}
        </div>

        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm">Promptlar (satır satır)</h2>
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
                EN örnek
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
          <div className="rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-xs text-ink/60">
            <span className="font-semibold text-accent">🇹🇷 Türkiye pazarı ipucu:</span> LLM&apos;ler Türkçe bir
            soruyu İngilizce eşdeğerinden farklı bir kaynak karışımıyla yanıtlayabiliyor — hedef kitleniz Türkiye
            ise <button type="button" onClick={() => setPromptsText(TR_PROMPT_PRESET)} className="text-accent hover:underline font-medium">TR örneği</button> ile
            de test edin, İngilizce sonucun aynen geçerli olacağını varsaymayın.
          </div>
          <UsageMeter metric="promptSuggestions" />
        </div>

        <div className="card space-y-3">
          <h2 className="font-bold text-sm">Motorlar</h2>
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
          className="rounded-lg bg-accent text-white px-5 py-2.5 text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? "Çalışıyor…" : `${prompts.length} prompt × ${engines.length} motoru çalıştır`}
        </button>
      </form>
      )}

      <SavedPromptsPanel
        brand={brand}
        competitors={competitors.filter((c) => c.name && c.domain)}
        engines={engines}
      />

      {error && <div className="card border-danger/40 text-danger text-sm">{error}</div>}

      {demoMode && summaries && (
        <div className="card border-warn/40 text-warn text-sm">
          <strong>Demo modda</strong> çalışıyor — hiçbir LLM API anahtarı tanımlı değil, bu yüzden aşağıdaki
          yanıtlar simüle edilmiştir (açıkça işaretli) ve panelin nasıl çalıştığını gösterir. Gerçek sonuçlar için
          <code>.env</code>&apos;e gerçek anahtarlar ekleyin.
        </div>
      )}

      {summaries && ownSummary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <GaugeStatCard
            label="Görünürlük"
            score={Math.round(ownSummary.visibility * 100)}
            description={`${ownSummary.brand} kaç promptta görünüyor`}
            tone={ownSummary.visibility >= 0.5 ? "seo" : ownSummary.visibility >= 0.2 ? "warn" : "danger"}
          />
          <StatCard
            label="Duygu tonu"
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
            label="Promptlar"
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

      {insufficientData && summaries && (
        <div className="card border-ink/20 text-ink/50 text-sm">
          Bu koşuda yalnızca {chatCount} sohbet var (prompt × motor). 10 sohbetin altında metrikler istatistiksel
          olarak gürültülü olabilir — aşağıdaki değerleri yönlendirici olarak okuyun, kesin kabul etmeyin.
        </div>
      )}

      {summaries && (
        <div className="flex gap-1 text-sm border-b border-border overflow-x-auto">
          {(
            [
              { key: "visibility", label: "Görünürlük" },
              { key: "sentiment", label: "Duygu" },
              { key: "prompts", label: `Promptlar${runs ? ` (${runs.length})` : ""}` },
              { key: "sources", label: "Domain" },
              { key: "urls", label: "URL" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setResultsTab(t.key)}
              className={`px-3 pb-2 -mb-px border-b-2 whitespace-nowrap ${
                resultsTab === t.key ? "border-accent text-accent font-semibold" : "border-transparent text-ink/50 hover:text-ink/80"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {resultsTab === "visibility" && engineBreakdown && engineBreakdown.length > 1 && (
        <div className="card">
          <h2 className="font-bold">AI motoru bazında görünürlük</h2>
          <p className="text-sm text-ink/50 mb-4">
            Son koşuda {ownSummary?.brand ?? "markanız"} hangi motorda ne kadar görünüyor — bazı motorlar sizi
            hiç anmıyorken diğerleri anabilir, bu fark hangi motora öncelik vermeniz gerektiğini gösterir.
          </p>
          <div className="space-y-3">
            {engineBreakdown.map((e) => (
              <div key={e.engine} className="flex items-center gap-3 text-sm">
                <div className="w-40 truncate text-ink/70 shrink-0">{ENGINE_LABEL[e.engine]}</div>
                <GradientBar value={e.visibility} className="flex-1" />
                <div className="w-32 text-right text-ink/50 text-xs shrink-0">
                  %{e.visibility} görünürlük{e.sentiment != null ? ` · ${e.sentiment} ton` : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {resultsTab === "sentiment" && engineBreakdown && engineBreakdown.length > 0 && (
        <div className="card">
          <h2 className="font-bold">AI motoru bazında duygu tonu</h2>
          <p className="text-sm text-ink/50 mb-4">
            Son koşuda {ownSummary?.brand ?? "markanız"} hangi motorda ne kadar olumlu tanımlanıyor — 0 en olumsuz,
            100 en olumlu.
          </p>
          <div className="space-y-3">
            {engineBreakdown
              .filter((e) => e.sentiment != null)
              .map((e) => (
                <div key={e.engine} className="flex items-center gap-3 text-sm">
                  <div className="w-40 truncate text-ink/70 shrink-0">{ENGINE_LABEL[e.engine]}</div>
                  <GradientBar value={e.sentiment as number} className="flex-1" />
                  <div className="w-24 text-right text-ink/50 text-xs shrink-0">{e.sentiment} ton</div>
                </div>
              ))}
            {engineBreakdown.every((e) => e.sentiment == null) && (
              <p className="text-sm text-ink/40">
                Bu koşuda hiçbir motorda markanız anılmadığı için bir duygu tonu ölçülemedi.
              </p>
            )}
          </div>
        </div>
      )}

      {resultsTab === "sentiment" && sentimentTrendData && (
        <div className="card">
          <h2 className="font-bold mb-1">Duygu trendi</h2>
          <p className="text-sm text-ink/50 mb-4">
            Bu domain için kaydedilen her koşuda marka bazında duygu tonu ({sentimentTrendData.length} koşu).
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sentimentTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e0f5" />
                <XAxis dataKey="date" stroke="#8a8398" fontSize={12} />
                <YAxis stroke="#8a8398" fontSize={12} domain={[0, 100]} />
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
      {resultsTab === "sentiment" && !sentimentTrendData && (
        <div className="card text-sm text-ink/40">
          Duygu trendini görmek için bu domain için en az 2 koşu kaydedilmiş olmalı — daha sonra tekrar çalıştırın.
        </div>
      )}

      {resultsTab === "visibility" && summaries && (
        <div className="card">
          <h2 className="font-bold mb-4">Görünürlük ve pazar payı</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e0f5" />
                <XAxis dataKey="name" stroke="#8a8398" fontSize={12} />
                <YAxis stroke="#8a8398" fontSize={12} unit="%" />
                <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e5e0f5", color: "#1e1b29" }} />
                <Legend />
                <Bar dataKey="Görünürlük" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Pazar payı" fill="#a78bfa" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-ink/40 text-left">
                <tr>
                  <th className="py-2 pr-4">#</th>
                  <th className="py-2 pr-4">Marka</th>
                  <th className="py-2 pr-4">Görünürlük</th>
                  <th className="py-2 pr-4">Pazar payı</th>
                  <th className="py-2 pr-4">Duygu tonu</th>
                  <th className="py-2 pr-4">Pozisyon</th>
                  <th className="py-2 pr-4">Atıf</th>
                  {previousSummaries && <th className="py-2 pr-4">Δ görünürlük</th>}
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
                          {delta == null ? "yeni" : `${delta > 0 ? "+" : ""}${delta}pp`}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-ink/30">
              {previousSummaries
                ? `Bu markanın önceki koşusuyla karşılaştırıldı (${new Date(previousRunAt ?? "").toLocaleString()}).`
                : "Bu marka için ilk kaydedilen koşu — dönemsel trendi görmek için daha sonra tekrar çalıştırın."}
            </p>
          </div>
        </div>
      )}

      {resultsTab === "visibility" && trendData && (
        <div className="card">
          <h2 className="font-bold mb-1">Görünürlük trendi</h2>
          <p className="text-sm text-ink/50 mb-4">
            Bu domain için kaydedilen her koşuda marka bazında görünürlük ({trendData.length} koşu).
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

      {resultsTab === "sources" && sourceDistribution && sourceDistribution.length > 0 && (
        <div className="card">
          <h2 className="font-bold">Domain metrikleri</h2>
          <p className="text-sm text-ink/50 mb-4">
            AI motorlarının tüm koşularda hangi domainleri kaynak gösterdiği. &ldquo;Retrieved %&rdquo; ve
            &ldquo;Retrieval rate&rdquo; henüz gösterilmiyor — bunlar modelin cevabı üretirken baktığı ama
            metinde atıf vermediği URL&apos;leri de yakalayan ayrı bir sinyal gerektiriyor, bu da henüz kurulmadı
            (🚨 Browser tabanlı sorgu altyapısı kartı). Aşağıdaki Citation rate asla % değil, bir orandır (1&apos;i
            geçebilir).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            <div className="space-y-2">
              <div className="text-xs text-ink/40 mb-1">En çok atıf alan domainler</div>
              {sourceDistribution.slice(0, 8).map((d) => {
                const max = sourceDistribution[0].count;
                const width = Math.max(6, Math.round((d.count / max) * 100));
                return (
                  <div key={d.domain} className="flex items-center gap-3 text-sm">
                    <div className="w-32 truncate text-ink/70">{d.domain}</div>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${DOMAIN_TYPE_COLOR[d.type]}`} style={{ width: `${width}%` }} />
                    </div>
                    <div className="w-28 text-right text-ink/40 text-xs shrink-0">
                      {d.count} atıf · %{Math.round(d.citationShare * 100)} pay · {fmtRate(d.citationRate)} oran
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="space-y-2">
              <div className="text-xs text-ink/40 mb-1">
                Domain türleri · {sourceDistribution.reduce((s, d) => s + d.count, 0)} toplam atıf
              </div>
              {DOMAIN_TYPE_ORDER.map((type) => {
                const total = sourceDistribution.reduce((s, d) => s + d.count, 0) || 1;
                const count = sourceDistribution.filter((d) => d.type === type).reduce((s, d) => s + d.count, 0);
                if (count === 0) return null;
                return (
                  <div key={type} className="flex items-center gap-2 text-sm">
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${DOMAIN_TYPE_COLOR[type]}`} />
                    <span className="flex-1 text-ink/70">{DOMAIN_TYPE_LABEL[type]}</span>
                    <span className="text-ink/50 text-xs">{Math.round((count / total) * 100)}%</span>
                  </div>
                );
              })}
              <p className="text-xs text-ink/30 pt-2">
                Kurumsal/Editoryal/Kamu-Kurum sınıflandırması sezgisel bir listeye dayanır — henüz elle düzeltme
                arayüzü yok, bu nedenle bazı domainler yanlış kovaya düşebilir.
              </p>
            </div>
          </div>
        </div>
      )}

      {resultsTab === "sources" && sourceDistribution && sourceDistribution.filter((d) => d.type !== "You" && d.type !== "Competitor").length > 0 && (
        <div className="card space-y-3">
          <div>
            <h2 className="font-bold">Backlink fırsatları</h2>
            <p className="text-sm text-ink/50 mt-1">
              Bu, otomatik bir link değişim ağı değil — az önceki testte AI motorlarının bu konuda zaten kaynak
              gösterdiği, markanız veya rakipleriniz olmayan siteler. AI motorlarının güvendiğini kanıtladığı bu
              siteler, gerçek bir bağlantı/mention için iletişime geçilebilecek somut bir hedef listesi oluşturur.
            </p>
          </div>
          <div className="divide-y divide-border">
            {sourceDistribution
              .filter((d) => d.type !== "You" && d.type !== "Competitor")
              .slice(0, 8)
              .map((d) => (
                <div key={d.domain} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${DOMAIN_TYPE_COLOR[d.type]}`} />
                    <a
                      href={`https://${d.domain}`}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-ink/80 hover:text-accent hover:underline"
                    >
                      {d.domain}
                    </a>
                    <span className="text-xs text-ink/40 shrink-0">{DOMAIN_TYPE_LABEL[d.type]}</span>
                  </div>
                  <span className="text-xs text-ink/50 shrink-0">{d.count} atıf</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {resultsTab === "urls" && urlStats && urlStats.length > 0 && (
        <div className="card">
          <h2 className="font-bold">URL metrikleri</h2>
          <p className="text-sm text-ink/50 mb-4">
            Domain değil, tekil URL bazında atıf dağılımı — hangi sayfa (sadece hangi site) gerçekten kaynak
            gösteriliyor. &ldquo;Retrievals&rdquo; (kaynak olduğu sohbet sayısı, atıf almadan) aynı nedenle henüz
            yok — bkz. Domain sekmesindeki not.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-ink/40 text-left">
                <tr>
                  <th className="py-2 pr-4">URL</th>
                  <th className="py-2 pr-4">Tür</th>
                  <th className="py-2 pr-4">Toplam atıf</th>
                  <th className="py-2 pr-4">Atıf payı</th>
                  <th className="py-2 pr-4">Atıf oranı</th>
                </tr>
              </thead>
              <tbody>
                {urlStats.slice(0, 20).map((u) => (
                  <tr key={u.url} className="border-t border-border">
                    <td className="py-2 pr-4 max-w-xs truncate">
                      <a href={u.url} target="_blank" rel="noreferrer" className="text-ink/80 hover:text-accent hover:underline">
                        {u.url}
                      </a>
                    </td>
                    <td className="py-2 pr-4 text-ink/50 text-xs whitespace-nowrap">{URL_TYPE_LABEL[u.type]}</td>
                    <td className="py-2 pr-4">{u.totalCitations}</td>
                    <td className="py-2 pr-4 text-ink/50">%{Math.round(u.citationShare * 100)}</td>
                    <td className="py-2 pr-4 text-ink/50">{fmtRate(u.citationRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {resultsTab === "urls" && (!urlStats || urlStats.length === 0) && (
        <div className="card text-sm text-ink/40 text-center py-6">
          Bu koşuda hiçbir yanıt bir URL&apos;ye atıf vermedi.
        </div>
      )}

      {resultsTab === "visibility" && topicBreakdown && topicBreakdown.length > 1 && (
        <div className="card">
          <h2 className="font-bold">Konu bazında görünürlük</h2>
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

      {resultsTab === "prompts" && runs && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-bold">
              Tek tek koşular <span className="text-ink/30 font-normal">· {filteredRuns?.length ?? 0}/{runs.length}</span>
            </h2>
            <div className="flex items-center gap-2">
              <input
                value={runResultsFilter}
                onChange={(e) => {
                  setRunResultsFilter(e.target.value);
                  setExpanded(null);
                }}
                placeholder="Promptlarda ara…"
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
                <option value="all">Tüm motorlar</option>
                {Array.from(new Set(runs.map((r) => r.engine))).map((eng) => (
                  <option key={eng} value={eng}>
                    {ENGINE_LABEL[eng]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {filteredRuns?.length === 0 && (
            <div className="card text-sm text-ink/40 text-center py-6">Bu filtreye uyan koşu yok.</div>
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
                    {r.mentioned ? `#${r.position}. sırada anıldı` : "Anılmadı"}
                  </span>
                </div>
              </button>
              {expanded === i && (
                <div className="mt-4 space-y-3 text-sm">
                  <pre className="whitespace-pre-wrap text-ink/70 bg-muted rounded-lg p-3">{r.responseText}</pre>
                  {r.citations.length > 0 && (
                    <div>
                      <div className="text-ink/40 text-xs mb-1">Atıflar</div>
                      <ul className="space-y-1">
                        {r.citations.map((c, ci) => (
                          <li key={ci} className={c.isOwnDomain ? "text-seo" : "text-ink/60"}>
                            {c.domain} {c.isOwnDomain && "(kendi domaininiz)"}
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

      <ExampleScenario heading="Bir mobilya markası GEO testiyle görünmezliğini keşfediyor" steps={SCENARIO_STEPS} />

      <FAQSection items={FAQ_ITEMS} />
    </div>
  );
}
