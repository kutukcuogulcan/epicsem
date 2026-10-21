"use client";

import { useState } from "react";
import type { PassageReport } from "@/lib/citability";

const TONE: Record<string, string> = { A: "bg-seo/10 text-seo", B: "bg-seo/10 text-seo", C: "bg-warn/10 text-warn", D: "bg-danger/10 text-danger", F: "bg-danger/10 text-danger" };
const DIMS: [keyof PassageReport["all"][number]["breakdown"], string, number][] = [
  ["answer", "Cevap", 30],
  ["selfContained", "Bağımsız", 25],
  ["structure", "Yapı", 20],
  ["stats", "Veri", 15],
  ["unique", "Özgün", 10],
];

/** Bölüm bazlı alıntılanabilirlik listesi — Editör, Content Studio ve Site Taraması'nda ortak. */
export default function PassageList({ report, compact = false }: { report: PassageReport; compact?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  if (!report.count) return <p className="text-[11px] text-ink/45">Puanlanacak kadar uzun bölüm yok (bölüm başına en az 20 kelime).</p>;
  const list = all ? [...report.all].sort((a, b) => a.score - b.score) : report.weak;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink/55">
        <span>
          {report.count} bölüm · ort. <strong className="text-ink/80">{report.avg}</strong>
        </span>
        <span>·</span>
        <span title="AI motorlarının en çok alıntıladığı uzunluk">{report.optimal} bölüm ideal uzunlukta (134–167 kelime)</span>
        <span className="ml-auto flex gap-1">
          {(["A", "B", "C", "D", "F"] as const).map((g) =>
            report.grades[g] ? (
              <span key={g} className={`rounded px-1.5 py-px text-[10px] font-bold ${TONE[g]}`}>
                {g}·{report.grades[g]}
              </span>
            ) : null
          )}
        </span>
      </div>
      <div className="text-[10px] font-bold uppercase tracking-wide text-ink/40">{all ? "Tüm bölümler (zayıftan güçlüye)" : "Önce bunları düzelt"}</div>
      <ul className="space-y-1">
        {list.map((p, i) => (
          <li key={`${p.heading}-${i}`} className="rounded-lg border border-border">
            <button type="button" onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left">
              <span className={`shrink-0 rounded px-1.5 py-px text-[10px] font-bold tabular-nums ${TONE[p.grade]}`}>{p.score}</span>
              <span className="min-w-0 flex-1 truncate text-xs font-medium">{p.heading}</span>
              <span className="shrink-0 text-[10px] text-ink/40">{p.words} kel.</span>
            </button>
            {open === i && (
              <div className="space-y-2 border-t border-border px-2.5 py-2">
                <p className="text-[11px] leading-relaxed text-ink/55">{p.preview}</p>
                <div className={`grid gap-1 ${compact ? "grid-cols-5" : "grid-cols-5"}`}>
                  {DIMS.map(([k, l, max]) => (
                    <div key={k} className="text-center">
                      <div className="h-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${(p.breakdown[k] / max) * 100}%` }} />
                      </div>
                      <div className="mt-0.5 text-[9px] text-ink/45">
                        {l} {p.breakdown[k]}/{max}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="rounded-md bg-accent/5 px-2 py-1.5 text-[11px] text-ink/70">{p.tip}</p>
              </div>
            )}
          </li>
        ))}
      </ul>
      {report.count > list.length || all ? (
        <button type="button" onClick={() => setAll((v) => !v)} className="text-[11px] font-semibold text-accent hover:underline">
          {all ? "Sadece en zayıfları göster" : `Tüm ${report.count} bölümü göster`}
        </button>
      ) : null}
      <p className="text-[10px] text-ink/35">AI motorları sayfayı bölüm bölüm alıntılar. Yöntem: geo-seo-claude (MIT), Türkçe için uyarlandı.</p>
    </div>
  );
}
