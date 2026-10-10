"use client";

import { useEffect, useState } from "react";

/**
 * Ana sayfa hero'sunun altındaki büyük "panel önizlemesi" — peec.ai'ın hero'sundaki canlı
 * dashboard görseline karşılık. Epicsem'in gerçek /dashboard Genel bakış ekranının
 * düzenini (sol menü, görünürlük grafiği, ilk markalar tablosu) taklit eder; çizgiler
 * kendini çizer, çubuklar dolar, sayılar sayar. Veriler kurgusal ("Markan", "Rakip A"…)
 * ve köşede "Örnek görünüm" diye etiketli — gerçek müşteri verisi gibi sunulmaz.
 */

const SERIES = [
  { name: "Markan", color: "#5d16ff", points: [22, 24, 23, 27, 30, 29, 33, 36, 35, 39, 42, 44] },
  { name: "Rakip A", color: "#16a34a", points: [34, 33, 35, 34, 33, 35, 34, 36, 35, 34, 36, 35] },
  { name: "Rakip B", color: "#ef4444", points: [28, 29, 27, 28, 30, 29, 28, 27, 29, 28, 27, 28] },
  { name: "Rakip C", color: "#334155", points: [14, 15, 15, 16, 15, 17, 16, 17, 18, 17, 18, 19] },
];

const ROWS = [
  { name: "Markan", vis: 44, sov: 21, pos: "2,1", delta: "+12" },
  { name: "Rakip A", vis: 35, sov: 17, pos: "2,8", delta: "+1" },
  { name: "Rakip B", vis: 28, sov: 13, pos: "3,4", delta: "-2" },
  { name: "Rakip C", vis: 19, sov: 9, pos: "4,6", delta: "+3" },
];

const MENU = ["Genel bakış", "Promptlar", "Rakipler", "Kaynaklar", "Gap analizi", "Aksiyonlar"];

function path(points: number[], w: number, h: number) {
  const max = 50;
  const step = w / (points.length - 1);
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (p / max) * h).toFixed(1)}`).join(" ");
}

export default function HeroDashboardPreview() {
  const [on, setOn] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setOn(true), 400);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!on) return;
    if (count >= 44) return;
    const t = setTimeout(() => setCount((c) => Math.min(44, c + 2)), 35);
    return () => clearTimeout(t);
  }, [on, count]);

  const W = 520;
  const H = 170;

  return (
    <div className="rounded-2xl border border-border bg-panel shadow-2xl shadow-accent/15 overflow-hidden text-left">
      {/* pencere çubuğu */}
      <div className="flex items-center gap-2 border-b border-border bg-muted/60 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-danger/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-warn/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-seo/60" />
        <span className="ml-2 rounded-md border border-border bg-panel px-2.5 py-0.5 text-[11px] text-ink/40">epicsem.app/dashboard</span>
        <span className="ml-auto rounded-full bg-warn/10 px-2 py-0.5 text-[10px] font-bold text-warn">Örnek görünüm</span>
      </div>

      <div className="grid grid-cols-[150px_1fr] max-md:grid-cols-1">
        {/* sol menü */}
        <aside className="max-md:hidden border-r border-border p-3 space-y-1 bg-paper/60">
          <div className="flex items-center gap-2 px-2 pb-3 text-sm font-extrabold">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-[11px] text-white">E</span>
            Epicsem
          </div>
          {MENU.map((m, i) => (
            <div key={m} className={`rounded-lg px-2.5 py-1.5 text-xs ${i === 0 ? "bg-accent/10 font-bold text-accent" : "text-ink/50"}`}>
              {m}
            </div>
          ))}
        </aside>

        <div className="p-4 space-y-4 min-w-0">
          {/* KPI kartları */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Görünürlük", value: `%${count}`, sub: "+12 puan", tone: "text-seo" },
              { label: "Share of Voice", value: `%${Math.round(count / 2.1)}`, sub: "4 marka içinde", tone: "text-ink/40" },
              { label: "Ort. pozisyon", value: "#2,1", sub: "-0,6", tone: "text-seo" },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-border p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-ink/40">{k.label}</div>
                <div className="mt-1 text-xl font-extrabold tabular-nums">{k.value}</div>
                <div className={`text-[10px] font-semibold ${k.tone}`}>{k.sub}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_1fr] gap-3">
            {/* grafik */}
            <div className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between pb-2">
                <span className="text-xs font-bold">Görünürlük trendi</span>
                <span className="flex gap-1 text-[10px] text-ink/40">
                  <span className="rounded bg-muted px-1.5 py-0.5 font-bold text-ink">G</span>
                  <span className="px-1.5 py-0.5">H</span>
                  <span className="px-1.5 py-0.5">A</span>
                </span>
              </div>
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="none">
                {[0, 1, 2, 3].map((i) => (
                  <line key={i} x1="0" x2={W} y1={(H / 4) * i + 1} y2={(H / 4) * i + 1} stroke="#e2e8f0" strokeDasharray="4 4" />
                ))}
                {SERIES.map((s, i) => (
                  <path
                    key={s.name}
                    d={path(s.points, W, H)}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={i === 0 ? 3 : 2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    pathLength={1}
                    style={{
                      strokeDasharray: 1,
                      strokeDashoffset: on ? 0 : 1,
                      transition: `stroke-dashoffset 1.8s cubic-bezier(0.16,1,0.3,1) ${i * 0.15}s`,
                    }}
                  />
                ))}
                {on && (
                  <circle cx={W} cy={H - (44 / 50) * H} r="5" fill="#5d16ff" className="animate-pop" style={{ animationDelay: "1.6s" }} />
                )}
              </svg>
            </div>

            {/* tablo */}
            <div className="rounded-xl border border-border p-3">
              <div className="pb-2 text-xs font-bold">İlk markalar</div>
              <div className="space-y-2">
                {ROWS.map((r, i) => (
                  <div key={r.name} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="flex items-center gap-1.5 font-semibold">
                        <span className="h-2 w-2 rounded-full" style={{ background: SERIES[i].color }} />
                        {r.name}
                      </span>
                      <span className="tabular-nums text-ink/60">
                        %{r.vis} <span className={r.delta.startsWith("-") ? "text-danger" : "text-seo"}>{r.delta}</span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: on ? `${r.vis * 2}%` : "0%",
                          background: SERIES[i].color,
                          transition: `width 1.4s cubic-bezier(0.16,1,0.3,1) ${0.3 + i * 0.12}s`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
