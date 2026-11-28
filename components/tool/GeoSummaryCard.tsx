"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { GeoSummary } from "@/lib/geo-summary";
import { actionKey, type ActionItem, type ActionStatus } from "@/lib/action-items";
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
  const [items, setItems] = useState<(ActionItem & { since: { tests: number; from: number; to: number | null } | null })[]>([]);
  const loadItems = () =>
    fetch("/api/geo/action-items")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setItems(d.items ?? []))
      .catch(() => undefined);
  const setStatus = async (id: number, status: ActionStatus) => {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, status } : x)));
    await fetch("/api/geo/action-items", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) }).catch(() => undefined);
    loadItems();
  };

  useEffect(() => {
    let off = false;
    (async () => {
      setState("loading");
      const g = await fetch("/api/geo/summary").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (off || !g) return void (!off && setState("error"));
      setDiff(g.diff ?? null);
      setPrevAt(g.prevAt ?? null);
      if (g.summary) return void (setS(g.summary), setState("ready"), loadItems());
      if (!g.createdAt) return void setState("error");
      // Kayıt yok: arka planda üret, sayfa beklemez.
      setState("writing");
      const r = await fetch("/api/geo/summary", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (off) return;
      if (r.ok && d.summary) {
        setS(d.summary);
        setState("ready");
        loadItems();
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
                  {s.actions.map((a, i) => {
                    const it = items.find((x) => x.key === actionKey(a.action));
                    if (it?.status === "dismissed") return null;
                    return (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink">{a.action}</p>
                        <p className="text-sub">{a.why}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                          <span className={`rounded-md px-1.5 py-0.5 ${TAG[a.impact]}`}>Etki: {a.impact}</span>
                          <span className="rounded-md bg-muted px-1.5 py-0.5 text-sub">Efor: {a.effort}</span>
                          {it && <StatusButtons item={it} onSet={setStatus} />}
                        </div>
                        {it?.status === "done" && <Since item={it} />}
                      </div>
                    </li>
                    );
                  })}
                </ol>
              </div>
            )}
            {(() => {
              const keys = new Set(s.actions.map((a) => actionKey(a.action)));
              const tracked = items.filter((x) => (x.status === "doing" || x.status === "done") && !keys.has(x.key));
              return tracked.length ? (
                <div className="border-t border-border pt-3">
                  <p className="text-xs font-medium text-sub">Takip ettiğin diğer işler</p>
                  <ul className="mt-1.5 space-y-2">
                    {tracked.slice(0, 8).map((x) => (
                      <li key={x.id} className="text-sm">
                        <span className="text-ink">{x.title}</span>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs"><StatusButtons item={x} onSet={setStatus} /></div>
                        {x.status === "done" && <Since item={x} />}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null;
            })()}
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

function StatusButtons({ item, onSet }: { item: ActionItem; onSet: (id: number, s: ActionStatus) => void }) {
  const btn = (st: ActionStatus, label: string, on: string) => (
    <button
      type="button"
      onClick={() => onSet(item.id, item.status === st ? "open" : st)}
      aria-pressed={item.status === st}
      className={`rounded-md border px-1.5 py-0.5 ${item.status === st ? on : "border-border text-sub hover:text-ink"}`}
    >
      {label}
    </button>
  );
  return (
    <>
      {btn("doing", "Yapılıyor", "border-warn bg-warn/10 text-warn-ink")}
      {btn("done", "Yapıldı ✓", "border-seo bg-seo/10 text-seo-ink")}
      {item.status === "open" && (
        <button type="button" onClick={() => onSet(item.id, "dismissed")} className="px-1 text-sub hover:text-ink" title="Bu işi listeden kaldır">
          Gizle
        </button>
      )}
    </>
  );
}

function Since({ item }: { item: ActionItem & { since?: { tests: number; from: number; to: number | null } | null } }) {
  const x = item.since;
  if (!item.doneAt) return null;
  const pct = (v: number) => `%${Math.round(v * 100)}`;
  return (
    <p className="mt-1 text-xs text-sub">
      {day(item.doneAt)} yapıldı ·{" "}
      {!x || x.to == null ? (
        "sonucu bir sonraki testte görünecek"
      ) : (
        <>
          o günden beri {x.tests} test · görünürlük {pct(x.from)} → <b className={x.to > x.from ? "text-seo-ink" : x.to < x.from ? "text-danger-ink" : ""}>{pct(x.to)}</b>{" "}
          <span title="Bu, işaretlendiği tarihten sonraki değişimdir; tek başına bu işin etkisi olduğunu kanıtlamaz.">(değişim; neden-sonuç değil)</span>
        </>
      )}
    </p>
  );
}
