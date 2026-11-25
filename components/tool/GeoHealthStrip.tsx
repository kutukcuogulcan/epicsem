"use client";

import { useEffect, useMemo, useState } from "react";
import type { GeoRunResult } from "@/types";
import { buildPerception } from "@/lib/brand-perception";
import { aggregateFanout } from "@/lib/fanout";
import { levelName, type DomainReadiness } from "@/lib/agent-readiness-types";
import { CARD } from "@/components/ui";

type Tab = "readiness" | "perception" | "fanout";

/** GEO Özet: hazırlık seviyesi, marka algısı ve AI aramaları tek satırda; ilgili sekmeye götürür. AI yok. */
export default function GeoHealthStrip({ runs, brand, competitors, onTab }: { runs: GeoRunResult[]; brand: { name: string }; competitors: { name: string }[]; onTab: (t: Tab) => void }) {
  const [ready, setReady] = useState<DomainReadiness | null | undefined>(undefined);
  useEffect(() => {
    fetch("/api/geo/readiness")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setReady((d?.results as DomainReadiness[] | null)?.find((x) => x.own) ?? null))
      .catch(() => setReady(null));
  }, []);
  const me = useMemo(() => buildPerception(runs, [brand, ...competitors.slice(0, 5)])[0], [runs, brand, competitors]);
  const fan = useMemo(() => aggregateFanout(runs), [runs]);
  const neg = me?.terms.filter((t) => t.negative) ?? [];
  const top = me?.terms.find((t) => !t.negative);
  const lost = fan.filter((q) => q.ownMentionRate === 0).length;

  const cells: { tab: Tab; label: string; value: string; hint: string; warn: boolean }[] = [
    {
      tab: "readiness",
      label: "AI ajan hazırlığı",
      value: ready ? `${ready.level}/5 · ${levelName(ready.level)}` : ready === null ? "Ölçülmedi" : "…",
      hint: ready?.next?.blocking.length ? `Üst seviyeye ${ready.next.blocking.length} engel` : ready ? "Engel yok" : "Ücretsiz ölç →",
      warn: !ready || ready.level < 3,
    },
    {
      tab: "perception",
      label: "Marka algısı",
      value: neg.length ? `${neg.length} olumsuz ifade` : top ? `“${top.term}”` : "Belirgin ifade yok",
      hint: neg.length ? `ör. “${neg[0].term}”` : me?.mentions ? `${me.mentions} cevapta anıldın` : "Cevaplarda anılmadın",
      warn: neg.length > 0,
    },
    {
      tab: "fanout",
      label: "AI'ın aramaları",
      value: fan.length ? `${fan.length} arama` : "Kayıt yok",
      hint: fan.length ? `${lost} aramada markan hiç geçmedi` : "Yeni testlerde kaydedilir",
      warn: lost > 0,
    },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {cells.map((c) => (
        <button key={c.tab} type="button" onClick={() => onTab(c.tab)} className={`${CARD} p-4 text-left transition-colors hover:border-[#BDB4FF]`}>
          <div className="text-xs font-medium text-sub">{c.label}</div>
          <div className="mt-1 truncate text-[15px] font-semibold">{c.value}</div>
          <div className={`mt-0.5 text-xs ${c.warn ? "text-warn-ink" : "text-sub"}`}>{c.hint}</div>
        </button>
      ))}
    </div>
  );
}
