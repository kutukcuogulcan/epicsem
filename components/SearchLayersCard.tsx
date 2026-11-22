"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Pillar } from "@/lib/audit-insights";
import { searchLayers, weakestLayer } from "@/lib/search-layers";
import { Card, CardHeader } from "@/components/ui";

const tone = (s: number) => (s >= 70 ? { bar: "bg-seo", text: "text-seo-ink" } : s >= 40 ? { bar: "bg-warn", text: "text-warn-ink" } : { bar: "bg-danger", text: "text-danger-ink" });

/** Genel Bakış: SEO → AEO → GEO → AIO → SXO. SXO (mobil hız) açılışta Google PageSpeed'den ölçülür (ücretsiz). */
export default function SearchLayersCard({ pillars, geoVisibility, siteUrl }: { pillars: Pillar[] | null; geoVisibility: number | null; siteUrl: string }) {
  const [sxo, setSxo] = useState<number | null>(null);
  const [sxoState, setSxoState] = useState<"loading" | "done" | "failed">("loading");

  useEffect(() => {
    let off = false;
    fetch(`/api/pagespeed?url=${encodeURIComponent(siteUrl)}&strategy=mobile`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => !off && (setSxo(typeof d.labScore === "number" ? Math.round(d.labScore) : null), setSxoState("done")))
      .catch(() => !off && setSxoState("failed"));
    return () => {
      off = true;
    };
  }, [siteUrl]);

  const layers = searchLayers({ pillars, geoVisibility, sxoScore: sxo });
  const first = weakestLayer(layers);

  return (
    <Card>
      <CardHeader title="Arama görünürlüğünün 5 katmanı" subtitle="Google'da bulunmaktan AI'da önerilmeye, oradan müşteriye: her katman bir öncekinin üstüne kurulur." />
      <ol className="divide-y divide-border">
        {layers.map((l) => {
          const t = l.score != null ? tone(l.score) : null;
          const pending = l.key === "sxo" && sxoState === "loading";
          return (
            <li key={l.key} className="grid grid-cols-[44px_1fr_auto] items-center gap-3 py-3 sm:grid-cols-[52px_1fr_140px]">
              <span className="text-sm font-semibold tracking-wide text-ink">{l.label}</span>
              <div className="min-w-0">
                <div className="text-[13px] text-ink">{l.question}</div>
                {l.fix && <div className="mt-0.5 truncate text-xs text-sub" title={l.fix}>{l.fix}</div>}
              </div>
              {l.score != null && t ? (
                <Link href={l.href} className="flex items-center justify-end gap-2" title="Ayrıntı">
                  <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:block">
                    <span className={`block h-full rounded-full ${t.bar}`} style={{ width: `${Math.max(l.score, 4)}%` }} />
                  </span>
                  <span className={`w-9 text-right text-sm font-semibold tabular-nums ${t.text}`}>{l.score}</span>
                </Link>
              ) : (
                <Link href={l.href} className="text-right text-xs font-medium text-accent hover:underline">
                  {pending ? "Ölçülüyor…" : l.missing}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
      {first && (
        <div className="mt-3 rounded-xl bg-accent/[0.06] px-4 py-3 text-[13px]">
          <span className="font-semibold text-accent">Önce bunu yap · {first.label}: </span>
          {first.fix ?? first.question}{" "}
          <Link href={first.href} className="font-medium text-accent hover:underline">
            Git →
          </Link>
        </div>
      )}
    </Card>
  );
}
