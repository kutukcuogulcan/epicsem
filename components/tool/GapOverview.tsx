"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { GapRow } from "@/types";
import KpiCard from "./KpiCard";
import GhostChart from "./GhostChart";

interface GapRun {
  id: number;
  brandName: string;
  brandDomain: string;
  demoMode: boolean;
  gapMatrix: GapRow[];
  createdAt: string;
}

const VERDICTS: { key: GapRow["verdict"]; label: string; color: string; badge: string }[] = [
  { key: "cited", label: "Anılıyor", color: "#16a34a", badge: "bg-seo/10 text-seo" },
  { key: "invisible", label: "Sağlam ama görünmez", color: "#5d16ff", badge: "bg-accent/10 text-accent" },
  { key: "needs-work", label: "İyileştirme gerekli", color: "#f59e0b", badge: "bg-warn/10 text-warn" },
  { key: "blocked", label: "AI'ya kapalı", color: "#ef4444", badge: "bg-danger/10 text-danger" },
];
const V = Object.fromEntries(VERDICTS.map((v) => [v.key, v])) as Record<GapRow["verdict"], (typeof VERDICTS)[number]>;

function path(url: string) {
  try {
    const u = new URL(/^https?:\/\//.test(url) ? url : `https://${url}`);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return url;
  }
}

function count(m: GapRow[], v: GapRow["verdict"]) {
  return m.filter((r) => r.verdict === v).length;
}

/**
 * /gap'e girince ilk görülen pano: sayfa başına "teknik sağlam mı × AI anıyor mu" sonucunun
 * zaman içindeki dağılımı. Tüm sayılar kullanıcının gerçek gap_runs kayıtlarından.
 */
export default function GapOverview({ refreshKey = 0 }: { refreshKey?: number }) {
  const [runs, setRuns] = useState<GapRun[] | null>(null);

  useEffect(() => {
    fetch("/api/gap/runs")
      .then((r) => (r.ok ? r.json() : { runs: [] }))
      .then((d) => setRuns((d.runs ?? []).filter((r: GapRun) => r.gapMatrix?.length)))
      .catch(() => setRuns([]));
  }, [refreshKey]);

  const stats = useMemo(() => {
    if (!runs || runs.length === 0) return null;
    const last = runs[runs.length - 1];
    const prev = runs.length > 1 ? runs[runs.length - 2] : null;
    const m = last.gapMatrix;
    const rate = (x: GapRow[]) => (x.length ? Math.round((count(x, "cited") / x.length) * 100) : 0);
    const recent = runs.slice(-12);
    return {
      last,
      pages: m.length,
      citedRate: rate(m),
      invisible: count(m, "invisible"),
      blocked: count(m, "blocked"),
      dRate: prev ? rate(m) - rate(prev.gapMatrix) : null,
      dInvisible: prev ? count(m, "invisible") - count(prev.gapMatrix, "invisible") : null,
      dBlocked: prev ? count(m, "blocked") - count(prev.gapMatrix, "blocked") : null,
      sparkPages: recent.map((r) => r.gapMatrix.length),
      sparkRate: recent.map((r) => rate(r.gapMatrix)),
      sparkInvisible: recent.map((r) => count(r.gapMatrix, "invisible")),
      sparkBlocked: recent.map((r) => count(r.gapMatrix, "blocked")),
      chart: recent.map((r) => ({
        date: `${new Date(r.createdAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}`,
        brand: r.brandName,
        ...Object.fromEntries(VERDICTS.map((v) => [v.label, count(r.gapMatrix, v.key)])),
      })),
      table: [...m].sort((a, b) => VERDICTS.findIndex((v) => v.key === a.verdict) - VERDICTS.findIndex((v) => v.key === b.verdict)).reverse(),
    };
  }, [runs]);

  if (runs === null) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-muted" />
          ))}
        </div>
        <div className="h-64 rounded-2xl bg-muted" />
      </div>
    );
  }

  if (!stats) {
    return (
      <GhostChart
        title="Henüz gap analizi yok"
        body="Aşağıya sitenin adresini yaz — sayfaların teknik olarak sağlam olup olmadığı ve AI motorlarının onları gerçekten anıp anmadığı burada grafiklerle takip edilecek."
      />
    );
  }

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Analiz edilen sayfa" value={String(stats.pages)} spark={stats.sparkPages} hint={stats.last.brandName} />
        <KpiCard label="AI'da anılma oranı" value={`%${stats.citedRate}`} delta={stats.dRate} spark={stats.sparkRate} color="#16a34a" />
        <KpiCard label="Sağlam ama görünmez" value={String(stats.invisible)} delta={stats.dInvisible} deltaGoodWhen="down" spark={stats.sparkInvisible} hint="fırsat sayfası" />
        <KpiCard label="AI'ya kapalı sayfa" value={String(stats.blocked)} delta={stats.dBlocked} deltaGoodWhen="down" spark={stats.sparkBlocked} color="#ef4444" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4">
        <div className="rounded-2xl border border-border bg-panel">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3.5">
            <span className="text-sm font-bold">Sayfa durumu dağılımı</span>
            <span className="flex flex-wrap items-center gap-3 text-xs text-ink/50">
              {VERDICTS.map((v) => (
                <span key={v.key} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: v.color }} />
                  {v.label}
                </span>
              ))}
            </span>
          </div>
          <div className="h-64 px-2 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.chart} barCategoryGap="28%">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={28} />
                <Tooltip
                  cursor={{ fill: "rgba(93,22,255,0.04)" }}
                  labelFormatter={(l, p) => `${l} · ${p?.[0]?.payload?.brand ?? ""}`}
                  contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, fontSize: 12 }}
                />
                {VERDICTS.map((v, i) => (
                  <Bar key={v.key} dataKey={v.label} stackId="s" fill={v.color} radius={i === VERDICTS.length - 1 ? [6, 6, 0, 0] : 0} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <span className="text-sm font-bold">Son analiz · sayfalar</span>
            <span className="text-xs text-ink/40">{new Date(stats.last.createdAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-ink/45">
                <th className="px-5 py-2 text-left font-medium">Sayfa</th>
                <th className="py-2 text-left font-medium">SEO</th>
                <th className="py-2 text-left font-medium">AXO</th>
                <th className="py-2 pr-5 text-right font-medium">Durum</th>
              </tr>
            </thead>
            <tbody>
              {stats.table.slice(0, 7).map((r) => (
                <tr key={r.url} className="border-t border-border">
                  <td className="px-5 py-2.5">
                    <span className="block max-w-[11rem] truncate font-medium" title={r.url}>{path(r.url)}</span>
                  </td>
                  <td className="py-2.5 tabular-nums text-ink/70">{r.seoScore}</td>
                  <td className="py-2.5 tabular-nums text-ink/70">{r.aiCrawlScore}</td>
                  <td className="py-2.5 pr-5 text-right">
                    <span className={`whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-bold ${V[r.verdict].badge}`}>{V[r.verdict].label}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
