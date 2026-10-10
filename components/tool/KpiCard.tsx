"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";

/** Ahrefs/arvow tarzı KPI kartı: küçük etiket, büyük sayı, değişim, altta mini alan grafiği. */
export default function KpiCard({
  label,
  value,
  delta,
  deltaGoodWhen = "up",
  spark,
  color = "#5d16ff",
  hint,
}: {
  label: string;
  value: string;
  delta?: number | null;
  deltaGoodWhen?: "up" | "down";
  spark?: number[];
  color?: string;
  hint?: string;
}) {
  const good = delta == null || delta === 0 ? null : deltaGoodWhen === "up" ? delta > 0 : delta < 0;
  const data = (spark ?? []).map((v, i) => ({ i, v }));
  const id = `g-${label.replace(/\W/g, "")}`;
  return (
    <div className="rounded-2xl border border-border bg-panel p-4 flex flex-col">
      <div className="flex items-center justify-between text-xs font-medium text-ink/50">
        <span>{label}</span>
        {hint && <span className="text-ink/30">{hint}</span>}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-2xl font-extrabold tracking-tight tabular-nums">{value}</span>
        {delta != null && delta !== 0 && (
          <span className={`text-xs font-semibold tabular-nums ${good ? "text-seo" : "text-danger"}`}>
            {delta > 0 ? "+" : ""}
            {delta.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}
          </span>
        )}
      </div>
      <div className="mt-2 h-10 -mx-1">
        {data.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${id})`} isAnimationActive />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full rounded-md bg-gradient-to-r from-muted to-transparent" />
        )}
      </div>
    </div>
  );
}
