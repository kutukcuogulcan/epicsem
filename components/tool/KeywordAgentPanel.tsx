"use client";

import Link from "next/link";
import { useState } from "react";
import { ErrorBlock, BTN1 } from "@/components/ui";
import type { KeywordAgentReport } from "@/lib/keyword-agent";

const DIFF: Record<string, string> = { kolay: "bg-seo/10 text-seo-ink", orta: "bg-warn/10 text-warn-ink", zor: "bg-danger/10 text-danger-ink" };

/** Kelime agent'ı: en değerli kelimelerde Google'da kim var, sitende karşılığı var mı → kazanılabilirlik ve plan. */
export default function KeywordAgentPanel({ seed, ideas }: { seed: string; ideas: { keyword: string; intent: string; hits: number }[] }) {
  const [r, setR] = useState<KeywordAgentReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const x = await fetch("/api/keywords/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seed, keywords: ideas.slice(0, 200) }) });
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
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Kelime agent&apos;ı: hangi kelimeler kazanılabilir?</div>
          <p className="text-[13px] text-sub">En değerli 5-8 kelimeyi seçer, her biri için Google&apos;da kimin üstte olduğuna bakar, sitende karşılığı var mı kontrol eder; zorluk ve içerik planı çıkarır. Arama hacmi verisi yoktur.</p>
        </div>
        <span className="text-[11px] text-sub">1-3 dk · 5 AI sorgusu</span>
        <button type="button" onClick={run} disabled={busy || ideas.length < 3} className={BTN1}>{busy ? "Agent çalışıyor…" : r ? "Yeniden çalıştır" : "Agent'ı çalıştır"}</button>
      </div>
      <ErrorBlock message={error} />
      {r && (
        <div className="mt-4 space-y-4 text-[13px]">
          <ul className="space-y-1 text-sm">{r.summary.map((s) => <li key={s}>{s}</li>)}</ul>
          <details className="text-sub">
            <summary className="cursor-pointer">Agent ne yaptı ({r.trace.length} adım)</summary>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5">{r.trace.map((t, i) => <li key={i}>{t}</li>)}</ol>
          </details>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-border text-left text-xs text-sub">
                  <th className="py-2 pr-3 font-medium">Kelime</th>
                  <th className="py-2 pr-3 font-medium">Zorluk</th>
                  <th className="py-2 pr-3 font-medium">Gereken içerik</th>
                  <th className="py-2 pr-3 font-medium">Google&apos;da üstte</th>
                  <th className="py-2 pr-3 font-medium">Sitende</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border align-top">
                {r.keywords.map((k) => (
                  <tr key={k.keyword}>
                    <td className="py-2.5 pr-3">
                      <div className="font-medium">{k.keyword}</div>
                      <div className="mt-0.5 text-sub">{k.why}</div>
                    </td>
                    <td className="py-2.5 pr-3"><span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${DIFF[k.difficulty]}`}>{k.difficulty}</span></td>
                    <td className="py-2.5 pr-3">{k.contentType}</td>
                    <td className="py-2.5 pr-3">
                      <ul className="space-y-0.5">
                        {k.topResults.map((t) => (
                          <li key={t.url}>
                            <a href={t.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{(() => { try { return new URL(t.url).hostname.replace(/^www\./i, ""); } catch { return t.url; } })()}</a>
                            <span className="text-sub"> · {t.kind}</span>
                          </li>
                        ))}
                        {!k.topResults.length && <li className="text-sub">—</li>}
                      </ul>
                    </td>
                    <td className="py-2.5 pr-3">{k.ownPage ? <a href={k.ownPage} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">var (güçlendir)</a> : <span className="text-sub">yok (yeni sayfa)</span>}</td>
                    <td className="py-2.5 text-right">
                      <Link href={`/editor?write=1&kw=${encodeURIComponent(k.keyword)}&note=${encodeURIComponent(`${k.contentType}. ${k.why}`.slice(0, 700))}`} className="whitespace-nowrap text-xs font-medium text-accent hover:underline">Yaz →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {r.plan.length > 0 && (
            <div className="rounded-xl bg-accent/5 px-4 py-3">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-accent">İçerik planı (öncelik sırasıyla)</div>
              <ol className="list-decimal space-y-1 pl-5">{r.plan.map((p) => <li key={p}>{p}</li>)}</ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
