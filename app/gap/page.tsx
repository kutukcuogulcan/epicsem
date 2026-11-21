"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { EngineId, GapRow, GeoVisibilitySummary } from "@/types";
import type { ContentBrief } from "@/lib/content-brief";
import PromptBlock from "@/components/PromptBlock";
import UsageMeter from "@/components/UsageMeter";
import { useAgencyName } from "@/lib/use-agency-name";
import QuickGeoAnalyze from "@/components/tool/QuickGeoAnalyze";
import { Drawer, ErrorBlock, PageHeader, EmptyBlock } from "@/components/ui";
import { useProject } from "@/components/ProjectProvider";
import { buildContentBriefPrompt } from "@/lib/claude-code-prompt";

/**
 * Rakip Boşluğu (Gap Analysis) — GEO / Site Denetimi ile aynı düzen:
 * soru başlığı → 5 metrik → "Ne yapmalı?" → sayfa tablosu (tıklayınca brif çekmecesi) + marka karşılaştırması.
 * Proje seçiliyse son koşu otomatik açılır; yeni analiz ve ayarlar çekmecede.
 */

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
const DEFAULT_ENGINES: EngineId[] = ["openai", "anthropic", "google", "perplexity"];
const TR_PROMPT_PRESET =
  "[kategori] için en iyi markalar hangileri?\nİstanbul'da [kategori] konusunda hangi firmayı önerirsiniz?\n[marka] güvenilir mi?\n[marka] ile [rakip] arasındaki fark ne?";

const VERDICTS: { key: GapRow["verdict"]; label: string; hint: string; color: string; chip: string }[] = [
  { key: "blocked", label: "AI'ya kapalı", hint: "robots.txt AI botlarını engelliyor", color: "#ef4444", chip: "bg-danger/10 text-danger-ink" },
  { key: "invisible", label: "Sağlam ama görünmez", hint: "Teknik olarak hazır, ama hiçbir AI motoru anmadı", color: "#4f00ff", chip: "bg-accent/10 text-accent" },
  { key: "needs-work", label: "İyileştirme gerekli", hint: "Teknik SEO / AXO puanı düşük", color: "#f59e0b", chip: "bg-warn/10 text-warn-ink" },
  { key: "cited", label: "Anılıyor", hint: "AI cevaplarında kaynak olarak geçiyor", color: "#16a34a", chip: "bg-seo/10 text-seo-ink" },
];
const V = Object.fromEntries(VERDICTS.map((v) => [v.key, v])) as Record<GapRow["verdict"], (typeof VERDICTS)[number]>;

interface BrandRow {
  name: string;
  domain: string;
}
interface Run {
  brandName: string;
  brandDomain: string;
  demoMode: boolean;
  gapMatrix: GapRow[];
  summaries: GeoVisibilitySummary[];
  contentBriefs: ContentBrief[];
  createdAt: string;
}

