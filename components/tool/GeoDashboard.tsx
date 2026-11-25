"use client";

/**
 * GEO sonuç panosu — onaylanan taslak düzeni (Peec/Arvow tarzı tek ekran):
 *  motor filtresi → 5 metrik (görünürlük, SoV, kazanma oranı, pozisyon, duygu) →
 *  trend + marka sıralaması → kaynaklar + motor bazında → "Ne yapmalı?" (3 iş) → promptlar.
 * Hepsi son testin ham koşularından (prompt × motor) AI kullanmadan hesaplanır; trend için
 * önceki testler /api/overview'dan gelir.
 */
import { confidenceOf } from "@/lib/sample-size";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { GeoRunResult, GeoVisibilitySummary } from "@/types";
import { brandMentioned, rankTrackedBrands, trLower } from "@/lib/text-match";
import { findOpportunities } from "@/lib/geo-insights";
import { ENGINE_META } from "@/components/tool/MonitorBits";
import PromptResults, { groupRuns } from "@/components/tool/PromptResults";
import GeoHeatmap from "@/components/tool/GeoHeatmap";
import GeoHealthStrip from "@/components/tool/GeoHealthStrip";
import { analyzeRun, isDemoRun, writeGapHref } from "@/lib/geo-loss";

interface BrandRef {
  name: string;
  domain: string;
}
interface HistoryRun {
  id: number;
  createdAt: string;
  summaries: GeoVisibilitySummary[];
}

const PALETTE = ["#4f00ff", "#f79009", "#12b76a", "#ec4899", "#0ea5e9", "#64748b", "#a855f7"];
const clean = (d: string) => d.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase();
const pct = (x: number | null | undefined) => (x == null ? "—" : `%${Math.round(x * 100)}`);
const num1 = (x: number | null | undefined) => (x == null ? "—" : x.toFixed(1).replace(".", ","));

const UGC = ["reddit.com", "youtube.com", "quora.com", "medium.com", "x.com", "twitter.com", "facebook.com", "instagram.com", "tiktok.com", "eksisozluk.com", "linkedin.com", "sikayetvar.com", "trendyol.com", "hepsiburada.com", "amazon.com.tr", "n11.com"];
const EDITORIAL = ["hurriyet.com.tr", "milliyet.com.tr", "sabah.com.tr", "ntv.com.tr", "cnnturk.com", "sozcu.com.tr", "haberturk.com", "webtekno.com", "donanimhaber.com", "shiftdelete.net", "forbes.com", "bbc.com", "nytimes.com", "bloomberg.com", "techcrunch.com", "wired.com", "theverge.com"];
function domainType(d: string, own: string, comps: string[]): { label: string; cls: string } {
  if (d === own) return { label: "Siz", cls: "bg-accent/10 text-accent" };
  if (comps.includes(d)) return { label: "Rakip", cls: "bg-danger/10 text-danger-ink" };
  if (UGC.some((u) => d === u || d.endsWith("." + u))) return { label: "UGC", cls: "bg-warn/10 text-warn-ink" };
  if (EDITORIAL.some((u) => d === u || d.endsWith("." + u))) return { label: "Editoryal", cls: "bg-sky-50 text-sky-700" };
  if (/\.(gov|edu|bel|mil)(\.tr)?$/.test(d) || d.endsWith("wikipedia.org")) return { label: "Referans", cls: "bg-muted text-sub" };
  return { label: "Kurumsal", cls: "bg-muted text-sub" };
}

/** Bir cevapta takip edilen markaların sırası — kaydedilen GEO özetiyle aynı hesap (lib/text-match). */
const rankIn = (text: string, brands: BrandRef[], ownMentioned: boolean) => rankTrackedBrands(text, brands, ownMentioned);

