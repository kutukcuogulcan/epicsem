"use client";

import { useEffect, useState } from "react";

interface UsageData {
  plan: string;
  demoMode: boolean;
  engineQueries: { used: number; limit: number };
  contentGenerations: { used: number; limit: number };
}

const METRIC_LABEL = {
  engineQueries: "AI motor sorgusu",
  contentGenerations: "içerik üretimi",
} as const;

/** Read-only usage indicator — fetches /api/usage. Renders nothing while loading or signed out. */
export default function UsageMeter({ metric }: { metric: keyof typeof METRIC_LABEL }) {
  const [data, setData] = useState<UsageData | null>(null);

  useEffect(() => {
    fetch("/api/usage")
      .then((res) => (res.ok ? res.json() : null))
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) return null;
  const m = data[metric];
  const pct = m.limit > 0 ? Math.min(100, Math.round((m.used / m.limit) * 100)) : 0;

  return (
    <p className="text-xs text-ink/40">
      Bu ay: {m.used}/{m.limit} {METRIC_LABEL[metric]} kullanıldı
      {data.demoMode && <span> (demo modda sayılmaz — gerçek API anahtarı bağlandığında geçerli olur)</span>}
      {pct >= 90 && !data.demoMode && <span className="text-warn"> — limite yaklaşıyorsunuz</span>}
    </p>
  );
}
