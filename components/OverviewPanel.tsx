"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import KpiCard from "@/components/tool/KpiCard";
import GhostChart from "@/components/tool/GhostChart";
import type { GeoVisibilitySummary, SourceDomainStat, SourceDomainType } from "@/types";

/**
 * Kart: Peec tarzı Overview — Peec AI'ın "Overview" ekranının (filtre çubuğu, marka bazlı
 * Visibility çizgi grafiği + D/W/M, Top 7 Brands tablosu, Source distribution: domain listesi +
 * domain tipleri) Epicsem karşılığı. Her sayı kullanıcının gerçek geo_runs satırlarından
 * (lib/db.ts listGeoRunsForOverview) hesaplanır; örnek/sahte veri yok. Farklar:
 *  - Değişim (Δ) seçilen aralığın ilk koşusu ile son koşusu arasında hesaplanır.
 *  - Türkçe yüzde biçimi (%38) ve Türkçe etiketler.
 *  - Her marka için favicon logosu; demo koşular açıkça işaretlenir.
 */

export interface OverviewRunData {
  id: number;
  createdAt: string;
  demoMode: boolean;
  summaries: GeoVisibilitySummary[];
  sourceDistribution: SourceDomainStat[];
}

interface Props {
  brands: { brandName: string; brandDomain: string }[];
  selectedDomain: string;
  runs: OverviewRunData[];
  /** Verilirse marka değişimi sayfa yönlendirmesi yerine bunu çağırır (ör. /geo içinde). */
  onBrandChange?: (domain: string) => void;
  newTestHref?: string;
}

const RANGES = [
  { days: 7, label: "Son 7 gün" },
  { days: 14, label: "Son 14 gün" },
  { days: 30, label: "Son 30 gün" },
  { days: 90, label: "Son 90 gün" },
];

// Peec'teki gibi her markaya ayırt edilebilir bir çizgi rengi; kendi markamız her zaman ilk renk.
const LINE_COLORS = ["#5d16ff", "#16a34a", "#dc2626", "#334155", "#94a3b8", "#ef4444", "#84cc16", "#0ea5e9", "#f59e0b", "#a855f7"];

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
const DOMAIN_TYPE_COLOR: Record<SourceDomainType, string> = {
  You: "#5d16ff",
  Competitor: "#ef4444",
  Corporate: "#f97316",
  Editorial: "#3b82f6",
  Government: "#14b8a6",
  Reference: "#a855f7",
  UGC: "#eab308",
  Other: "#94a3b8",
};

type Granularity = "D" | "W" | "M";

function favicon(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

function pct(v: number) {
  return `%${Math.round(v * 100)}`;
}

function bucketKey(iso: string, g: Granularity): string {
  const d = new Date(iso);
  if (g === "M") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  if (g === "W") {
    const day = (d.getDay() + 6) % 7; // Pazartesi = 0
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
    return monday.toISOString().slice(0, 10);
  }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10);
}

