"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { GeoSummary } from "@/lib/geo-summary";
import type { RunDiff } from "@/lib/geo-diff";
import { Card } from "@/components/ui";
import { EngineDot } from "@/components/tool/MonitorBits";

const TAG: Record<string, string> = { yüksek: "bg-danger/10 text-danger-ink", orta: "bg-warn/10 text-warn-ink", düşük: "bg-muted text-sub" };
const day = (iso: string) => new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });

/** Maya/Peec tarzı özet: ne oldu, neden, şimdi ne yapmalı + öncelikli işler (AI, test başına 1 sorgu) ve kazanım/kayıplar (koddan). */
export default function GeoSummaryCard({ testAt }: { testAt?: string | null }) {
  const [s, setS] = useState<GeoSummary | null>(null);
  const [diff, setDiff] = useState<RunDiff | null>(null);
  const [prevAt, setPrevAt] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "writing" | "ready" | "error">("loading");
  const [err, setErr] = useState("");

  useEffect(() => {
    let off = false;
    (async () => {
      setState("loading");
      const g = await fetch("/api/geo/summary").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (off || !g) return void (!off && setState("error"));
      setDiff(g.diff ?? null);
      setPrevAt(g.prevAt ?? null);
      if (g.summary) return void (setS(g.summary), setState("ready"));
      if (!g.createdAt) return void setState("error");
      // Kayıt yok: arka planda üret, sayfa beklemez.
      setState("writing");
      const r = await fetch("/api/geo/summary", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (off) return;
      if (r.ok && d.summary) {
        setS(d.summary);
        setState("ready");
        window.dispatchEvent(new Event("epicsem:usage-changed"));
      } else {
        setErr(d.error ?? "Özet üretilemedi");
        setState("error");
      }
    })();
    return () => {
      off = true;
    };
  }, [testAt]);

  if (state === "error" && !err) return null;
  return (
    <Card>
      {state === "loading" || state === "writing" ? (
        <div className="space-y-2" aria-busy="true">
          <p className="text-xs font-medium text-sub">{state === "writing" ? "AI özeti hazırlanıyor… (1 AI sorgusu, bu test için bir kez)" : "Özet yükleniyor…"}</p>
          <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      ) : state === "error" ? (
        <p className="text-sm text-sub">
          AI özeti üretilemedi: {err}{" "}
          {/kota|sınır/i.test(err) && <Link href="/billing" className="text-accent hover:underline">Kullanım</Link>}
        </p>
      ) : (
        s && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">Özet</p>
              <p className="mt-1 text-base font-semibold text-ink">{s.headline}</p>
              {s.cause && <p className="mt-1 text-sm text-sub">{s.cause}</p>}
              {s.urgentAction && (
                <p className="mt-2 rounded-lg bg-accent/5 px-3 py-2 text-sm text-ink">
                  <span className="font-semibold text-accent">Şimdi: </span>
                  {s.urgentAction}
                </p>
              )}
            </div>
            {s.actions.length > 0 && (
              <div>
                <p className="text-xs font-medium text-sub">Öncelikli işler</p>
                <ol className="mt-2 space-y-2.5">
                  {s.actions.map((a, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink">{a.action}</p>
                        <p className="text-sub">{a.why}</p>
                        <div className="mt-1 flex gap-1.5 text-xs">
                          <span className={`rounded-md px-1.5 py-0.5 ${TAG[a.impact]}`}>Etki: {a.impact}</span>
                          <span className="rounded-md bg-muted px-1.5 py-0.5 text-sub">Efor: {a.effort}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <div className="grid gap-4 border-t border-border pt-3 sm:grid-cols-2">
              {diff && prevAt && diff.compared ? (
                [
                  { t: `Kazanımlar (${diff.gained.length})`, cls: "text-seo-ink", xs: diff.gained },
                  { t: `Kayıplar (${diff.lost.length})`, cls: "text-danger-ink", xs: diff.lost },
                ].map((col) => (
                  <div key={col.t}>
                    <p className={`text-xs font-medium ${col.cls}`}>
                      {col.t} <span className="text-sub">· {day(prevAt)} testine göre</span>
                    </p>
                    <ul className="mt-1 space-y-1">
                      {col.xs.slice(0, 4).map((x, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="mt-0.5"><EngineDot engine={x.engine} size={14} /></span>
                          <span className="line-clamp-2 text-ink">{x.prompt}</span>
                        </li>
                      ))}
                      {!col.xs.length && <li className="text-sm text-sub">Yok</li>}
                    </ul>
                  </div>
                ))
              ) : (
                <p className="text-sm text-sub sm:col-span-2">Kazanım ve kayıplar ikinci testten sonra görünür (aynı sorular iki testte karşılaştırılır).</p>
              )}
            </div>
          </div>
        )
      )}
    </Card>
  );
}
