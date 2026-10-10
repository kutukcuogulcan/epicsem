"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import KpiCard from "./KpiCard";
import GhostChart from "./GhostChart";

interface AuditRun {
  id: number;
  url: string;
  score: number;
  aiCrawlScore: number;
  wordCount: number;
  hasSchema: boolean;
  blockedBots: number;
  issueCount: number;
  createdAt: string;
}

function host(url: string) {
  try {
    return new URL(/^https?:\/\//.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function scoreTone(n: number) {
  if (n >= 80) return "bg-seo/10 text-seo";
  if (n >= 50) return "bg-warn/10 text-warn";
  return "bg-danger/10 text-danger";
}

/**
 * /audit'e girince ilk görülen pano (Ahrefs/arvow tarzı): KPI kartları + mini grafikler,
 * SEO & AXO skor trendi alan grafiği, son denetimler tablosu. Hepsi kullanıcının gerçek
 * audit_runs kayıtlarından. `onPick` ile tablodan bir URL'i formun içine geri koyar.
 */
export default function AuditOverview({ refreshKey = 0, onPick }: { refreshKey?: number; onPick?: (url: string) => void }) {
  const [runs, setRuns] = useState<AuditRun[] | null>(null);

  useEffect(() => {
    fetch("/api/audit/runs")
      .then((r) => (r.ok ? r.json() : { runs: [] }))
      .then((d) => setRuns(d.runs ?? []))
      .catch(() => setRuns([]));
  }, [refreshKey]);

  const stats = useMemo(() => {
    if (!runs || runs.length === 0) return null;
    // Her URL'in en son denetimi → "şu anki durum".
    const latestByUrl = new Map<string, AuditRun>();
    for (const r of runs) latestByUrl.set(host(r.url), r);
    const latest = [...latestByUrl.values()];
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
    const last10 = runs.slice(-12);
    const first = runs[0];
    const last = runs[runs.length - 1];
    return {
      sites: latest.length,
      seo: avg(latest.map((r) => r.score)),
      axo: avg(latest.map((r) => r.aiCrawlScore)),
      issues: latest.reduce((a, r) => a + r.issueCount, 0),
      blocked: latest.reduce((a, r) => a + r.blockedBots, 0),
      dSeo: runs.length > 1 ? last.score - first.score : null,
      dAxo: runs.length > 1 ? last.aiCrawlScore - first.aiCrawlScore : null,
      sparkSeo: last10.map((r) => r.score),
      sparkAxo: last10.map((r) => r.aiCrawlScore),
      sparkIssues: last10.map((r) => r.issueCount),
      sparkBlocked: last10.map((r) => r.blockedBots),
      chart: runs.map((r) => ({
        date: new Date(r.createdAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }),
        SEO: r.score,
        AXO: r.aiCrawlScore,
      })),
      table: [...latest].sort((a, b) => b.id - a.id).slice(0, 8),
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
        title="Henüz denetim yok"
        body="Yukarıya bir adres yazıp ilk denetimi çalıştır — SEO ve AXO skorların, sorun sayın ve AI botlarının erişimi burada grafiklerle takip edilecek."
      />
    );
  }

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Ort. SEO skoru" value={String(stats.seo)} delta={stats.dSeo} spark={stats.sparkSeo} hint="/100" />
        <KpiCard label="Ort. AXO skoru" value={String(stats.axo)} delta={stats.dAxo} spark={stats.sparkAxo} color="#16a34a" hint="/100" />
        <KpiCard label="Açık sorun" value={String(stats.issues)} spark={stats.sparkIssues} color="#f59e0b" hint={`${stats.sites} site`} />
        <KpiCard label="Engelli AI botu" value={String(stats.blocked)} spark={stats.sparkBlocked} color="#ef4444" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
        <div className="rounded-2xl border border-border bg-panel">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <span className="text-sm font-bold">Skor trendi</span>
            <span className="flex items-center gap-3 text-xs text-ink/50">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" />SEO</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-seo" />AXO</span>
            </span>
          </div>
          <div className="h-64 px-2 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.chart}>
                <defs>
                  <linearGradient id="aSeo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5d16ff" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#5d16ff" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="aAxo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#16a34a" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={32} />
                <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, fontSize: 12 }} />
                <Area type="monotone" dataKey="SEO" stroke="#5d16ff" strokeWidth={2.5} fill="url(#aSeo)" />
                <Area type="monotone" dataKey="AXO" stroke="#16a34a" strokeWidth={2.5} fill="url(#aAxo)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-panel overflow-hidden">
          <div className="border-b border-border px-5 py-3.5 text-sm font-bold">Son denetimler</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-ink/45">
                <th className="px-5 py-2 text-left font-medium">Site</th>
                <th className="py-2 text-left font-medium">SEO</th>
                <th className="py-2 text-left font-medium">AXO</th>
                <th className="py-2 pr-5 text-right font-medium">Sorun</th>
              </tr>
            </thead>
            <tbody>
              {stats.table.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => onPick?.(r.url)}
                  className="cursor-pointer border-t border-border hover:bg-muted/60"
                  title="Bu adresi forma koy"
                >
                  <td className="px-5 py-2.5">
                    <span className="flex items-center gap-2 font-medium">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host(r.url))}&sz=32`} alt="" width={16} height={16} className="h-4 w-4 rounded" />
                      <span className="truncate max-w-[10rem]">{host(r.url)}</span>
                    </span>
                  </td>
                  <td className="py-2.5"><span className={`rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${scoreTone(r.score)}`}>{r.score}</span></td>
                  <td className="py-2.5"><span className={`rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${scoreTone(r.aiCrawlScore)}`}>{r.aiCrawlScore}</span></td>
                  <td className="py-2.5 pr-5 text-right tabular-nums text-ink/60">{r.issueCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