function Delta({ value, unit = "%", invert = false, digits = 1 }: { value: number | null; unit?: string; invert?: boolean; digits?: number }) {
  if (value == null || !Number.isFinite(value)) return <span className="text-xs text-ink/30 w-12 inline-block" />;
  const rounded = Number(value.toFixed(digits));
  const good = invert ? rounded < 0 : rounded > 0;
  const bad = invert ? rounded > 0 : rounded < 0;
  const color = good ? "text-seo" : bad ? "text-danger" : "text-ink/40";
  const sign = rounded > 0 ? "+" : "";
  return (
    <span className={`text-xs tabular-nums w-12 inline-block ${color}`}>
      {sign}
      {rounded.toLocaleString("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}
      {unit}
    </span>
  );
}

function Dropdown<T extends string | number>({
  icon,
  value,
  options,
  onChange,
}: {
  icon: React.ReactNode;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="relative inline-flex items-center gap-2 rounded-lg border border-border bg-panel px-3 py-1.5 text-sm hover:border-ink/30 cursor-pointer">
      <span className="text-ink/50">{icon}</span>
      <span className="font-medium">{options.find((o) => o.value === value)?.label ?? String(value)}</span>
      <span className="text-ink/40 text-xs">▾</span>
      <select
        value={String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          const match = options.find((o) => String(o.value) === raw);
          if (match) onChange(match.value);
        }}
        className="absolute inset-0 opacity-0 cursor-pointer"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function OverviewPanel({ brands, selectedDomain, runs, onBrandChange, newTestHref = "/geo" }: Props) {
  const router = useRouter();
  // Varsayılan aralık: son testi kapsayan en kısa aralık (14 günde test yoksa boş ekran
  // yerine otomatik 30/90 güne açılır).
  const [days, setDays] = useState(() => {
    const lastRun = runs[runs.length - 1];
    if (!lastRun) return 14;
    const ageDays = (Date.now() - new Date(lastRun.createdAt).getTime()) / 86400000;
    return RANGES.find((r) => r.days >= ageDays + 0.5)?.days ?? 90;
  });
  const [granularity, setGranularity] = useState<Granularity>("D");
  const [sourceTab, setSourceTab] = useState<"top" | "new" | "losing">("top");
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const inRange = useMemo(() => {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    return runs.filter((r) => new Date(r.createdAt).getTime() >= since);
  }, [runs, days]);

  const first = inRange[0];
  const last = inRange[inRange.length - 1];
  const anyDemo = inRange.some((r) => r.demoMode);

  // Top 7 marka: son koşudaki görünürlüğe göre; Δ = aralığın ilk koşusuna göre.
  const topBrands = useMemo(() => {
    if (!last) return [];
    const firstByDomain = new Map((first?.summaries ?? []).map((s) => [s.domain || s.brand, s]));
    return [...last.summaries]
      .sort((a, b) => b.visibility - a.visibility)
      .slice(0, 7)
      .map((s) => {
        const prev = first && first.id !== last.id ? firstByDomain.get(s.domain || s.brand) : undefined;
        return {
          ...s,
          dVis: prev ? (s.visibility - prev.visibility) * 100 : null,
          dSov: prev ? (s.shareOfVoice - prev.shareOfVoice) * 100 : null,
          dSent: prev && s.avgSentiment != null && prev.avgSentiment != null ? s.avgSentiment - prev.avgSentiment : null,
          dPos: prev && s.avgPosition != null && prev.avgPosition != null ? s.avgPosition - prev.avgPosition : null,
        };
      });
  }, [first, last]);

  const brandKeys = topBrands.map((b) => b.domain || b.brand);
  const colorOf = (key: string) => LINE_COLORS[Math.max(0, brandKeys.indexOf(key)) % LINE_COLORS.length];

  // Grafik verisi: seçilen granülerliğe göre kova başına marka görünürlüğü ortalaması.
  const chartData = useMemo(() => {
    const buckets = new Map<string, Map<string, number[]>>();
    for (const r of inRange) {
      const k = bucketKey(r.createdAt, granularity);
      if (!buckets.has(k)) buckets.set(k, new Map());
      const b = buckets.get(k)!;
      for (const s of r.summaries) {
        const key = s.domain || s.brand;
        if (!brandKeys.includes(key)) continue;
        if (!b.has(key)) b.set(key, []);
        b.get(key)!.push(s.visibility * 100);
      }
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, m]) => {
        const row: Record<string, number | string> = {
          date: new Date(k).toLocaleDateString("tr-TR", granularity === "M" ? { month: "short", year: "numeric" } : { day: "numeric", month: "short" }),
        };
        for (const [key, vals] of m) row[key] = Math.round((vals.reduce((a, v) => a + v, 0) / vals.length) * 10) / 10;
        return row;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inRange, granularity, brandKeys.join("|")]);

  // Kaynak dağılımı: aralıktaki tüm koşuların domain atıf sayılarını topla.
  const sources = useMemo(() => {
    const total = new Map<string, { count: number; type: SourceDomainType }>();
    for (const r of inRange) {
      for (const d of r.sourceDistribution) {
        const cur = total.get(d.domain);
        total.set(d.domain, { count: (cur?.count ?? 0) + d.count, type: d.type });
      }
    }
    const lastMap = new Map((last?.sourceDistribution ?? []).map((d) => [d.domain, d.count]));
    const firstMap = new Map((first && first.id !== last?.id ? first.sourceDistribution : []).map((d) => [d.domain, d.count]));
    const rows = [...total.entries()].map(([domain, v]) => ({
      domain,
      ...v,
      change: (lastMap.get(domain) ?? 0) - (firstMap.get(domain) ?? 0),
      isNew: firstMap.size > 0 && !firstMap.has(domain) && lastMap.has(domain),
    }));
    const byType = new Map<SourceDomainType, number>();
    for (const r of rows) byType.set(r.type, (byType.get(r.type) ?? 0) + r.count);
    const typeTotal = [...byType.values()].reduce((a, b) => a + b, 0) || 1;
    return {
      top: [...rows].sort((a, b) => b.count - a.count),
      newOnes: rows.filter((r) => r.isNew).sort((a, b) => b.count - a.count),
      losing: rows.filter((r) => r.change < 0).sort((a, b) => a.change - b.change),
      types: [...byType.entries()].sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type, share: count / typeTotal })),
    };
  }, [inRange, first, last]);

  // Kendi markamızın KPI'ları (Ahrefs tarzı mini grafikli kartlar).
  const own = useMemo(() => {
    const pick = (r: OverviewRunData) => r.summaries.find((x) => x.domain === selectedDomain) ?? r.summaries[0];
    const series = inRange.map(pick).filter(Boolean) as GeoVisibilitySummary[];
    const lastS = series[series.length - 1];
    const firstS = series[0];
    const diff = (a?: number | null, b?: number | null, mul = 1) => (a != null && b != null && series.length > 1 ? Math.round((a - b) * mul * 10) / 10 : null);
    return {
      series,
      vis: lastS ? `%${Math.round(lastS.visibility * 100)}` : "—",
      sov: lastS ? `%${Math.round(lastS.shareOfVoice * 100)}` : "—",
      pos: lastS?.avgPosition != null ? `#${lastS.avgPosition.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}` : "—",
      sent: lastS?.avgSentiment != null ? String(lastS.avgSentiment) : "—",
      dVis: diff(lastS?.visibility, firstS?.visibility, 100),
      dSov: diff(lastS?.shareOfVoice, firstS?.shareOfVoice, 100),
      dPos: diff(lastS?.avgPosition, firstS?.avgPosition),
      dSent: diff(lastS?.avgSentiment, firstS?.avgSentiment),
    };
  }, [inRange, selectedDomain]);

  const sourceRows = (sourceTab === "top" ? sources.top : sourceTab === "new" ? sources.newOnes : sources.losing).slice(0, 8);
  const maxCount = Math.max(1, ...sourceRows.map((r) => r.count));

  const brandOptions = brands.map((b) => ({ value: b.brandDomain, label: b.brandName }));

  return (
    <section className="space-y-5">
      {/* Filtre çubuğu */}
      <div className="flex flex-wrap items-center gap-2">
        <Dropdown
          icon={<span>▦</span>}
          value={selectedDomain}
          options={brandOptions}
          onChange={(v) => (onBrandChange ? onBrandChange(String(v)) : router.push(`/dashboard?brand=${encodeURIComponent(String(v))}`))}
        />
        <Dropdown icon={<span>📅</span>} value={days} options={RANGES.map((r) => ({ value: r.days, label: r.label }))} onChange={(v) => setDays(Number(v))} />
        {hidden.size > 0 && (
          <button type="button" onClick={() => setHidden(new Set())} className="rounded-lg border border-border bg-panel px-3 py-1.5 text-sm hover:border-ink/30">
            Sıfırla
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {anyDemo && <span className="rounded-full bg-warn/10 text-warn text-xs font-medium px-2.5 py-1">Demo veri içeriyor</span>}
          <Link href={newTestHref} className="rounded-lg bg-accent text-white px-3 py-1.5 text-sm font-bold hover:opacity-90">
            Yeni test
          </Link>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold">Genel bakış</h2>
        <p className="text-sm text-ink/50">Her markanın AI üretimli cevaplarda ne sıklıkla geçtiği</p>
      </div>

      {inRange.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Görünürlük" value={own.vis} delta={own.dVis} spark={own.series.map((x) => x.visibility * 100)} />
          <KpiCard label="Share of Voice" value={own.sov} delta={own.dSov} spark={own.series.map((x) => x.shareOfVoice * 100)} color="#16a34a" />
          <KpiCard label="Ort. pozisyon" value={own.pos} delta={own.dPos} deltaGoodWhen="down" spark={own.series.map((x) => x.avgPosition ?? 0)} color="#f59e0b" />
          <KpiCard label="Duygu" value={own.sent} delta={own.dSent} spark={own.series.map((x) => x.avgSentiment ?? 0)} color="#ec4899" hint="0-100" />
        </div>
      )}

      {inRange.length === 0 ? (
        <GhostChart
          title="Bu aralıkta test yok"
          body={`Son ${days} günde bu marka için GEO testi çalıştırılmamış. Aralığı genişlet ya da yeni bir test başlat.`}
          cta={
            <div className="mt-1 flex gap-2">
              {days < 90 && (
                <button type="button" onClick={() => setDays(90)} className="rounded-lg border border-border bg-panel px-4 py-2 text-sm font-semibold hover:border-ink/30">
                  Son 90 güne bak
                </button>
              )}
              <Link href={newTestHref} className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white hover:opacity-90">
                Yeni test
              </Link>
            </div>
          }
        />
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          {/* Visibility grafiği */}
          <div className="rounded-2xl border border-border bg-panel flex flex-col">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <div className="font-bold text-sm">Görünürlük</div>
              <div className="flex rounded-lg border border-border overflow-hidden text-xs">
                {(["D", "W", "M"] as Granularity[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGranularity(g)}
                    title={g === "D" ? "Günlük" : g === "W" ? "Haftalık" : "Aylık"}
                    className={`px-2.5 py-1 ${granularity === g ? "bg-muted font-bold text-ink" : "text-ink/40 hover:text-ink"}`}
                  >
                    {g === "D" ? "G" : g === "W" ? "H" : "A"}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-64 px-2 pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} domain={[0, (max: number) => Math.min(100, Math.ceil((max + 5) / 10) * 10)]} tickFormatter={(v) => `%${v}`} width={40} tickCount={6} allowDecimals={false} />
                  <Tooltip
                    formatter={(v: number, key: string) => [`%${v}`, topBrands.find((b) => (b.domain || b.brand) === key)?.brand ?? key]}
                    contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, fontSize: 12 }}
                  />
                  {brandKeys
                    .filter((k) => !hidden.has(k))
                    .map((k) => (
                      <Line key={k} type="monotone" dataKey={k} stroke={colorOf(k)} strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
                    ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-auto px-5 py-3 border-t border-border text-xs text-ink/50">
              {days} günlük veri gösteriliyor · {inRange.length} test
            </div>
          </div>

          {/* Top 7 marka */}
          <div className="rounded-2xl border border-border bg-panel overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <div className="font-bold text-sm">İlk 7 marka</div>
              <span className="text-xs text-ink/40">Satıra tıkla: grafikte gizle/göster</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-ink/50 border-b border-border">
                    <th className="text-left font-medium px-4 py-2.5 w-8">#</th>
                    <th className="text-left font-medium py-2.5">Marka</th>
                    <th className="text-left font-medium py-2.5">Görünürlük</th>
                    <th className="text-left font-medium py-2.5">SoV</th>
                    <th className="text-left font-medium py-2.5">Duygu</th>
                    <th className="text-left font-medium py-2.5 pr-4">Pozisyon</th>
                  </tr>
                </thead>
                <tbody>
                  {topBrands.map((b, i) => {
                    const key = b.domain || b.brand;
                    const off = hidden.has(key);
                    return (
                      <tr
                        key={key}
                        onClick={() =>
                          setHidden((prev) => {
                            const n = new Set(prev);
                            if (n.has(key)) n.delete(key);
                            else n.add(key);
                            return n;
                          })
                        }
                        className={`border-b border-border last:border-0 cursor-pointer hover:bg-muted/60 ${off ? "opacity-40" : ""}`}
                      >
                        <td className="px-4 py-2.5 text-ink/60">{i + 1}</td>
                        <td className="py-2.5">
                          <span className="inline-flex items-center gap-2 font-medium whitespace-nowrap">
                            <span className="w-1 h-4 rounded-full" style={{ background: colorOf(key) }} />
                            {b.domain ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={favicon(b.domain)} alt="" width={16} height={16} className="w-4 h-4 rounded" />
                            ) : null}
                            {b.brand}
                          </span>
                        </td>
                        <td className="py-2.5 whitespace-nowrap">
                          <span className="font-semibold tabular-nums mr-1.5">{pct(b.visibility)}</span>
                          <Delta value={b.dVis} />
                        </td>
                        <td className="py-2.5 whitespace-nowrap">
                          <span className="font-semibold tabular-nums mr-1.5">{pct(b.shareOfVoice)}</span>
                          <Delta value={b.dSov} />
                        </td>
                        <td className="py-2.5 whitespace-nowrap">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-ink/30 mr-1.5 align-middle" />
                          <span className="font-semibold tabular-nums mr-1.5">{b.avgSentiment ?? "—"}</span>
                          <Delta value={b.dSent} unit="" digits={0} />
                        </td>
                        <td className="py-2.5 pr-4 whitespace-nowrap">
                          <span className="font-semibold tabular-nums mr-1.5">
                            {b.avgPosition != null ? `#${b.avgPosition.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}` : "—"}
                          </span>
                          <Delta value={b.dPos} unit="" invert />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {inRange.length > 0 && (
        <>
          <div className="pt-2 flex items-end justify-between">
            <div>
              <h2 className="text-lg font-bold">Kaynak dağılımı</h2>
              <p className="text-sm text-ink/50">AI cevaplarına en çok hangi siteler ve kaynak tipleri katkı veriyor</p>
            </div>
            <Link href="/geo" className="rounded-lg border border-border bg-panel px-3 py-1.5 text-sm hover:border-ink/30">
              Tüm domainler ↗
            </Link>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-border bg-panel">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <div className="flex gap-4 text-sm">
                  {([
                    ["top", "En çok"],
                    ["new", "Yeni"],
                    ["losing", "Düşen"],
                  ] as const).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSourceTab(k)}
                      className={sourceTab === k ? "font-bold text-ink" : "text-ink/40 hover:text-ink"}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-ink/50">Atıf</span>
              </div>
              <div className="p-3 space-y-1.5">
                {sourceRows.length === 0 && <p className="text-sm text-ink/40 px-2 py-4">Bu sekmede gösterilecek domain yok.</p>}
                {sourceRows.map((r) => (
                  <div key={r.domain} className="flex items-center gap-3">
                    <div className="relative flex-1 h-9 rounded-lg overflow-hidden">
                      <div className="absolute inset-y-0 left-0 bg-muted rounded-lg" style={{ width: `${Math.max(8, (r.count / maxCount) * 100)}%` }} />
                      <span className="relative h-full flex items-center gap-2 px-3 text-sm font-medium">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={favicon(r.domain)} alt="" width={16} height={16} className="w-4 h-4 rounded" />
                        {r.domain}
                      </span>
                    </div>
                    <span className="text-sm tabular-nums text-ink/70 w-12 text-right">
                      {sourceTab === "losing" ? r.change : r.count.toLocaleString("tr-TR")}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-panel">
              <div className="px-5 py-3 border-b border-border font-bold text-sm">Domain tipleri</div>
              <div className="p-3 space-y-1.5">
                {sources.types.length === 0 && <p className="text-sm text-ink/40 px-2 py-4">Henüz atıf yok.</p>}
                {sources.types.map((t) => (
                  <div key={t.type} className="flex items-center gap-3 rounded-lg bg-muted/60 px-3 h-9 text-sm">
                    <span className="w-2 h-2 rounded-full" style={{ background: DOMAIN_TYPE_COLOR[t.type] }} />
                    <span className="flex-1 font-medium">{DOMAIN_TYPE_LABEL[t.type]}</span>
                    <span className="tabular-nums text-ink/60">{pct(t.share)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
