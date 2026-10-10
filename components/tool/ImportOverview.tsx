"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BulkImportResult } from "@/types";
import KpiCard from "./KpiCard";
import GhostChart from "./GhostChart";

type Summary = BulkImportResult["summary"];
interface Run {
  id: number;
  filename: string;
  rowCount: number;
  summary: Summary;
  createdAt: string;
}

export const SUMMARY_LABEL: Record<string, string> = {
  missingMetaDescription: "Eksik meta açıklaması",
  thinContent: "Yetersiz içerik",
  missingH1: "Eksik H1",
  duplicateTitles: "Tekrarlayan title",
  duplicateMetaDescriptions: "Tekrarlayan meta",
  titleTooLong: "Uzun title",
  metaDescriptionTooLong: "Uzun meta",
  multipleH1: "Birden çok H1",
  missingTitle: "Eksik title",
  brokenLinks: "Kırık sayfa",
  redirects: "Yönlendirme",
  nonIndexable: "İndekslenemez",
  noindexTag: "Noindex",
};
const RED = new Set(["brokenLinks", "missingTitle", "noindexTag"]);

const totalIssues = (s: Summary) =>
  Object.entries(s).reduce((a, [k, v]) => (k === "totalRows" || k === "redirects" || k === "nonIndexable" ? a : a + (v as number)), 0);

/**
 * /import'a girince ilk görülen pano — taramalardan gelen sorun sayıları, en çok görülen
 * sorun kategorileri ve son taramalar. `onPick` ile bir taramanın tam sonucu açılır.
 */
export default function ImportOverview({ refreshKey = 0, onPick }: { refreshKey?: number; onPick?: (id: number) => void }) {
  const [runs, setRuns] = useState<Run[] | null>(null);

  useEffect(() => {
    fetch("/api/import/runs")
      .then((r) => (r.ok ? r.json() : { runs: [] }))
      .then((d) => setRuns(d.runs ?? []))
      .catch(() => setRuns([]));
  }, [refreshKey]);

  const stats = useMemo(() => {
    if (!runs || runs.length === 0) return null;
    const chrono = [...runs].reverse();
    const last = runs[0];
    const prevSame = runs.slice(1).find((r) => r.filename.replace(" (kısmi)", "") === last.filename.replace(" (kısmi)", ""));
    const s = last.summary;
    return {
      last,
      pages: s.totalRows,
      issues: totalIssues(s),
      broken: s.brokenLinks,
      dupes: s.duplicateTitles + s.duplicateMetaDescriptions,
      dIssues: prevSame ? totalIssues(s) - totalIssues(prevSame.summary) : null,
      dBroken: prevSame ? s.brokenLinks - prevSame.summary.brokenLinks : null,
      sparkPages: chrono.slice(-12).map((r) => r.summary.totalRows),
      sparkIssues: chrono.slice(-12).map((r) => totalIssues(r.summary)),
      sparkBroken: chrono.slice(-12).map((r) => r.summary.brokenLinks),
      sparkDupes: chrono.slice(-12).map((r) => r.summary.duplicateTitles + r.summary.duplicateMetaDescriptions),
      bars: Object.entries(SUMMARY_LABEL)
        .map(([k, label]) => ({ key: k, label, value: (s as any)[k] as number }))
        .filter((b) => b.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
      table: runs.slice(0, 7),
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
        title="Henüz site taraması yok"
        body="Aşağıya sitenin adresini yaz — tüm sayfalar taranır; kırık linkler, eksik meta/başlık ve thin content burada grafiklerle takip edilir."
      />
    );
  }

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Taranan sayfa" value={String(stats.pages)} spark={stats.sparkPages} hint={stats.last.filename} />
        <KpiCard label="Toplam sorun" value={String(stats.issues)} delta={stats.dIssues} deltaGoodWhen="down" spark={stats.sparkIssues} color="#f59e0b" />
        <KpiCard label="Kırık sayfa" value={String(stats.broken)} delta={stats.dBroken} deltaGoodWhen="down" spark={stats.sparkBroken} color="#ef4444" hint="4xx/5xx" />
        <KpiCard label="Tekrarlayan title/meta" value={String(stats.dupes)} spark={stats.sparkDupes} hint="URL" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4">
        <div className="rounded-2xl border border-border bg-panel">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <span className="text-sm font-bold">En sık görülen sorunlar</span>
            <span className="text-xs text-ink/40">son tarama · sayfa sayısı</span>
          </div>
          <div className="h-64 px-3 pt-3">
            {stats.bars.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm font-semibold text-seo">Sorun bulunmadı — site temiz</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.bars} layout="vertical" margin={{ left: 8, right: 16 }} barCategoryGap="22%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="label" width={140} stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: "rgba(93,22,255,0.04)" }} contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="value" name="Sayfa" radius={[0, 6, 6, 0]}>
                    {stats.bars.map((b) => (
                      <Cell key={b.key} fill={RED.has(b.key) ? "#ef4444" : "#5d16ff"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-panel overflow-hidden">
          <div className="border-b border-border px-5 py-3.5 text-sm font-bold">Son taramalar</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-ink/45">
                <th className="px-5 py-2 text-left font-medium">Site</th>
                <th className="py-2 text-left font-medium">Sayfa</th>
                <th className="py-2 text-left font-medium">Sorun</th>
                <th className="py-2 pr-5 text-right font-medium">Tarih</th>
              </tr>
            </thead>
            <tbody>
              {stats.table.map((r) => (
                <tr key={r.id} onClick={() => onPick?.(r.id)} className="cursor-pointer border-t border-border hover:bg-muted/60" title="Sonucu aç">
                  <td className="px-5 py-2.5">
                    <span className="flex items-center gap-2 font-medium">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(r.filename.split(" ")[0])}&sz=32`} alt="" width={16} height={16} className="h-4 w-4 rounded" />
                      <span className="truncate max-w-[9rem]">{r.filename}</span>
                    </span>
                  </td>
                  <td className="py-2.5 tabular-nums text-ink/70">{r.rowCount}</td>
                  <td className="py-2.5">
                    <span className="rounded-md bg-warn/10 px-2 py-0.5 text-xs font-bold tabular-nums text-warn">{totalIssues(r.summary)}</span>
                  </td>
                  <td className="py-2.5 pr-5 text-right text-xs text-ink/45">
                    {new Date(r.createdAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
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
