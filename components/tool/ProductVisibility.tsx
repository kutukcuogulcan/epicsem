"use client";

import { useEffect, useState } from "react";
import type { ProductRow } from "@/lib/product-visibility";
import { Card, CardHeader } from "@/components/ui";
import { EngineDot } from "@/components/tool/MonitorBits";

/** Peec'teki alışveriş görünürlüğünün karşılığı: AI cevaplarında hangi ürünler öneriliyor (adlar AI'dan, sayım koddan). */
export default function ProductVisibility({ testAt }: { testAt?: string | null }) {
  const [rows, setRows] = useState<ProductRow[] | null>(null);
  const [answers, setAnswers] = useState(0);
  const [brand, setBrand] = useState("");
  const [state, setState] = useState<"loading" | "writing" | "ready" | "error" | "none">("loading");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let off = false;
    (async () => {
      const g = await fetch("/api/geo/products").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (off) return;
      if (!g || g.answers == null) return setState("none");
      setAnswers(g.answers);
      setBrand(g.brand ?? "");
      if (g.products) return setRows(g.products), setState("ready");
      setState("writing");
      const r = await fetch("/api/geo/products", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (off) return;
      if (r.ok) {
        setRows(d.products ?? []);
        setState("ready");
        window.dispatchEvent(new Event("epicsem:usage-changed"));
      } else {
        setMsg(d.error ?? "Ürünler çıkarılamadı");
        setState("error");
      }
    })();
    return () => {
      off = true;
    };
  }, [testAt]);

  if (state === "none") return null;
  const own = (rows ?? []).filter((r) => r.own);
  const rival = (rows ?? []).filter((r) => !r.own);
  return (
    <Card>
      <CardHeader
        title="AI hangi ürünleri öneriyor?"
        subtitle={`Son testin ${answers} cevabında adı geçen ürünler. Ürün adlarını AI çıkarır; her ad cevaplarda doğrulanıp kodla sayılır, geçmeyen ad listeye girmez.`}
      />
      {state !== "ready" ? (
        <p className={`mt-3 text-sm ${state === "error" ? "text-danger-ink" : "text-sub"}`} aria-busy={state !== "error"}>
          {state === "writing" ? "Ürünler çıkarılıyor… (1 AI sorgusu, bu test için bir kez)" : state === "error" ? msg : "Yükleniyor…"}
        </p>
      ) : !rows?.length ? (
        <p className="mt-3 text-sm text-sub">Cevaplarda belirli bir ürün adı geçmiyor; AI yalnızca markaları öneriyor.</p>
      ) : (
        <>
          {rival[0] && (
            <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm text-ink">
              En çok önerilen ürün <b>{rows[0].name}</b> ({rows[0].brand}, {rows[0].answers} cevap).{" "}
              {own.length ? (
                <>
                  {brand}'in en çok önerilen ürünü <b>{own[0].name}</b> ({own[0].answers} cevap).
                </>
              ) : (
                <>{brand}'in hiçbir ürünü adıyla önerilmiyor; AI markayı anıyor ama belirli bir ürün göstermiyor.</>
              )}
            </p>
          )}
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs text-sub">
              <tr><th className="py-1.5 font-medium">Ürün</th><th className="font-medium">Marka</th><th className="text-right font-medium">Cevap</th><th className="pl-3 font-medium">Motor</th></tr>
            </thead>
            <tbody>
              {rows.slice(0, 15).map((r) => (
                <tr key={r.name} className="border-t border-border">
                  <td className={`py-2 ${r.own ? "font-semibold text-ink" : "text-ink"}`}>{r.name}</td>
                  <td className="text-sub">{r.own ? `${r.brand} (sen)` : r.brand}</td>
                  <td className="text-right tabular-nums">{r.answers}</td>
                  <td className="pl-3"><span className="flex gap-1">{r.engines.map((e) => <EngineDot key={e} engine={e} size={14} />)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Card>
  );
}
