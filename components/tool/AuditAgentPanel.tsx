"use client";

import { useEffect, useState } from "react";
import { ErrorBlock } from "@/components/ui";
import type { AuditAgentReport } from "@/lib/audit-agent";

const BTN1 = "inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-accent px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60";
const LVL: Record<string, string> = { yüksek: "bg-seo/10 text-seo-ink", orta: "bg-warn/10 text-warn-ink", düşük: "bg-muted text-sub" };
const short = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

/** Site Denetimi agent'ı: önemli sayfaları ve rakibi denetleyip en önemli 3-5 işi çıkarır (lib/audit-agent). */
export default function AuditAgentPanel({ url }: { url: string }) {
  const [r, setR] = useState<AuditAgentReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/audit/agent?url=${encodeURIComponent(url)}`)
      .then((x) => (x.ok ? x.json() : null))
      .then((d) => setR(d?.report ?? null))
      .catch(() => setR(null));
  }, [url]);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const x = await fetch("/api/audit/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      const d = await x.json();
      if (!x.ok) throw new Error(d.error ?? "Analiz yapılamadı");
      setR(d.report);
      window.dispatchEvent(new Event("epicsem:usage-changed"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analiz yapılamadı");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-panel px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink text-base text-white">◎</span>
        <div className="min-w-[14rem] flex-1">
          <div className="text-sm font-semibold">Denetim agent&apos;ı: bu site için en önemli 3-5 iş</div>
          <p className="text-[13px] text-sub">Önemli sayfalarını ve rakibinin karşılık gelen sayfasını aynı ölçütle denetler; genel kontrol listesi değil, bu siteye özel öncelik, gerekçe, adımlar ve rakip karşılaştırması çıkarır.</p>
        </div>
        <span className="text-[11px] text-sub">1-3 dk · 5 AI sorgusu</span>
        <button type="button" onClick={run} disabled={busy} className={BTN1}>{busy ? "Agent çalışıyor…" : r ? "Yeniden çalıştır" : "Agent'ı çalıştır"}</button>
      </div>
      <ErrorBlock message={error} />
      {r && (
        <div className="mt-4 space-y-4 text-[13px]">
          <ul className="space-y-1 text-sm">{r.summary.map((s) => <li key={s}>{s}</li>)}</ul>
          <details className="text-sub">
            <summary className="cursor-pointer">Agent ne yaptı ({r.trace.length} adım)</summary>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5">{r.trace.map((t, i) => <li key={i} className="break-all">{t}</li>)}</ol>
          </details>
          <ol className="space-y-3">
            {r.priorities.map((p, i) => (
              <li key={p.title} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                  <span className="text-sub">{i + 1}.</span>
                  <span className={`rounded-md px-2 py-0.5 ${LVL[p.impact]}`}>Etki: {p.impact}</span>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-sub">Emek: {p.effort}</span>
                </div>
                <h3 className="mt-2 text-sm font-semibold">{p.title}</h3>
                <p className="mt-1 text-ink/80">{p.why}</p>
                {p.steps.length > 0 && <ol className="mt-2 list-decimal space-y-0.5 pl-5">{p.steps.map((s) => <li key={s}>{s}</li>)}</ol>}
                {p.evidence.length > 0 && (
                  <ul className="mt-2 space-y-1 rounded-lg bg-seo/5 px-3 py-2">
                    {p.evidence.map((e) => (
                      <li key={e.url + e.finding}>
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-seo-ink">Denetlenen sayfa · </span>
                        {e.finding}{" "}
                        <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{short(e.url)}</a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
          {r.comparison.length > 0 && (
            <div className="overflow-x-auto">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-sub">Rakip karşılaştırması (denetlenen sayfalar)</div>
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-sub">
                    <th className="py-2 pr-3 font-medium">Ölçüt</th>
                    <th className="py-2 pr-3 font-medium">Sen</th>
                    <th className="py-2 font-medium">Rakip</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {r.comparison.map((c) => (
                    <tr key={c.aspect + c.rivalUrl}>
                      <td className="py-2 pr-3 font-medium">{c.aspect}</td>
                      <td className="py-2 pr-3">{c.own}</td>
                      <td className="py-2">{c.rival} <a href={c.rivalUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">({short(c.rivalUrl)})</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