function Spark({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return <div className="h-7" />;
  const w = 160,
    h = 28,
    mx = Math.max(...data),
    mn = Math.min(...data);
  const pts = data.map((v, i) => `${(i * w) / (data.length - 1)},${h - ((v - mn) / (mx - mn || 1)) * (h - 4) - 2}`);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-2 h-7 w-full">
      <path d={`M${pts.join(" L")}`} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const ringHex = (n: number) => (n >= 0.5 ? "#12b76a" : n >= 0.2 ? "#f59e0b" : "#f04438");
function Ring({ value }: { value: number }) {
  const size = 112,
    r = size / 2 - 9,
    c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Görünürlük %${Math.round(value * 100)}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef0f3" strokeWidth={9} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ringHex(value)} strokeWidth={9} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - c * value} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dashoffset .6s ease" }} />
      <text x="50%" y="50%" dy="0.1em" textAnchor="middle" dominantBaseline="middle" fontSize={26} fontWeight={700} fill="#0f172a">
        %{Math.round(value * 100)}
      </text>
    </svg>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-border bg-panel shadow-[0_1px_2px_rgba(13,18,28,0.05)] ${className}`}>{children}</div>;
}
function CardTitle({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-4">
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {sub && <p className="text-xs text-sub">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export default function GeoDashboard({
  runs,
  brand,
  competitors,
  summaries,
  runAt,
  onTab,
}: {
  runs: GeoRunResult[];
  brand: BrandRef;
  competitors: BrandRef[];
  summaries: GeoVisibilitySummary[] | null;
  runAt: string | null;
  onTab: (tab: "sources" | "visibility" | "opportunities" | "prompts" | "actions" | "readiness" | "perception" | "fanout") => void;
}) {
  const [engine, setEngine] = useState<string>("all");
  const [metric, setMetric] = useState<"visibility" | "shareOfVoice" | "avgPosition">("visibility");
  // Tek test yerine dönem ortalaması (Peec gibi): AI cevapları her seferinde değişir, tek test yanıltabilir.
  const [period, setPeriod] = useState<0 | 7 | 30>(0);
  const [history, setHistory] = useState<HistoryRun[]>([]);

  useEffect(() => {
    if (!brand.domain) return;
    fetch(`/api/overview?brand=${encodeURIComponent(brand.domain)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setHistory(Array.isArray(d?.runs) ? d.runs : []))
      .catch(() => setHistory([]));
  }, [brand.domain, runAt]);

  const engines = useMemo(() => [...new Set(runs.map((r) => r.engine))], [runs]);
  const fr = useMemo(() => (engine === "all" ? runs : runs.filter((r) => r.engine === engine)), [runs, engine]);
  const own = clean(brand.domain);
  const comps = competitors.filter((c) => c.name && c.domain);
  const compDomains = comps.map((c) => clean(c.domain));
  const tracked: BrandRef[] = useMemo(() => [{ name: brand.name, domain: own }, ...comps.map((c) => ({ name: c.name, domain: clean(c.domain) }))], [brand.name, own, comps]);
  const color = (name: string) => {
    const i = tracked.findIndex((b) => trLower(b.name) === trLower(name));
    if (i >= 0) return PALETTE[i % PALETTE.length];
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return PALETTE[1 + (h % (PALETTE.length - 1))];
  };

  // ---- Marka istatistikleri (filtrelenmiş koşulardan) ----
  const stats = useMemo(() => {
    const n = fr.length || 1;
    const per = tracked.map((b) => ({ ...b, hits: 0, wins: 0, posSum: 0, posN: 0 }));
    for (const r of fr) {
      const ranks = rankIn(r.responseText, tracked, r.mentioned);
      per.forEach((p) => {
        const k = ranks.get(p.name);
        if (k) {
          p.hits++;
          p.posSum += k;
          p.posN++;
          if (k === 1) p.wins++;
        }
      });
    }
    const total = per.reduce((a, p) => a + p.hits, 0) || 1;
    const sentOwn = fr.map((r) => r.sentiment).filter((s): s is number => s != null && Number.isFinite(s));
    return per
      .map((p, i) => ({
        name: p.name,
        domain: p.domain,
        isOwn: i === 0,
        visibility: p.hits / n,
        sov: p.hits / total,
        winRate: p.wins / n,
        position: p.posN ? p.posSum / p.posN : null,
        sentiment:
          i === 0
            ? sentOwn.length
              ? Math.round(sentOwn.reduce((a, b) => a + b, 0) / sentOwn.length)
              : null
            : summaries?.find((s) => clean(s.domain) === p.domain)?.avgSentiment ?? null,
      }))
      .sort((a, b) => b.visibility - a.visibility);
  }, [fr, tracked, summaries]);
  const me = stats.find((s) => s.isOwn)!;

  // ---- Geçmiş (tüm motorlar) → trend ve KPI değişimi ----
  const series = useMemo(
    () =>
      [...history]
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((h) => ({ at: h.createdAt, s: h.summaries.find((x) => clean(x.domain) === own) ?? null, all: h.summaries })),
    [history, own]
  );
  const ownSeries = (k: "visibility" | "shareOfVoice" | "avgPosition" | "avgSentiment") => series.map((p) => p.s?.[k]).filter((v): v is number => v != null);
  const delta = (k: "visibility" | "shareOfVoice" | "avgPosition" | "avgSentiment") => {
    if (engine !== "all") return null;
    const s = ownSeries(k);
    return s.length >= 2 ? s[s.length - 1] - s[s.length - 2] : null;
  };

  // ---- Kaynaklar ----
  const sources = useMemo(() => {
    const m = new Map<string, Set<number>>();
    fr.forEach((r, i) => r.citations.forEach((c) => {
      const d = clean(c.domain || c.url);
      if (!d) return;
      if (!m.has(d)) m.set(d, new Set());
      m.get(d)!.add(i);
    }));
    const n = fr.length || 1;
    return [...m.entries()].map(([d, set]) => ({ domain: d, share: set.size / n, idx: set })).sort((a, b) => b.share - a.share);
  }, [fr]);

  // ---- Motorlar ----
  const engineStats = useMemo(
    () =>
      engines
        .map((e) => {
          const rs = runs.filter((r) => r.engine === e);
          return { engine: e, visibility: rs.filter((r) => r.mentioned).length / (rs.length || 1), n: rs.length };
        })
        .sort((a, b) => b.visibility - a.visibility),
    [runs, engines]
  );
  const weakest = engineStats.length > 1 ? engineStats[engineStats.length - 1] : null;
  const weakestSources = useMemo(() => {
    if (!weakest) return [];
    const m = new Map<string, number>();
    runs.filter((r) => r.engine === weakest.engine).forEach((r) => r.citations.forEach((c) => {
      const d = clean(c.domain || c.url);
      if (d && d !== own) m.set(d, (m.get(d) ?? 0) + 1);
    }));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([d]) => d);
  }, [weakest, runs, own]);

  // ---- Ne yapmalı? ----
  const actions = useMemo(() => {
    const out: { kind: string; color: string; title: string; body: string; impact: [string, string]; cta: React.ReactNode }[] = [];
    const ops = findOpportunities(fr, { name: brand.name, domain: own }, comps);
    const lost = ops.find((o) => o.kind === "competitor-owned") ?? ops.find((o) => o.kind === "unclaimed");
    if (lost) {
      const lostCount = ops.filter((o) => o.kind === "competitor-owned" || o.kind === "unclaimed").length;
      out.push({
        kind: lost.leader ? "Rakip kazanıyor" : "Boş alan",
        color: "text-danger-ink",
        title: lost.leader ? `"${lost.prompt}" sorusunda ${lost.leader.name} önde` : `"${lost.prompt}" sorusunda kimse önerilmiyor`,
        body: `${ops.length} sorunun ${lostCount} tanesinde hiç anılmıyorsun. Bu soruyu doğrudan cevaplayan bir yazı yayınla.`,
        impact: ["Yüksek etki", "bg-danger/10 text-danger-ink"],
        cta: (
          <Link href={`/editor?new=${encodeURIComponent(lost.prompt)}`} className="inline-flex h-7 items-center rounded-lg bg-accent px-2.5 text-xs font-medium text-white hover:opacity-90">
            Yazıyı yaz
          </Link>
        ),
      });
    }
    // Kaynak boşluğu: rakiplerin anıldığı ama bizim anılmadığımız cevaplara en çok kaynaklık eden site.
    const gap = sources
      .filter((s) => s.domain !== own && !compDomains.includes(s.domain))
      .map((s) => {
        const rs = [...s.idx].map((i) => fr[i]);
        const compHit = rs.filter((r) => !r.mentioned && comps.some((c) => brandMentioned(r.responseText, { name: c.name }))).length;
        return { ...s, compHit };
      })
      .filter((s) => s.compHit > 0)
      .sort((a, b) => b.compHit - a.compHit)[0];
    if (gap) {
      out.push({
        kind: "Kaynak boşluğu",
        color: "text-warn-ink",
        title: `${gap.domain} kaynaklı cevaplarda yoksun`,
        body: `AI cevaplarının %${Math.round(gap.share * 100)}'i bu siteye dayanıyor; bunların ${gap.compHit} tanesinde rakipler anılıyor, sen anılmıyorsun.`,
        impact: ["Orta etki", "bg-warn/10 text-warn-ink"],
        cta: (
          <button type="button" onClick={() => onTab("sources")} className="inline-flex h-7 items-center rounded-lg px-2.5 text-xs font-medium shadow-[inset_0_0_0_1px_#D5D7DA] hover:bg-muted">
            Kaynaklar
          </button>
        ),
      });
    }
    if (weakest && weakest.visibility < (engineStats[0]?.visibility ?? 0)) {
      out.push({
        kind: "Motor farkı",
        color: "text-accent",
        title: `${ENGINE_META[weakest.engine]?.name ?? weakest.engine}'de en zayıfsın (%${Math.round(weakest.visibility * 100)})`,
        body: weakestSources.length
          ? `Bu motor en çok ${weakestSources.join(" ve ")} sitelerini alıntılıyor. Bu sitelerde görünür olmak bu motordaki görünürlüğünü artırır.`
          : `En iyi motorunla arasında %${Math.round((engineStats[0].visibility - weakest.visibility) * 100)} fark var.`,
        impact: ["Hızlı kazanım", "bg-accent/10 text-accent"],
        cta: (
          <button type="button" onClick={() => onTab("visibility")} className="inline-flex h-7 items-center rounded-lg px-2.5 text-xs font-medium shadow-[inset_0_0_0_1px_#D5D7DA] hover:bg-muted">
            Detay
          </button>
        ),
      });
    }
    return out.slice(0, 3);
  }, [fr, brand.name, own, comps, compDomains, sources, weakest, weakestSources, engineStats, onTab]);

  // ---- Özet bandı (tüm motorlar, son test) ----
  const band = useMemo(() => {
    const ownRef = { name: brand.name, domain: own };
    const an = runs.map((r) => analyzeRun(r, ownRef, comps));
    const n = runs.length || 1;
    // Hiç anılmayan rakipler de sıralamada sayılır (aksi halde "1./3" 4 markalı tablonun yanında çelişir).
    const hits = new Map<string, number>([[brand.name, runs.filter((r) => r.mentioned).length], ...comps.map((c) => [c.name, 0] as [string, number])]);
    for (const a of an) for (const rv of a.rivals) hits.set(rv.name, (hits.get(rv.name) ?? 0) + 1);
    const totalHits = [...hits.values()].reduce((x, y) => x + y, 0);
    const ranked = [...hits.entries()].sort((a, b) => b[1] - a[1]);
    const rank = ranked.findIndex(([nm]) => nm === brand.name) + 1;
    const leader = ranked[0] && ranked[0][0] !== brand.name ? { name: ranked[0][0], vis: ranked[0][1] / n } : null;
    const sent = runs.filter((r) => r.mentioned && r.sentiment != null).map((r) => r.sentiment as number);
    const src = new Map<string, Set<number>>();
    runs.forEach((r, i) => r.citations.forEach((c) => {
      const d = clean(c.domain || c.url);
      if (d) src.set(d, (src.get(d) ?? new Set()).add(i));
    }));
    const topSrc = [...src.entries()].sort((a, b) => b[1].size - a[1].size)[0];
    const lost = an.filter((a) => a.status === "lost").length;
    const empty = an.filter((a) => a.status === "empty").length;
    // Önce bunu yap: en çok cevabın kaybedildiği soru (eşitlikte rakibin daha çok önerildiği).
    type PromptGroup = { prompt: string; n: number; lost: number; ours: number; rivals: Map<string, number>; an: ReturnType<typeof analyzeRun>[] };
    const byPrompt = new Map<string, PromptGroup>();
    runs.forEach((r, i) => {
      const g: PromptGroup = byPrompt.get(r.promptText) ?? { prompt: r.promptText, n: 0, lost: 0, ours: 0, rivals: new Map(), an: [] };
      g.n++;
      g.an.push(an[i]);
      if (an[i].status === "lost" || an[i].status === "empty") g.lost++;
      if (r.mentioned) g.ours++;
      for (const rv of an[i].rivals) g.rivals.set(rv.name, (g.rivals.get(rv.name) ?? 0) + 1);
      byPrompt.set(r.promptText, g);
    });
    const worst = [...byPrompt.values()].filter((g) => g.lost > 0).sort((a, b) => b.lost / b.n - a.lost / a.n || b.rivals.size - a.rivals.size || b.n - a.n)[0];
    const leaderName = worst ? [...worst.rivals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null : null;
    const first = worst ? { prompt: worst.prompt, leader: leaderName, ourRate: worst.ours / worst.n, lost: worst.lost, n: worst.n } : null;
    const firstHref = worst ? writeGapHref(worst.prompt, ownRef, worst.an) : null;
    return {
      visibility: runs.filter((r) => r.mentioned).length / n,
      sov: totalHits ? (hits.get(brand.name) ?? 0) / totalHits : 0,
      rank,
      brands: ranked.length,
      leader,
      sentiment: sent.length ? Math.round(sent.reduce((a, b) => a + b, 0) / sent.length) : null,
      topSrc: topSrc ? { domain: topSrc[0], share: topSrc[1].size / n } : null,
      lost,
      empty,
      first,
      firstHref,
      demo: runs.some(isDemoRun),
    };
  }, [runs, brand.name, own, comps]);

  // ---- Trend grafiği (SVG) ----
  const trendBrands = (series[series.length - 1]?.all ?? []).slice(0, 6);
  const trend = useMemo(() => {
    const W = 640,
      H = 230,
      L = 38,
      R = 12,
      T = 10,
      B = 24;
    if (!series.length) return null;
    const vals = series.flatMap((p) => p.all.map((s) => (metric === "avgPosition" ? s.avgPosition ?? null : s[metric]))).filter((v): v is number => v != null);
    const isPos = metric === "avgPosition";
    const max = isPos ? Math.max(3, ...vals) : Math.min(1, Math.max(0.1, ...vals) * 1.15);
    const min = isPos ? 1 : 0;
    const x = (i: number) => (series.length === 1 ? (L + W - R) / 2 : L + ((W - L - R) * i) / (series.length - 1));
    const y = (v: number) => (isPos ? T + ((H - T - B) * (v - min)) / (max - min || 1) : T + (H - T - B) * (1 - (v - min) / (max - min || 1)));
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => min + (max - min) * f);
    return { W, H, L, R, T, B, x, y, ticks, isPos };
  }, [series, metric]);

  // Dönem ortalaması: [şimdi-gün, şimdi] içindeki testlerin markamıza ait özetlerinin ortalaması; değişim = önceki eşit dönem.
  const windowAvg = (k: "visibility" | "shareOfVoice" | "avgPosition" | "avgSentiment", from: number, to: number) => {
    const vals = series.filter((p) => { const t = Date.parse(p.at); return t > from && t <= to; }).map((p) => p.s?.[k]).filter((v): v is number => v != null);
    return { v: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, n: vals.length };
  };
  const now = Date.now();
  const span = period * 864e5;
  const per = (k: "visibility" | "shareOfVoice" | "avgPosition" | "avgSentiment") => {
    const cur = windowAvg(k, now - span, now);
    const prev = windowAvg(k, now - 2 * span, now - span);
    return { v: cur.v, n: cur.n, d: cur.v != null && prev.v != null ? cur.v - prev.v : null };
  };
  const periodN = period ? per("visibility").n : 0;

  const kpis: { label: string; value: string; d: number | null; good: "up" | "down"; spark: number[]; fmt: (d: number) => string }[] = period ? [
    { label: "Görünürlük", value: pct(per("visibility").v), d: per("visibility").d, good: "up", spark: ownSeries("visibility"), fmt: (d) => `${Math.abs(Math.round(d * 100))}` },
    { label: "Share of Voice", value: pct(per("shareOfVoice").v), d: per("shareOfVoice").d, good: "up", spark: ownSeries("shareOfVoice"), fmt: (d) => `${Math.abs(Math.round(d * 100))}` },
    { label: "Kazanma oranı", value: "—", d: null, good: "up", spark: [], fmt: () => "" },
    { label: "Ort. pozisyon", value: num1(per("avgPosition").v), d: per("avgPosition").d, good: "down", spark: ownSeries("avgPosition"), fmt: (d) => Math.abs(d).toFixed(1).replace(".", ",") },
    { label: "Duygu", value: per("avgSentiment").v == null ? "—" : String(Math.round(per("avgSentiment").v!)), d: per("avgSentiment").d, good: "up", spark: ownSeries("avgSentiment"), fmt: (d) => `${Math.abs(Math.round(d))}` },
  ] : [
    { label: "Görünürlük", value: pct(me.visibility), d: delta("visibility"), good: "up", spark: ownSeries("visibility"), fmt: (d) => `${Math.abs(Math.round(d * 100))}` },
    { label: "Share of Voice", value: pct(me.sov), d: delta("shareOfVoice"), good: "up", spark: ownSeries("shareOfVoice"), fmt: (d) => `${Math.abs(Math.round(d * 100))}` },
    { label: "Kazanma oranı", value: pct(me.winRate), d: null, good: "up", spark: [], fmt: () => "" },
    { label: "Ort. pozisyon", value: num1(me.position), d: delta("avgPosition"), good: "down", spark: ownSeries("avgPosition"), fmt: (d) => Math.abs(d).toFixed(1).replace(".", ",") },
    { label: "Duygu", value: me.sentiment == null ? "—" : String(me.sentiment), d: delta("avgSentiment"), good: "up", spark: ownSeries("avgSentiment"), fmt: (d) => `${Math.abs(Math.round(d))}` },
  ];
  const KPI_HINT: Record<string, string> = {
    Görünürlük: "AI cevaplarının yüzde kaçında markan anılıyor.",
    "Share of Voice": "Takip edilen markaların toplam anılmaları içinde senin payın.",
    "Kazanma oranı": "Cevaplarda markaların arasında ilk sırada anıldığın cevapların oranı.",
    "Ort. pozisyon": "Anıldığın cevaplarda kaçıncı sırada geçtiğin (düşük daha iyi).",
    Duygu: "AI'ın markanı ne kadar olumlu anlattığı (0-100).",
  };

  const chip = (on: boolean) =>
    `inline-flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-[13px] font-medium whitespace-nowrap ${on ? "bg-accent/5 text-ink shadow-[inset_0_0_0_1px_#BDB4FF]" : "bg-panel text-sub shadow-[inset_0_0_0_1px_#E4E5E8] hover:text-ink"}`;

  return (
    <div className="space-y-3">
      {/* Özet bandı */}
      <Card className="p-4 md:p-5">
        <div className="grid gap-4 lg:grid-cols-[auto_1fr] lg:items-center">
          <div className="flex items-center gap-4">
            <Ring value={band.visibility} />
            <div>
              <div className="text-xs font-medium text-sub">AI görünürlüğü</div>
              <div className="text-sm font-semibold">
                {runs.length} cevabın {runs.filter((r) => r.mentioned).length} tanesinde
              </div>
              <div className="mt-0.5 text-xs text-sub">
                {engines.length} motor · {new Set(runs.map((r) => r.promptText)).size} prompt
              </div>
              {band.demo && <span className="mt-1 inline-block rounded-md bg-warn/10 px-1.5 py-0.5 text-xs font-medium text-warn-ink">[DEMO] Bazı cevaplar simüle</span>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="rounded-xl border border-border px-3 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-sub">Rakiplere göre</div>
              <div className="mt-1 text-[22px] font-semibold tabular-nums">{comps.length ? `${band.rank}. / ${band.brands}` : "—"}</div>
              <div className="text-xs text-sub">{comps.length ? `Ses payı ${pct(band.sov)}${band.leader ? ` · lider ${band.leader.name}` : " · lidersin"}` : "Rakip ekleyince görünür"}</div>
            </div>
            <div className="rounded-xl border border-border px-3 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-sub">Kaybedilen cevap</div>
              <div className={`mt-1 text-[22px] font-semibold tabular-nums ${band.lost ? "text-danger-ink" : "text-ink"}`}>{band.lost}</div>
              <div className="text-xs text-sub">rakip önerildi · {band.empty} cevapta kimse yok</div>
            </div>
            <div className="rounded-xl border border-border px-3 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-sub">Duygu</div>
              <div className={`mt-1 text-[22px] font-semibold tabular-nums ${band.sentiment == null ? "text-ink" : band.sentiment >= 65 ? "text-seo-ink" : band.sentiment >= 50 ? "text-warn-ink" : "text-danger-ink"}`}>{band.sentiment ?? "—"}</div>
              <div className="text-xs text-sub">{band.sentiment == null ? "Anılmadığın için ölçülmedi" : "Anıldığın cevaplarda, 0-100"}</div>
            </div>
            <div className="min-w-0 rounded-xl border border-border px-3 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-sub">En çok alıntılanan</div>
              <div className="mt-1 truncate text-[15px] font-semibold leading-8" title={band.topSrc?.domain}>{band.topSrc?.domain ?? "—"}</div>
              <div className="text-xs text-sub">{band.topSrc ? `Cevapların ${pct(band.topSrc.share)}'inde` : "Motorlar kaynak göstermedi"}</div>
            </div>
          </div>
          <div className="rounded-xl bg-accent/[0.06] p-3.5 lg:col-span-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-accent">Önce bunu yap</div>
            {band.first && band.firstHref ? (
              <>
                <div className="mt-1 text-[13px] font-semibold leading-snug">&ldquo;{band.first.prompt}&rdquo;</div>
                <p className="mt-1 text-xs text-sub">
                  {band.first.n} motorun {band.first.lost} tanesinde kaybediyorsun
                  {band.first.leader ? `; ${band.first.leader} öneriliyor.` : "; kimse önerilmiyor, ilk net cevabı veren kazanır."}
                </p>
                <Link href={band.firstHref} className="mt-2 inline-flex h-7 items-center rounded-lg bg-accent px-2.5 text-[12px] font-medium text-white hover:opacity-90">
                  Bu boşluğu kapatacak yazıyı yaz
                </Link>
              </>
            ) : (
              <p className="mt-1 text-xs text-sub">Test edilen tüm sorularda anılıyorsun. Konumunu korumak için yeni sorular ekleyip düzenli test et.</p>
            )}
          </div>
        </div>
      </Card>

      <GeoHeatmap runs={runs} own={{ name: brand.name, domain: own }} rivals={comps} />

      {/* Motor filtresi */}
      <div className="flex flex-wrap items-center gap-2 pb-1">
        <button type="button" onClick={() => setEngine("all")} className={chip(engine === "all")}>
          Tüm motorlar
        </button>
        {engines.map((e) => (
          <button key={e} type="button" onClick={() => { setEngine(e); setPeriod(0); }} className={chip(engine === e)}>
            <span className="h-2 w-2 rounded-full" style={{ background: ENGINE_META[e]?.color ?? "#999" }} />
            {ENGINE_META[e]?.name ?? e}
          </button>
        ))}
        {engines.length === 1 && <span className="text-xs text-sub">Daha fazla motor için Entegrasyonlar&apos;dan anahtar ekle.</span>}
        <span className="ml-auto flex items-center gap-1.5">
          {([[0, "Son test"], [7, "7 gün ort."], [30, "30 gün ort."]] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => { setPeriod(v); if (v) setEngine("all"); }} className={chip(period === v)}>
              {l}
            </button>
          ))}
        </span>
      </div>
      {period > 0 && (
        <p className="-mt-2 text-xs text-sub">
          {periodN
            ? `Son ${period} gündeki ${periodN} testin ortalaması · tüm motorlar · ok: önceki ${period} güne göre. Kazanma oranı yalnızca tek testte hesaplanır.`
            : `Son ${period} günde test yok. Marka Monitörleri'nden otomatik ölçümü (ör. Günlük) aç.`}
        </p>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => {
          const up = k.d != null && (k.good === "up" ? k.d > 0 : k.d < 0);
          const flat = k.d == null || Math.abs(k.d) < 1e-9;
          return (
            <Card key={k.label} className="px-4 py-4">
              <div className="flex items-center justify-between text-xs font-medium text-sub">
                {k.label}
                <span title={KPI_HINT[k.label]} className="cursor-help text-ink/45">
                  ⓘ
                </span>
              </div>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className="text-[26px] font-semibold leading-8 tracking-tight tabular-nums">{k.value}</span>
                {!flat && <span className={`text-xs font-medium ${up ? "text-seo-ink" : "text-danger-ink"}`}>{up ? "↑" : "↓"} {k.fmt(k.d!)}</span>}
              </div>
              <Spark data={k.spark} color={flat ? "#a1a1aa" : up ? "#12b76a" : "#f04438"} />
            </Card>
          );
        })}
      </div>
      {period === 0 && (() => {
        const c = confidenceOf(fr.filter((r) => r.mentioned).length, fr.length);
        return c ? (
          <p className={`-mt-1 text-xs ${c.level === "yeterli" ? "text-sub" : "text-warn-ink"}`}>
            {c.text}.{c.level !== "yeterli" && " Marka Monitörleri'nde haftalık otomatik testi açarsan sonuçlar zamanla birikir ve kesinleşir."}
          </p>
        ) : null;
      })()}

      {/* Trend + sıralama */}
      <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardTitle
            title="Görünürlük trendi"
            sub={series.length > 1 ? `Son ${series.length} test · tüm motorlar` : "Trend için en az 2 test gerekiyor"}
            right={
              <div className="flex rounded-lg bg-muted p-0.5">
                {(
                  [
                    ["visibility", "Görünürlük"],
                    ["shareOfVoice", "SoV"],
                    ["avgPosition", "Pozisyon"],
                  ] as const
                ).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setMetric(k)} className={`rounded-md px-2.5 py-1 text-xs font-medium ${metric === k ? "bg-panel text-ink shadow-sm" : "text-sub"}`}>
                    {l}
                  </button>
                ))}
              </div>
            }
          />
          {trend && series.length > 1 && (
            <div className="px-3 pb-2 pt-2">
              <svg viewBox={`0 0 ${trend.W} ${trend.H}`} className="h-[230px] w-full">
                {trend.ticks.map((t, i) => (
                  <g key={i}>
                    <line x1={trend.L} x2={trend.W - trend.R} y1={trend.y(t)} y2={trend.y(t)} stroke="#f0f0f2" />
                    <text x={trend.L - 8} y={trend.y(t) + 4} fontSize="11" fill="#8a8f98" textAnchor="end">
                      {trend.isPos ? t.toFixed(1) : `%${Math.round(t * 100)}`}
                    </text>
                  </g>
                ))}
                {series.map((p, i) =>
                  series.length <= 8 || i % Math.ceil(series.length / 8) === 0 || i === series.length - 1 ? (
                    <text key={`${p.at}-${i}`} x={trend.x(i)} y={trend.H - 6} fontSize="11" fill="#8a8f98" textAnchor="middle">
                      {new Date(p.at).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
                    </text>
                  ) : null
                )}
                {trendBrands.map((b) => {
                  const isOwn = clean(b.domain) === own;
                  const pts = series
                    .map((p, i) => {
                      const s = p.all.find((x) => clean(x.domain) === clean(b.domain));
                      const v = s ? (metric === "avgPosition" ? s.avgPosition : s[metric]) : null;
                      return v == null ? null : ([trend.x(i), trend.y(v)] as const);
                    })
                    .filter((q): q is readonly [number, number] => q != null);
                  if (!pts.length) return null;
                  const c = color(b.brand) ?? "#999";
                  const last = pts[pts.length - 1];
                  return (
                    <g key={b.domain}>
                      {pts.length > 1 && <path d={`M${pts.map((q) => q.join(",")).join(" L")}`} fill="none" stroke={c} strokeWidth={isOwn ? 3 : 1.8} opacity={isOwn ? 1 : 0.75} strokeLinejoin="round" strokeLinecap="round" />}
                      <circle cx={last[0]} cy={last[1]} r={isOwn ? 4.5 : 3} fill="#fff" stroke={c} strokeWidth={2} />
                    </g>
                  );
                })}
              </svg>
              <div className="flex flex-wrap gap-4 px-2 pb-2 text-xs text-sub">
                {trendBrands.map((b) => (
                  <span key={b.domain} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: color(b.brand) }} />
                    {b.brand}
                    {clean(b.domain) === own && <span className="rounded bg-accent/10 px-1 text-xs font-semibold text-accent">siz</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardTitle title="Marka sıralaması" sub={engine === "all" ? "Son test · tüm motorlar" : `Son test · ${ENGINE_META[engine]?.name ?? engine}`} />
          <table className="mt-3 w-full text-[13px]">
            <thead>
              <tr className="border-y border-border text-left text-xs text-sub">
                <th className="py-2 pl-5 font-medium">Marka</th>
                <th className="py-2 font-medium">Görünürlük</th>
                <th className="py-2 text-right font-medium">SoV</th>
                <th className="py-2 text-right font-medium">Poz.</th>
                <th className="py-2 pr-5 text-right font-medium">Duygu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {stats.map((s, i) => (
                <tr key={s.domain + s.name} className={s.isOwn ? "bg-accent/[0.03]" : ""}>
                  <td className="py-2.5 pl-5">
                    <div className="flex items-center gap-2 font-medium">
                      <span className="w-3 text-xs text-sub">{i + 1}</span>
                      <span className="flex h-5 w-5 items-center justify-center rounded-md text-xs font-semibold text-white" style={{ background: color(s.name) }}>
                        {s.name.charAt(0).toLocaleUpperCase("tr")}
                      </span>
                      <span className="truncate">{s.name}</span>
                      {s.isOwn && <span className="rounded bg-accent/10 px-1 text-xs font-semibold text-accent">siz</span>}
                    </div>
                  </td>
                  <td className="py-2.5">
                    <span className="mr-2 inline-block h-1.5 w-16 overflow-hidden rounded-full bg-muted align-middle">
                      <span className="block h-full rounded-full" style={{ width: `${Math.round(s.visibility * 100)}%`, background: color(s.name) }} />
                    </span>
                    <span className="tabular-nums">{pct(s.visibility)}</span>
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{pct(s.sov)}</td>
                  <td className="py-2.5 text-right tabular-nums">{num1(s.position)}</td>
                  <td className="py-2.5 pr-5 text-right tabular-nums">{s.sentiment ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {comps.length === 0 && <p className="px-5 py-3 text-xs text-sub">Rakip eklenmemiş. Proje ayarlarından rakip ekleyince burada karşılaştırma görünür.</p>}
        </Card>
      </div>

      {/* Kaynaklar + motorlar */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardTitle
            title="AI hangi kaynaklara bakıyor?"
            sub="Cevapların yüzde kaçında bu siteden bağlantı var"
            right={
              <button type="button" onClick={() => onTab("sources")} className="h-7 rounded-lg px-2.5 text-xs font-medium shadow-[inset_0_0_0_1px_#D5D7DA] hover:bg-muted">
                Tümü
              </button>
            }
          />
          <div className="mt-2">
            {sources.length === 0 ? (
              <p className="px-5 pb-5 pt-2 text-sm text-sub">
                Bu testte cevaplar kaynak göstermedi. Kaynak verisi için web araması yapan motorlar (Perplexity, ChatGPT) gerekiyor; Entegrasyonlar&apos;dan anahtar ekleyebilirsin.
              </p>
            ) : (
              sources.slice(0, 6).map((s) => {
                const t = domainType(s.domain, own, compDomains);
                return (
                  <div key={s.domain} className="flex items-center gap-2.5 border-t border-border px-5 py-2.5 first:border-t-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`https://www.google.com/s2/favicons?domain=${s.domain}&sz=32`} alt="" className="h-4 w-4 rounded" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{s.domain}</span>
                    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${t.cls}`}>{t.label}</span>
                    <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:inline-block">
                      <span className="block h-full rounded-full bg-ink/25" style={{ width: `${Math.round((s.share / (sources[0]?.share || 1)) * 100)}%` }} />
                    </span>
                    <span className="w-10 text-right text-[13px] tabular-nums">{pct(s.share)}</span>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card>
          <CardTitle title="Motor bazında" sub={`${brand.name} her motorda ne kadar görünüyor`} />
          <div className="mt-2">
            {engineStats.map((e) => (
              <div key={e.engine} className="flex items-center gap-3 border-t border-border px-5 py-3 first:border-t-0">
                <span className="flex w-28 items-center gap-2 text-[13px] font-medium">
                  <span className="h-2 w-2 rounded-full" style={{ background: ENGINE_META[e.engine]?.color ?? "#999" }} />
                  {ENGINE_META[e.engine]?.name ?? e.engine}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <span className={`block h-full rounded-full ${weakest?.engine === e.engine && e.visibility < 0.25 ? "bg-danger" : "bg-accent"}`} style={{ width: `${Math.max(2, Math.round(e.visibility * 100))}%` }} />
                </span>
                <span className="w-11 text-right text-[13px] font-medium tabular-nums">{pct(e.visibility)}</span>
              </div>
            ))}
          </div>
          {weakest && weakestSources.length > 0 && (
            <div className="border-t border-border px-5 py-3 text-xs text-sub">
              💡 {ENGINE_META[weakest.engine]?.name ?? weakest.engine}&apos;de en zayıfsın — bu motor en çok <b className="text-ink">{weakestSources.join(" ve ")}</b> sitelerini alıntılıyor.
            </div>
          )}
          {engineStats.length === 1 && (
            <div className="border-t border-border px-5 py-3 text-xs text-sub">
              Şu an tek motor çalışıyor. Motorları karşılaştırmak için Entegrasyonlar&apos;dan ChatGPT, Gemini ya da Perplexity anahtarı ekle.
            </div>
          )}
        </Card>
      </div>

      {/* Ne yapmalı */}
      {actions.length > 0 && (
        <>
          <div className="flex items-end justify-between pt-5">
            <div>
              <h2 className="text-base font-semibold">Ne yapmalı?</h2>
              <p className="text-xs text-sub">Bu testten çıkan, etkisi en yüksek işler</p>
            </div>
            <button type="button" onClick={() => onTab("actions")} className="text-[13px] font-medium text-accent hover:underline">
              Aksiyon planı →
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {actions.map((a) => (
              <Card key={a.title} className="flex flex-col p-4">
                <div className={`text-xs font-semibold uppercase tracking-wide ${a.color}`}>{a.kind}</div>
                <h3 className="mt-1.5 text-sm font-semibold leading-5">{a.title}</h3>
                <p className="mt-1 text-[13px] text-sub">{a.body}</p>
                <div className="mt-auto flex items-center justify-between pt-3">
                  <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${a.impact[1]}`}>{a.impact[0]}</span>
                  {a.cta}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <div className="pt-5">
        <GeoHealthStrip runs={fr} brand={brand} competitors={comps} onTab={onTab} />
      </div>

      {/* Promptlar */}
      <div className="flex items-end justify-between pt-5">
        <div>
          <h2 className="text-base font-semibold">Promptlar</h2>
          <p className="text-xs text-sub">İnsanların AI&apos;a sorduğu sorular · satıra tıkla → AI&apos;ın gerçek cevabı</p>
        </div>
      </div>
      <PromptResults prompts={groupRuns(fr, tracked.map((b) => b.name))} brandName={brand.name} runAt={runAt} />
    </div>
  );
}