const host = (d: string) => d.trim().toLowerCase().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "");
function path(url: string) {
  try {
    const u = new URL(/^https?:\/\//.test(url) ? url : `https://${url}`);
    return `${u.hostname.replace(/^www\./i, "")}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return url;
  }
}
const pct = (n: number) => `%${Math.round(n * 100)}`;

const BTN1 = "inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-accent px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60";
const BTN2 = "inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-panel px-3 text-sm font-medium text-ink shadow-[inset_0_0_0_1px_#D5D7DA,0_1px_2px_rgba(13,18,28,0.05)] hover:bg-muted disabled:opacity-60";
const CARD = "rounded-2xl border border-border bg-panel shadow-[0_1px_2px_rgba(13,18,28,0.05)]";
const INPUT = "h-9 w-full rounded-[10px] border border-border bg-panel px-3 text-sm outline-none focus:border-[#BDB4FF]";
const chip = (on: boolean) =>
  `inline-flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-[13px] font-medium whitespace-nowrap ${on ? "bg-accent/5 text-ink shadow-[inset_0_0_0_1px_#BDB4FF]" : "bg-panel text-sub shadow-[inset_0_0_0_1px_#E4E5E8] hover:text-ink"}`;

export default function GapPage() {
  const { project } = useProject();
  const [brand, setBrand] = useState<BrandRow>({ name: "", domain: "" });
  const [competitors, setCompetitors] = useState<BrandRow[]>([{ name: "", domain: "" }]);
  const [promptsText, setPromptsText] = useState("");
  const [pageUrlsText, setPageUrlsText] = useState("");
  const [engines, setEngines] = useState<EngineId[]>(DEFAULT_ENGINES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [runLoaded, setRunLoaded] = useState(false);
  const [generatingUrl, setGeneratingUrl] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [agencyName, setAgencyName] = useAgencyName();
  const [manualOpen, setManualOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [vf, setVf] = useState<"all" | GapRow["verdict"]>("all");
  const autoRunRef = useRef(false);
  const [why, setWhy] = useState<{ busy: boolean; err: string | null; r: { summary: string; differences: { them: string; you: string }[]; todo: string[] } | null; rival: string; demo?: boolean } | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);

  // Proje → marka/rakip + son koşu
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("clientId")) return;
    if (!project) {
      setRunLoaded(true);
      return;
    }
    setBrand({ name: project.name, domain: project.domain });
    if (project.competitors.length) setCompetitors(project.competitors);
    setRunLoaded(false);
    fetch(`/api/gap/latest?domain=${encodeURIComponent(project.domain)}`)
      .then((r) => (r.ok ? r.json() : { run: null }))
      .then((d) => setRun(d.run ?? null))
      .catch(() => setRun(null))
      .finally(() => setRunLoaded(true));
  }, [project]);

  // Müşteri sayfasından gelindiyse
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("clientId");
    if (!id) return;
    fetch(`/api/clients/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.client) return;
        setBrand({ name: data.client.name, domain: data.client.domain });
        if (data.client.competitors.length > 0) setCompetitors(data.client.competitors);
        setPageUrlsText(data.client.domain);
        setManualOpen(true);
      })
      .catch(() => {})
      .finally(() => setRunLoaded(true));
  }, []);

  const prompts = useMemo(() => promptsText.split("\n").map((p) => p.trim()).filter(Boolean), [promptsText]);
  const pageUrls = useMemo(() => pageUrlsText.split("\n").map((p) => p.trim()).filter(Boolean), [pageUrlsText]);

  useEffect(() => {
    if (autoRunRef.current && brand.name && brand.domain && prompts.length > 0 && pageUrls.length > 0) {
      autoRunRef.current = false;
      runAnalysis();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, prompts, pageUrls]);

  function handleQuickReady(b: BrandRow, comps: BrandRow[], text: string, urls: string[]) {
    setNewOpen(false);
    setBrand(b);
    setCompetitors(comps.length > 0 ? comps : [{ name: "", domain: "" }]);
    setPromptsText(text);
    setPageUrlsText((urls.length ? urls : [b.domain]).join("\n"));
    autoRunRef.current = true;
  }

  function updateCompetitor(i: number, field: keyof BrandRow, value: string) {
    setCompetitors((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));
  }

  async function generateArticle(brief: ContentBrief) {
    setGeneratingUrl(brief.url);
    setGenerateError(null);
    try {
      const res = await fetch("/api/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...brief, brandName: run?.brandName ?? brand.name, brandDomain: run?.brandDomain ?? brand.domain }),
      });
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "İçerik üretimi başarısız oldu");
      window.location.href = `/content?draftId=${data.draft.id}`;
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Bir şeyler ters gitti");
      setGeneratingUrl(null);
    }
  }

  async function downloadPdf() {
    if (!run) return;
    const res = await fetch("/api/report/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agencyName: agencyName.trim() || undefined,
        clientName: run.brandName,
        clientDomain: run.brandDomain,
        geo: run.summaries.length ? { summaries: run.summaries } : null,
        gap: { gapMatrix: run.gapMatrix, contentBriefs: run.contentBriefs },
      }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = "epicsem-rakip-boslugu.pdf";
    a.click();
    URL.revokeObjectURL(objectUrl);
    setPdfOpen(false);
  }

  async function runWhy(rival: GeoVisibilitySummary, own: GeoVisibilitySummary | null) {
    if (!run) return;
    setWhyOpen(true);
    if (why?.r && why.rival === rival.brand) return;
    setWhy({ busy: true, err: null, r: null, rival: rival.brand });
    try {
      const lostQuestions = Array.from(new Set(run.contentBriefs.flatMap((b) => b.suggestedHeadings))).slice(0, 15);
      const r = await fetch("/api/gap/ai-why", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: { name: run.brandName, domain: run.brandDomain }, rival: { name: rival.brand, domain: rival.domain, visibility: rival.visibility }, ownVisibility: own?.visibility ?? null, lostQuestions }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Analiz başarısız");
      setWhy({ busy: false, err: null, r: d.result, rival: rival.brand, demo: !!d.demo });
      window.dispatchEvent(new Event("epicsem:usage-changed"));
    } catch (e) {
      setWhy({ busy: false, err: e instanceof Error ? e.message : "Analiz başarısız", r: null, rival: rival.brand });
    }
  }

  async function runAnalysis(e?: React.FormEvent) {
    e?.preventDefault();
    if (!brand.name || !brand.domain) return setError("Marka adını ve domainini gir.");
    if (prompts.length === 0) return setError("En az bir soru (prompt) gir.");
    if (pageUrls.length === 0) return setError("Denetlenecek en az bir sayfa adresi gir.");
    if (engines.length === 0) return setError("En az bir motor seç.");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/gap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand, competitors: competitors.filter((c) => c.name && c.domain), prompts, engines, pageUrls }),
      });
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analiz başarısız oldu");
      setRun({
        brandName: brand.name,
        brandDomain: brand.domain,
        demoMode: !!data.demoMode,
        gapMatrix: data.gapMatrix ?? [],
        summaries: data.summaries ?? [],
        contentBriefs: data.contentBriefs ?? [],
        createdAt: new Date().toISOString(),
      });
      window.dispatchEvent(new Event("epicsem:usage-changed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti");
    } finally {
      setLoading(false);
    }
  }

  /* ---------------- türetilmiş veriler ---------------- */
  const d = useMemo(() => {
    if (!run) return null;
    const m = run.gapMatrix;
    const sums = [...run.summaries].sort((a, b) => b.visibility - a.visibility);
    const own = sums.find((s) => host(s.domain) === host(run.brandDomain)) ?? sums.find((s) => s.brand.toLowerCase() === run.brandName.toLowerCase()) ?? null;
    const rank = own ? sums.indexOf(own) + 1 : null;
    const rivals = sums.filter((s) => s !== own);
    const leader = rivals[0] ?? null;
    const count = (v: GapRow["verdict"]) => m.filter((r) => r.verdict === v).length;
    return { m, sums, own, rank, leader, cited: count("cited"), invisible: count("invisible"), blocked: count("blocked"), needs: count("needs-work") };
  }, [run]);

  const briefFor = (url: string) => run?.contentBriefs.find((b) => b.url === url) ?? null;
  const openRow = run?.gapMatrix.find((r) => r.url === open) ?? null;
  const openBrief = open ? briefFor(open) : null;
  const shown = d ? d.m.filter((r) => vf === "all" || r.verdict === vf).sort((a, b) => VERDICTS.findIndex((v) => v.key === a.verdict) - VERDICTS.findIndex((v) => v.key === b.verdict)) : [];

  const actions: { kind: string; color: string; title: string; body: string; cta: React.ReactNode }[] = [];
  if (d && run) {
    const blocked = d.m.filter((r) => r.verdict === "blocked");
    if (blocked.length)
      actions.push({
        kind: "Kritik",
        color: "text-danger-ink",
        title: `${blocked.length} sayfa AI botlarına kapalı`,
        body: `${path(blocked[0].url)} için robots.txt ${blocked[0].blockedBots} AI botunu engelliyor. Bu sayfalar hiçbir AI cevabında kaynak olamaz.`,
        cta: (
          <Link href={`/audit?url=${encodeURIComponent(blocked[0].url)}`} className={BTN2}>
            Denetimde gör
          </Link>
        ),
      });
    const inv = d.m.filter((r) => r.verdict === "invisible");
    if (inv.length)
      actions.push({
        kind: "Fırsat",
        color: "text-accent",
        title: `${inv.length} sayfa sağlam ama AI'da anılmıyor`,
        body: `Teknik sorun yok; içerik soruları cevaplamıyor. ${briefFor(inv[0].url)?.suggestedHeadings.length ? `${briefFor(inv[0].url)!.suggestedHeadings.length} kaybedilen soru başlığa dönüşmeli.` : "Kısa cevap, soru başlıklar ve SSS ekle."}`,
        cta: (
          <button type="button" onClick={() => setOpen(inv[0].url)} className={BTN2}>
            Brifi aç
          </button>
        ),
      });
    if (d.leader && d.own && d.leader.visibility > d.own.visibility)
      actions.push({
        kind: "Rakip",
        color: "text-warn-ink",
        title: `${d.leader.brand} AI'da senden önde`,
        body: `${d.leader.brand} ${pct(d.leader.visibility)}, sen ${pct(d.own.visibility)} görünürlükte. Yapay zekâ iki siteyi karşılaştırıp farkı ve yapılacakları çıkarsın (1 AI sorgusu).`,
        cta: (
          <button type="button" onClick={() => runWhy(d.leader!, d.own)} className={BTN2}>
            ✦ Neden önde?
          </button>
        ),
      });
    const nw = d.m.filter((r) => r.verdict === "needs-work");
    if (actions.length < 3 && nw.length)
      actions.push({
        kind: "Teknik",
        color: "text-warn-ink",
        title: `${nw.length} sayfanın teknik puanı düşük`,
        body: `${path(nw[0].url)}: SEO ${nw[0].seoScore}, AXO ${nw[0].aiCrawlScore}. Önce teknik sorunları düzelt.`,
        cta: (
          <Link href={`/audit?url=${encodeURIComponent(nw[0].url)}`} className={BTN2}>
            Denetimde gör
          </Link>
        ),
      });
    if (!actions.length)
      actions.push({
        kind: "İyi",
        color: "text-seo-ink",
        title: "Tüm sayfalar AI'da anılıyor",
        body: "Bu koşuda denetlenen her sayfa en az bir AI cevabında kaynak olarak geçti. Yeni sayfalar ve sorularla tekrar test et.",
        cta: (
          <button type="button" onClick={() => setNewOpen(true)} className={BTN2}>
            Yeni analiz
          </button>
        ),
      });
  }

  const title = run ? `AI'da rakiplerin ${host(run.brandDomain)} sitesini nerede geçiyor?` : "Rakip Boşluğu";
  const desc = run
    ? `${run.gapMatrix.length} sayfa · ${run.summaries.length} marka · ${new Date(run.createdAt).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}${run.demoMode ? " · demo veri" : ""}`
    : "Sayfaların teknik olarak hazır mı, ve AI motorları seni mi yoksa rakiplerini mi anıyor? Tek analizde.";

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={desc}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setManualOpen(true)} className={BTN2}>
              Ayarlar
            </button>
            {run && (
              <button type="button" onClick={() => setPdfOpen(true)} className={BTN2}>
                PDF rapor
              </button>
            )}
            <button type="button" onClick={() => setNewOpen(true)} disabled={loading} className={BTN1}>
              {loading ? "Analiz ediliyor…" : "+ Yeni analiz"}
            </button>
          </div>
        }
      />

      {loading && (
        <div className={`${CARD} flex items-center gap-3 p-4 text-sm text-sub`}>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          Sayfalar denetleniyor ve AI motorlarına soruluyor. Bir iki dakika sürebilir.
        </div>
      )}
      <ErrorBlock message={error} />

      {!run && runLoaded && !loading && (
        <div className={`${CARD} p-5`}>
          <h3 className="text-sm font-semibold">{brand.domain ? `${host(brand.domain)} için henüz analiz yok` : "Henüz analiz yok"}</h3>
          <p className="mb-4 mt-1 text-[13px] text-sub">Sitenin adresini yaz. Marka, rakipler, sorular ve kritik sayfalar otomatik çıkarılır, analiz hemen başlar.</p>
          <QuickGeoAnalyze onReady={handleQuickReady} running={loading} onOpenSettings={() => setManualOpen(true)} nextPath="/gap" runLabel="Sayfalar denetleniyor" />
          <div className="mt-3">
            <UsageMeter metric="engineQueries" />
          </div>
        </div>
      )}
      {!runLoaded && <div className="h-64 animate-pulse rounded-2xl bg-muted" />}

      {run && d && (
        <>
          {run.demoMode && (
            <div className="rounded-xl border border-warn/30 bg-warn/5 px-4 py-2.5 text-[13px] text-ink/70">
              Demo veri: atıflar domain düzeyinde simüle edildi. Gerçek sonuç için AI motoru anahtarları gerekir.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {([
              ["AI görünürlüğün", d.own ? pct(d.own.visibility) : "—", "", d.own ? `pazar payı ${pct(d.own.shareOfVoice)}` : "marka cevaplarda yok", d.own && d.leader && d.own.visibility >= d.leader.visibility ? "text-seo-ink" : ""],
              ["Sıralaman", d.rank ? `${d.rank}.` : "—", `/${d.sums.length}`, d.leader ? `lider rakip: ${d.leader.brand}` : "", d.rank === 1 ? "text-seo-ink" : d.rank ? "text-warn-ink" : ""],
              ["Anılan sayfa", String(d.cited), `/${d.m.length}`, "AI cevaplarında kaynak", d.cited ? "text-seo-ink" : "text-danger-ink"],
              ["Sağlam ama görünmez", String(d.invisible), "", "içerik fırsatı", d.invisible ? "text-accent" : ""],
              ["AI'ya kapalı sayfa", String(d.blocked), "", "robots.txt engeli", d.blocked ? "text-danger-ink" : ""],
            ] as const).map(([l, v, suf, hint, col]) => (
              <div key={l} className={`${CARD} px-4 py-4`}>
                <div className="text-xs font-medium text-sub">{l}</div>
                <div className="mt-1.5 flex items-baseline gap-1">
                  <span className={`text-[26px] font-semibold leading-8 tabular-nums ${col}`}>{v}</span>
                  {suf && <span className="text-sm text-sub">{suf}</span>}
                </div>
                <div className="mt-1 h-4 truncate text-[11px] text-sub">{hint}</div>
              </div>
            ))}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Ne yapmalı?</h3>
            <div className={`grid gap-3 ${["", "md:grid-cols-1", "md:grid-cols-2", "md:grid-cols-3"][Math.min(actions.length, 3)]}`}>
              {actions.slice(0, 3).map((a) => (
                <div key={a.title} className={`${CARD} flex flex-col p-4`}>
                  <div className={`text-[11px] font-semibold uppercase tracking-wide ${a.color}`}>{a.kind}</div>
                  <h4 className="mt-1.5 text-sm font-semibold leading-5">{a.title}</h4>
                  <p className="mt-1 text-[13px] text-sub">{a.body}</p>
                  <div className="mt-auto flex justify-end pt-3">{a.cta}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.7fr_1fr]">
            {/* Sayfalar */}
            <div className={`${CARD} overflow-hidden`}>
              <div className="px-5 pt-4">
                <h3 className="text-sm font-semibold">Sayfalar</h3>
                <p className="text-xs text-sub">Teknik sağlık ile gerçek AI atfının karşılaştırması · satıra tıkla → içerik brifi</p>
              </div>
              <div className="flex flex-wrap gap-2 px-5 py-3">
                <button type="button" onClick={() => setVf("all")} className={chip(vf === "all")}>
                  Tümü <span className="text-sub">{d.m.length}</span>
                </button>
                {VERDICTS.map((v) => {
                  const n = d.m.filter((r) => r.verdict === v.key).length;
                  return n ? (
                    <button key={v.key} type="button" onClick={() => setVf(v.key)} className={chip(vf === v.key)}>
                      <span className="h-2 w-2 rounded-full" style={{ background: v.color }} />
                      {v.label} <span className="text-sub">{n}</span>
                    </button>
                  ) : null;
                })}
              </div>
              {shown.length === 0 ? (
                <div className="border-t border-border">
                  <EmptyBlock compact title="Bu filtrede sayfa yok" description="Başka bir filtre seç." />
                </div>
              ) : (
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-y border-border bg-[#fafafa] text-left text-xs text-sub">
                      <th className="py-2 pl-5 font-medium">Sayfa</th>
                      <th className="py-2 pr-3 text-right font-medium">SEO</th>
                      <th className="py-2 pr-3 text-right font-medium">AXO</th>
                      <th className="hidden py-2 pr-3 text-right font-medium md:table-cell">Atıf</th>
                      <th className="py-2 pr-5 font-medium">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {shown.map((r) => (
                      <tr key={r.url} onClick={() => setOpen(r.url)} className="cursor-pointer hover:bg-[#fafafa]">
                        <td className="max-w-[22rem] py-2.5 pl-5">
                          <div className="truncate font-medium" title={r.url}>
                            {path(r.url)}
                          </div>
                          {briefFor(r.url)?.suggestedHeadings.length ? <div className="text-[11px] text-sub">{briefFor(r.url)!.suggestedHeadings.length} kaybedilen soru</div> : null}
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{r.seoScore}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{r.aiCrawlScore}</td>
                        <td className="hidden py-2.5 pr-3 text-right tabular-nums text-sub md:table-cell" title="sayfa / domain atfı">
                          {r.citedExact} / {r.citedDomain}
                        </td>
                        <td className="py-2.5 pr-5">
                          <span title={V[r.verdict].hint} className={`whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ${V[r.verdict].chip}`}>
                            {V[r.verdict].label}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Marka karşılaştırması */}
            <div className="space-y-3">
              <div className={CARD}>
                <div className="px-5 pt-4">
                  <h3 className="text-sm font-semibold">AI'da kim önde?</h3>
                  <p className="text-xs text-sub">Bu koşudaki sorularda markaların görünürlüğü</p>
                </div>
                <ul className="space-y-2.5 px-5 pb-4 pt-3">
                  {d.sums.length ? (
                    d.sums.map((s, i) => {
                      const me = s === d.own;
                      return (
                        <li key={s.brand} className="text-[13px]">
                          <div className="flex items-center gap-2">
                            <span className="w-4 text-xs tabular-nums text-sub">{i + 1}</span>
                            <span className={`min-w-0 flex-1 truncate ${me ? "font-semibold" : ""}`}>
                              {s.brand}
                              {me && <span className="ml-1.5 rounded bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-accent">Siz</span>}
                            </span>
                            {!me && d.own && s.visibility > d.own.visibility && s.domain && (
                              <button type="button" onClick={() => runWhy(s, d.own)} title="Yapay zekâ ile karşılaştır (1 AI sorgusu)" className="text-[11px] font-medium text-accent hover:underline">
                                neden?
                              </button>
                            )}
                            <span className="tabular-nums">{pct(s.visibility)}</span>
                          </div>
                          <div className="ml-6 mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full" style={{ width: `${Math.max(2, s.visibility * 100)}%`, background: me ? "#4f00ff" : "#c4c7cf" }} />
                          </div>
                        </li>
                      );
                    })
                  ) : (
                    <li className="text-[13px] text-sub">Görünürlük verisi yok.</li>
                  )}
                </ul>
              </div>
              <div className={CARD}>
                <div className="px-5 pt-4">
                  <h3 className="text-sm font-semibold">Sayfa durumu</h3>
                </div>
                <div className="px-5 pb-4 pt-3">
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                    {VERDICTS.map((v) => {
                      const n = d.m.filter((r) => r.verdict === v.key).length;
                      return n ? <div key={v.key} style={{ width: `${(n / d.m.length) * 100}%`, background: v.color }} /> : null;
                    })}
                  </div>
                  <ul className="mt-3 space-y-1.5 text-[13px]">
                    {VERDICTS.map((v) => (
                      <li key={v.key} className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: v.color }} />
                        <span className="flex-1 text-sub">{v.label}</span>
                        <span className="tabular-nums">{d.m.filter((r) => r.verdict === v.key).length}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Sayfa / brif çekmecesi */}
      <Drawer isOpen={!!openRow} onClose={() => setOpen(null)} eyebrow={openRow ? V[openRow.verdict].label : ""} title={openRow ? path(openRow.url) : ""} subtitle={openRow ? V[openRow.verdict].hint : undefined} size="lg">
        {openRow && (
          <div className="space-y-5 text-[13px]">
            <div className="grid grid-cols-4 gap-2">
              {([
                ["SEO", openRow.seoScore],
                ["AXO", openRow.aiCrawlScore],
                ["Engelli bot", openRow.blockedBots],
                ["Atıf (sayfa/domain)", `${openRow.citedExact}/${openRow.citedDomain}`],
              ] as const).map(([l, v]) => (
                <div key={l} className="rounded-xl border border-border px-3 py-2">
                  <div className="text-[11px] text-sub">{l}</div>
                  <div className="text-base font-semibold tabular-nums">{v}</div>
                </div>
              ))}
            </div>
            {openBrief ? (
              <>
                <p className="text-sub">{openBrief.reason}</p>
                {openBrief.suggestedHeadings.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-xs font-medium text-sub">Kaybedilen sorular: bunları başlık ya da SSS maddesi yap</div>
                    <ul className="space-y-1">
                      {openBrief.suggestedHeadings.map((h) => (
                        <li key={h} className="rounded-lg bg-accent/5 px-3 py-1.5 text-ink">
                          {h}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {openBrief.contentGaps.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-xs font-medium text-sub">İçerik eksikleri</div>
                    <ul className="list-disc space-y-1 pl-4">
                      {openBrief.contentGaps.map((g) => (
                        <li key={g}>{g}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                  <button type="button" onClick={() => generateArticle(openBrief)} disabled={generatingUrl === openBrief.url} className={BTN1}>
                    {generatingUrl === openBrief.url ? "Oluşturuluyor…" : "Makale taslağı oluştur"}
                  </button>
                  <Link href={`/audit?url=${encodeURIComponent(openRow.url)}`} className={BTN2}>
                    Denetimde gör
                  </Link>
                  <span className="text-[11px] text-sub">Taslak 1 yazı kotası kullanır, otomatik yayınlanmaz.</span>
                </div>
                <ErrorBlock message={generateError} />
                <PromptBlock bare title="Claude Code ile düzelt" description="Bu sayfanın eksikleriyle hazırlanmış komut; sitenin kod deposundaki Claude Code'a yapıştır." prompt={buildContentBriefPrompt(openBrief, run?.brandName ?? brand.name)} />
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <p className="w-full text-sub">{openRow.verdict === "cited" ? "Bu sayfa AI cevaplarında zaten anılıyor; brif gerekmiyor." : "Bu sayfa için brif yok."}</p>
                <Link href={`/audit?url=${encodeURIComponent(openRow.url)}`} className={BTN2}>
                  Denetimde gör
                </Link>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Rakip neden önde? */}
      <Drawer isOpen={whyOpen} onClose={() => setWhyOpen(false)} eyebrow="Yapay zekâ karşılaştırması" title={why ? `${why.rival} neden önde?` : ""} subtitle="İki sitenin ana sayfası okunur; yalnızca sayfalarda görülen farklara dayanır." size="xl">
        <div className="space-y-5 text-[13px]">
          {why?.busy && (
            <div className="flex items-center gap-3 text-sub">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              Siteler okunuyor ve karşılaştırılıyor (15–30 sn)…
            </div>
          )}
          <ErrorBlock message={why?.err ?? null} />
          {why?.demo && <p className="rounded-lg bg-warn/5 px-3 py-2 text-xs text-ink/70">Demo mod: yapay zekâ çalışmadı, örnek çıktı gösteriliyor.</p>}
          {why?.r && (
            <>
              <p className="rounded-xl bg-accent/[0.04] p-3 leading-6">{why.r.summary}</p>
              {why.r.differences.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-border">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-[#fafafa] text-left text-xs text-sub">
                        <th className="px-3 py-2 font-medium">{why.rival}</th>
                        <th className="px-3 py-2 font-medium">{run?.brandName ?? "Sen"}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {why.r.differences.map((x) => (
                        <tr key={x.them}>
                          <td className="px-3 py-2 align-top">{x.them}</td>
                          <td className="px-3 py-2 align-top text-sub">{x.you}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {why.r.todo.length > 0 && (
                <div>
                  <div className="mb-1.5 text-xs font-medium text-sub">Bu hafta yapılabilecekler</div>
                  <ol className="space-y-1.5">
                    {why.r.todo.map((x, i) => (
                      <li key={x} className="flex gap-2 rounded-lg border border-border px-3 py-2">
                        <span className="font-semibold text-accent">{i + 1}.</span>
                        <span>{x}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <Link href="/geo" className={BTN2}>
                GEO&apos;da soruları gör
              </Link>
            </>
          )}
        </div>
      </Drawer>

      {/* Yeni analiz */}
      <Drawer isOpen={newOpen} onClose={() => setNewOpen(false)} eyebrow="Rakip Boşluğu" title="Yeni analiz" subtitle="Sitenin adresini yaz; marka, rakipler, sorular ve kritik sayfalar otomatik çıkarılır, analiz hemen başlar." size="xl">
        <div className="space-y-4">
          <QuickGeoAnalyze
            onReady={handleQuickReady}
            running={loading}
            onOpenSettings={() => {
              setNewOpen(false);
              setManualOpen(true);
            }}
            nextPath="/gap"
            runLabel="Sayfalar denetleniyor"
          />
          <UsageMeter metric="engineQueries" />
        </div>
      </Drawer>

      {/* PDF */}
      <Drawer isOpen={pdfOpen} onClose={() => setPdfOpen(false)} eyebrow="Rakip Boşluğu" title="PDF rapor" subtitle="Müşterine gönderebileceğin özet rapor." size="md">
        <div className="space-y-3">
          <div className="text-xs font-medium text-sub">Ajans adı (opsiyonel, raporda görünür)</div>
          <input value={agencyName} onChange={(e) => setAgencyName(e.target.value)} placeholder="Ajansın adı" className={INPUT} />
          <button type="button" onClick={downloadPdf} className={BTN1}>
            PDF indir
          </button>
        </div>
      </Drawer>

      {/* Elle ayarlar */}
      <Drawer
        isOpen={manualOpen}
        onClose={() => setManualOpen(false)}
        eyebrow="Rakip Boşluğu"
        title="Ayarlar"
        subtitle="Marka, rakipler, sorular, sayfalar ve motorları elle belirle."
        size="xl"
        as="form"
        onSubmit={(e: React.FormEvent) => {
          setManualOpen(false);
          runAnalysis(e);
        }}
        footer={
          <button type="submit" disabled={loading} className={`${BTN1} w-full justify-center`}>
            {loading ? "Analiz ediliyor…" : `${pageUrls.length} sayfayı ${prompts.length} soruya karşı analiz et`}
          </button>
        }
      >
        <div className="space-y-6 text-[13px]">
          <div className="space-y-2">
            <div className="text-xs font-medium text-sub">Markan</div>
            <div className="grid grid-cols-2 gap-2">
              <input value={brand.name} onChange={(e) => setBrand((b) => ({ ...b, name: e.target.value }))} placeholder="Marka adı" required className={INPUT} />
              <input value={brand.domain} onChange={(e) => setBrand((b) => ({ ...b, domain: e.target.value }))} placeholder="marka.com" required className={INPUT} />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-sub">Rakipler (opsiyonel)</div>
              <button type="button" onClick={() => setCompetitors((c) => [...c, { name: "", domain: "" }])} className="text-xs font-medium text-accent hover:underline">
                + Rakip ekle
              </button>
            </div>
            {competitors.map((c, i) => (
              <div key={i} className="grid grid-cols-2 gap-2">
                <input value={c.name} onChange={(e) => updateCompetitor(i, "name", e.target.value)} placeholder="Rakip adı" className={INPUT} />
                <input value={c.domain} onChange={(e) => updateCompetitor(i, "domain", e.target.value)} placeholder="rakip.com" className={INPUT} />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-sub">Sorular (her satıra bir tane, en fazla 10)</div>
              <button type="button" onClick={() => setPromptsText(TR_PROMPT_PRESET)} className="text-xs font-medium text-accent hover:underline">
                Örnek doldur
              </button>
            </div>
            <textarea value={promptsText} onChange={(e) => setPromptsText(e.target.value)} rows={6} placeholder={"[kategori] için en iyi markalar hangileri?\n[marka] ile [rakip] arasındaki fark ne?"} className="w-full rounded-[10px] border border-border bg-panel px-3 py-2 outline-none focus:border-[#BDB4FF]" />
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium text-sub">Denetlenecek sayfalar (her satıra bir adres)</div>
            <textarea value={pageUrlsText} onChange={(e) => setPageUrlsText(e.target.value)} rows={3} placeholder={"marka.com\nmarka.com/blog/en-iyi-yazi"} className="w-full rounded-[10px] border border-border bg-panel px-3 py-2 font-mono text-xs outline-none focus:border-[#BDB4FF]" />
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium text-sub">Motorlar</div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(ENGINE_LABEL) as EngineId[]).map((eng) => (
                <button key={eng} type="button" onClick={() => setEngines((p) => (p.includes(eng) ? p.filter((x) => x !== eng) : [...p, eng]))} className={chip(engines.includes(eng))}>
                  {ENGINE_LABEL[eng]}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-sub">Her soru × motor 1 AI sorgusu kullanır. Yalnızca anahtarı tanımlı motorlar gerçekten çalışır.</p>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
