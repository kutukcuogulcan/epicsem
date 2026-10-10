"use client";

import { useCallback, useEffect, useState } from "react";
import OverviewPanel, { type OverviewRunData } from "@/components/OverviewPanel";
import GhostChart from "./GhostChart";

/** /geo sayfasına girince ilk görülen pano: markanın görünürlük KPI'ları, trend grafiği,
 * ilk 7 marka ve kaynak dağılımı (gerçek geo_runs). `refreshKey` değişince yeniden çeker
 * (yeni test bittiğinde). */
export default function GeoOverview({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<{ brands: { brandName: string; brandDomain: string }[]; selectedDomain: string | null; runs: OverviewRunData[] } | null>(null);
  const [brand, setBrand] = useState<string | null>(null);

  const load = useCallback(async (b: string | null) => {
    try {
      const res = await fetch(`/api/overview${b ? `?brand=${encodeURIComponent(b)}` : ""}`);
      if (!res.ok) return setData({ brands: [], selectedDomain: null, runs: [] });
      setData(await res.json());
    } catch {
      setData({ brands: [], selectedDomain: null, runs: [] });
    }
  }, []);

  useEffect(() => {
    load(brand);
  }, [brand, refreshKey, load]);

  if (!data) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-muted" />
          ))}
        </div>
        <div className="h-72 rounded-2xl bg-muted" />
      </div>
    );
  }

  if (!data.selectedDomain) {
    return (
      <GhostChart
        title="Henüz GEO testi yok"
        body="İlk testi çalıştırdığında markanın görünürlüğü, rakiplerle karşılaştırması ve AI'ın alıntıladığı kaynaklar burada grafiklerle görünecek."
        cta={
          <a href="#yeni-test" className="mt-1 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white hover:opacity-90">
            İlk testi başlat ↓
          </a>
        }
      />
    );
  }

  return <OverviewPanel brands={data.brands} selectedDomain={data.selectedDomain} runs={data.runs} onBrandChange={setBrand} newTestHref="#yeni-test" />;
}
