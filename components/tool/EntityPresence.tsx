"use client";

import { Fragment, useState } from "react";
import type { EntityResult } from "@/lib/entity-check";

/** Marka + rakipler için Wikipedia/Wikidata varlık kartı (GEO sayfası). */
export default function EntityPresence({ brand, competitors }: { brand: { name: string; domain: string }; competitors: { name: string; domain: string }[] }) {
  const [res, setRes] = useState<EntityResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/geo/entity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brands: [brand, ...competitors].filter((b) => b.name) }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Kontrol başarısız");
      setRes(d.results);
      setOpen(d.results[0]?.brand ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Kontrol başarısız");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold">AI bilgi grafı: Wikipedia ve Wikidata</h2>
          <p className="max-w-xl text-xs text-ink/55">AI motorları bir markayı tanırken en çok bu iki kaynağa dayanır. Markan ve rakiplerin orada var mı, ne kadar eksiksiz? Ücretsiz, AI kullanmaz.</p>
        </div>
        <button type="button" onClick={run} disabled={busy || !brand.name} className="rounded-xl bg-ink px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
          {busy ? "Kontrol ediliyor…" : res ? "Yeniden kontrol et" : "Kontrol et"}
        </button>
      </div>
      {err && <p className="text-xs text-danger">{err}</p>}
      {res && (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-xs font-semibold uppercase text-slate-500">
                <th className="px-4 py-2 font-semibold">Marka</th>
                <th className="py-2 pr-3 font-semibold">Wikidata</th>
                <th className="py-2 pr-3 font-semibold">Wikipedia</th>
                <th className="py-2 pr-4 text-right font-semibold">Varlık puanı</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {res.map((r, i) => (
                <Fragment key={r.brand}>
                  <tr onClick={() => setOpen(open === r.brand ? null : r.brand)} className="cursor-pointer hover:bg-muted/40">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">
                        {r.brand} {i === 0 && <span className="ml-1 rounded bg-accent/10 px-1.5 py-px text-[10px] font-bold text-accent">sen</span>}
                      </div>
                      <div className="text-[10px] text-ink/40">{r.domain}</div>
                    </td>
                    <td className="py-2.5 pr-3 text-xs">
                      {r.wikidata ? (
                        <a href={r.wikidata.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="font-semibold text-accent hover:underline">
                          {r.wikidata.id}
                        </a>
                      ) : (
                        <span className="text-danger">yok</span>
                      )}
                      {r.wikidata && !r.wikidata.websiteMatch && <span className="ml-1 text-[10px] text-warn">(site eşleşmedi)</span>}
                    </td>
                    <td className="py-2.5 pr-3 text-xs">
                      {r.wikipedia.length ? (
                        r.wikipedia.map((p) => (
                          <a key={p.lang} href={p.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="mr-2 font-semibold text-accent hover:underline">
                            {p.lang.toUpperCase()}
                            {!p.fromWikidata && <span className="text-warn">?</span>}
                          </a>
                        ))
                      ) : (
                        <span className="text-danger">yok</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-right">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${r.score >= 60 ? "bg-seo/10 text-seo" : r.score >= 30 ? "bg-warn/10 text-warn" : "bg-danger/10 text-danger"}`}>{r.score}</span>
                    </td>
                  </tr>
                  {open === r.brand && (
                    <tr>
                      <td colSpan={4} className="bg-muted/30 px-4 py-3 text-xs">
                        {r.wikidata && (
                          <p className="mb-2 text-ink/60">
                            <strong>{r.wikidata.label}</strong>
                            {r.wikidata.description ? ` — ${r.wikidata.description}` : ""} · {r.wikidata.claims} bilgi
                            {r.wikidata.facts.social.length ? ` · sosyal: ${r.wikidata.facts.social.join(", ")}` : ""}
                          </p>
                        )}
                        <ul className="list-disc space-y-1 pl-4 text-ink/70">
                          {r.tips.map((t) => (
                            <li key={t}>{t}</li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
