"use client";

/**
 * GEO sonuç panosu — onaylanan taslak düzeni (Peec/Arvow tarzı tek ekran):
 *  motor filtresi → 5 metrik (görünürlük, SoV, kazanma oranı, pozisyon, duygu) →
 *  trend + marka sıralaması → kaynaklar + motor bazında → "Ne yapmalı?" (3 iş) → promptlar.
 * Hepsi son testin ham koşularından (prompt × motor) AI kullanmadan hesaplanır; trend için
 * önceki testler /api/overview'dan gelir.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { GeoRunResult, GeoVisibilitySummary } from "@/types";
import { brandMentioned, trLower } from "@/lib/text-match";
import { findOpportunities } from "@/lib/geo-insights";
import { ENGINE_META } from "@/components/tool/MonitorBits";
import PromptResults, { groupRuns } from "@/components/tool/PromptResults";

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
const clean = (d: string) => d.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
const pct = (x: number | null | undefined) => (x == null ? "—" : `%${Math.round(x * 100)}`);
const num1 = (x: number | null | undefined) => (x == null ? "—" : x.toFixed(1).replace(".", ","));

const UGC = ["reddit.com", "youtube.com", "quora.com", "medium.com", "x.com", "twitter.com", "facebook.com", "instagram.com", "tiktok.com", "eksisozluk.com", "linkedin.com", "sikayetvar.com", "trendyol.com", "hepsiburada.com", "amazon.com.tr", "n11.com"];
const EDITORIAL = ["hurriyet.com.tr", "milliyet.com.tr", "sabah.com.tr", "ntv.com.tr", "cnnturk.com", "sozcu.com.tr", "haberturk.com", "webtekno.com", "donanimhaber.com", "shiftdelete.net", "forbes.com", "bbc.com", "nytimes.com", "bloomberg.com", "techcrunch.com", "wired.com", "theverge.com"];
function domainType(d: string, own: string, comps: string[]): { label: string; cls: string } {
  if (d === own) return { label: "Siz", cls: "bg-accent/10 text-accent" };
  if (comps.includes(d)) return { label: "Rakip", cls: "bg-danger/10 text-danger" };
  if (UGC.some((u) => d === u || d.endsWith("." + u))) return { label: "UGC", cls: "bg-warn/10 text-warn" };
  if (EDITORIAL.some((u) => d === u || d.endsWith("." + u))) return { label: "Editoryal", cls: "bg-sky-50 text-sky-700" };
  if (/\.(gov|edu|bel|mil)(\.tr)?$/.test(d) || d.endsWith("wikipedia.org")) return { label: "Referans", cls: "bg-muted text-sub" };
  return { label: "Kurumsal", cls: "bg-muted text-sub" };
}

/** Bir cevapta takip edilen markaların sırası (metinde ilk geçiş yerine göre). */
function rankIn(text: string, brands: BrandRef[], ownMentioned: boolean): Map<string, number> {
  const t = trLower(text);
  const found: { name: string; at: number }[] = [];
  brands.forEach((b, i) => {
    const isOwn = i === 0;
    const hit = isOwn ? ownMentioned : brandMentioned(text, { name: b.name });
    if (!hit) return;
    const at = t.indexOf(trLower(b.name));
    found.push({ name: b.name, at: at < 0 ? Number.MAX_SAFE_INTEGER : at });
  });
  found.sort((a, b) => a.at - b.at);
  return new Map(found.map((f, i) => [f.name, i + 1]));
}

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

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-border bg-panel shadow-[0_1px_2px_rgba(13,18,28,0.05)] ${className}`}>{children}</div>;
}
function CardTitle({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-4">
      <div>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
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
  onTab: (tab: "sources" | "visibility" | "opportunities" | "prompts" | "actions") => void;
}) {
  const [engine, setEngine] = useState<string>("all");
  const [metric, setMetric] = useState<"visibility" | "shareOfVoice" | "avgPosition">("visibility");
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
        color: "text-danger",
        title: lost.leader ? `"${lost.prompt}" sorusunda ${lost.leader.name} önde` : `"${lost.prompt}" sorusunda kimse önerilmiyor`,
        body: `${ops.length} sorunun ${lostCount} tanesinde hiç anılmıyorsun. Bu soruyu doğrudan cevaplayan bir yazı yayınla.`,
        impact: ["Yüksek etki", "bg-danger/10 text-danger"],
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
        color: "text-warn",
        title: `${gap.domain} kaynaklı cevaplarda yoksun`,
        body: `AI cevaplarının %${Math.round(gap.share * 100)}'i bu siteye dayanıyor; bunların ${gap.compHit} tanesinde rakipler anılıyor, sen anılmıyorsun.`,
        impact: ["Orta etki", "bg-warn/10 text-warn"],
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

  const kpis: { label: string; value: string; d: number | null; good: "up" | "down"; spark: number[]; fmt: (d: number) => string }[] = [
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
      {/* Motor filtresi */}
      <div className="flex flex-wrap items-center gap-2 pb-1">
        <button type="button" onClick={() => setEngine("all")} className={chip(engine === "all")}>
          Tüm motorlar
        </button>
        {engines.map((e) => (
          <button key={e} type="button" onClick={() => setEngine(e)} className={chip(engine === e)}>
            <span className="h-2 w-2 rounded-full" style={{ background: ENGINE_META[e]?.color ?? "#999" }} />
            {ENGINE_META[e]?.name ?? e}
          </button>
        ))}
        {engines.length === 1 && <span className="text-xs text-sub">Daha fazla motor için Entegrasyonlar&apos;dan anahtar ekle.</span>}
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => {
          const up = k.d != null && (k.good === "up" ? k.d > 0 : k.d < 0);
          const flat = k.d == null || Math.abs(k.d) < 1e-9;
          return (
            <Card key={k.label} className="px-4 py-4">
              <div className="flex items-center justify-between text-xs font-medium text-sub">
                {k.label}
                <span title={KPI_HINT[k.label]} className="cursor-help text-ink/30">
                  ⓘ
                </span>
              </div>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className="text-[26px] font-semibold leading-8 tracking-tight tabular-nums">{k.value}</span>
                {!flat && <span className={`text-xs font-medium ${up ? "text-seo" : "text-danger"}`}>{up ? "↑" : "↓"} {k.fmt(k.d!)}</span>}
              </div>
              <Spark data={k.spark} color={flat ? "#a1a1aa" : up ? "#12b76a" : "#f04438"} />
            </Card>
          );
        })}
      </div>

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
          {trend && (
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
                    {clean(b.domain) === own && <span className="rounded bg-accent/10 px-1 text-[10px] font-semibold text-accent">siz</span>}
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
                      <span className="flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-semibold text-white" style={{ background: color(s.name) }}>
                        {s.name.charAt(0).toLocaleUpperCase("tr")}
                      </span>
                      <span className="truncate">{s.name}</span>
                      {s.isOwn && <span className="rounded bg-accent/10 px-1 text-[10px] font-semibold text-accent">siz</span>}
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
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${t.cls}`}>{t.label}</span>
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
                <div className={`text-[11px] font-semibold uppercase tracking-wide ${a.color}`}>{a.kind}</div>
                <h4 className="mt-1.5 text-sm font-semibold leading-5">{a.title}</h4>
                <p className="mt-1 text-[13px] text-sub">{a.body}</p>
                <div className="mt-auto flex items-center justify-between pt-3">
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${a.impact[1]}`}>{a.impact[0]}</span>
                  {a.cta}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

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
