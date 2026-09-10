"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface ActivityPoint {
  date: string; // "YYYY-MM-DD"
  generated: number;
  published: number;
}

/**
 * Same chart library/styling as /monitor's SEO/AXO trend line — kept visually
 * consistent across the app rather than introducing a second charting convention
 * just for this page.
 */
export default function DashboardActivityChart({ data }: { data: ActivityPoint[] }) {
  const chartData = data.map((d) => ({
    date: new Date(d.date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }),
    "Üretilen": d.generated,
    "Yayınlanan": d.published,
  }));

  const allZero = data.every((d) => d.generated === 0 && d.published === 0);

  if (allZero) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-ink/40">
        Henüz içerik üretilmedi — Content Studio veya Article Writer'dan bir taslak ürettiğinde burada görünecek.
      </div>
    );
  }

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e0f5" />
          <XAxis dataKey="date" stroke="#8a8398" fontSize={11} />
          <YAxis stroke="#8a8398" fontSize={11} allowDecimals={false} />
          <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e5e0f5", color: "#1e1b29" }} />
          <Legend />
          <Line type="monotone" dataKey="Üretilen" stroke="#5d16ff" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="Yayınlanan" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
