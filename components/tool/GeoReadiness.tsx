"use client";

import { useEffect, useState } from "react";
import { Drawer } from "@/components/ui";
import { LEVELS, levelName, type DomainReadiness, type ReadinessCheck } from "@/lib/agent-readiness-types";

/** GEO → "AI ajan hazırlığı": sitenin ve rakiplerin 0–5 seviyesi, seni bir üst seviyeye taşıyacak düzeltmeler. AI yok. */

const CARD = "rounded-2xl border border-border bg-panel shadow-[0_1px_2px_rgba(13,18,28,0.05)]";
const BTN1 = "inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-accent px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60";
const BTN2 = "inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-panel px-3 text-sm font-medium text-ink shadow-[inset_0_0_0_1px_#D5D7DA,0_1px_2px_rgba(13,18,28,0.05)] hover:bg-muted disabled:opacity-60";
const LV_CLS = ["bg-danger/10 text-danger", "bg-warn/10 text-warn", "bg-sky-50 text-sky-700", "bg-seo/10 text-seo", "bg-accent/10 text-accent", "bg-violet-50 text-violet-700"];
const OUT: Record<ReadinessCheck["outcome"], [string, string]> = {
  pass: ["✓", "bg-seo text-white"],
  fail: ["✕", "bg-danger text-white"],
  warn: ["!", "bg-warn text-white"],
  skip: ["–", "bg-muted text-sub"],
};

export default function GeoReadinessTab() {
  const [rows, setRows] = useState<DomainReadiness[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [at, setAt] = useState<string | null>(null);
  const [open, setOpen] = useState<DomainReadiness | null>(null);

  useEffect(() => {
    fetch("/api/geo/readiness")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.results) {
          setRows(d.results);
          setAt(d.cachedAt);
        }
      })
      .catch(() => {});
  }, []);

  async function run(refresh = false) {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/geo/readiness", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Kontrol yapılamadı");
      setRows(d.results);
      setAt(d.cachedAt);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Kontrol yapılamadı");
    } finally {
      setBusy(false);
    }
  }

  if (!rows)
    return (
      <div className={`${CARD} px-6 py-10 text-center`}>
        <div className="mx-auto max-w-lg">
          <div className="text-base font-semibold">Siten AI ajanlarına ne kadar hazır?</div>
          <p className="mt-1 text-sm text-sub">
            ChatGPT, Perplexity, Gemini gibi AI ajanlarının siteye girip girmediğini, sayfaları bulup okuyabildiğini ve işlem yapıp yapamadığını 0–5 arası bir seviyeyle ölçer; rakiplerinle karşılaştırır.
          </p>
          {err && <p className="mt-3 text-sm text-danger">{err}</p>}
          <button type="button" onClick={() => run(false)} disabled={busy} className={`${BTN1} mt-4`}>
            {busy ? "Siteler kontrol ediliyor (~30 sn)…" : "Hazırlığı ölç"}
          </button>
          <p className="mt-2 text-[11px] text-sub">AI kullanmaz, ücretsiz · proje sitesi + Proje Ayarları&apos;ndaki rakipler</p>
        </div>
      </div>
    );

  const own = rows.find((r) => r.own) ?? rows[0];
  const comps = rows.filter((r) => r !== own);
  const best = comps.reduce<DomainReadiness | null>((m, r) => (!m || r.level > m.level ? r : m), null);
  const ahead = comps.filter((c) => c.level > own.level).length;
  const blocking = own.checks.filter((c) => own.next?.blocking.includes(c.id));
  const sorted = [...rows].sort((a, b) => b.level - a.level || Number(b.own) - Number(a.own));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {([
          ["Senin seviyen", `${own.level}`, "/5", levelName(own.level), own.level >= 3 ? "text-seo" : own.level >= 2 ? "text-warn" : "text-danger"],
          ["En iyi rakip", best ? `${best.level}` : "—", best ? "/5" : "", best ? best.brand : "rakip tanımlı değil", ""],
          ["Senden önde", `${ahead}`, `/${comps.length}`, "rakip daha üst seviyede", ahead ? "text-danger" : "text-seo"],
          ["Üst seviyeye engel", `${blocking.length}`, "", own.next ? `${own.next.level}. seviye: ${levelName(own.next.level)}` : "en üst seviyedesin", blocking.length ? "text-warn" : "text-seo"],
        ] as const).map(([l, v, suf, hint, col]) => (
          <div key={l} className={`${CARD} px-4 py-4`}>
            <div className="text-xs font-medium text-sub">{l}</div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className={`text-[26px] font-semibold leading-8 tabular-nums ${col}`}>{v}</span>
              {suf && <span className="text-sm text-sub">{suf}</span>}
            </div>
            <div className="mt-1 h-4 truncate text-[11px] text-sub">{hint}</div>
          </div>
        ))}
      </div>

      {/* Merdiven */}
      <div className={`${CARD} p-5`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Hazırlık merdiveni</h3>
            <p className="text-xs text-sub">Bir basamağa çıkmak için o basamağın ve alttakilerin tüm zorunlu kontrolleri geçmeli.</p>
          </div>
          <div className="flex items-center gap-2">
            {at && <span className="text-[11px] text-sub">{new Date(at).toLocaleDateString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
            <button type="button" onClick={() => run(true)} disabled={busy} className={BTN2}>
              {busy ? "Ölçülüyor…" : "Yeniden ölç"}
            </button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-6 gap-2">
          {LEVELS.map((L) => {
            const here = rows.filter((r) => r.level === L.level);
            return (
              <div key={L.level} className={`rounded-xl border p-2.5 ${own.level === L.level ? "border-[#BDB4FF] bg-accent/[0.04]" : "border-border"}`}>
                <div className="flex items-center gap-1.5">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${LV_CLS[L.level]}`}>{L.level}</span>
                  <span className="truncate text-[12px] font-semibold">{L.name}</span>
                </div>
                <div className="mt-1 line-clamp-2 h-8 text-[10px] leading-4 text-sub">{L.question}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {here.map((r) => (
                    <button key={r.domain} type="button" onClick={() => setOpen(r)} className={`max-w-full truncate rounded-md px-1.5 py-0.5 text-[10px] font-medium ${r.own ? "bg-accent text-white" : "bg-muted text-ink/70 hover:bg-accent/10"}`} title={r.domain}>
                      {r.brand}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {blocking.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Ne yapmalı? · {levelName(own.next!.level)} seviyesine çıkmak için</h3>
          <div className={`grid gap-3 ${["", "md:grid-cols-1", "md:grid-cols-2", "md:grid-cols-3"][Math.min(blocking.length, 3)]}`}>
            {blocking.slice(0, 3).map((c) => (
              <div key={c.id} className={`${CARD} flex flex-col p-4`}>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-warn">{c.level}. seviye engeli</div>
                <h4 className="mt-1.5 text-sm font-semibold leading-5">{c.title}</h4>
                <p className="mt-1 text-[12px] text-sub">{c.detail}</p>
                <p className="mt-2 text-[13px]">{c.fix}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={`${CARD} overflow-hidden`}>
        <table className="w-full text-[13px]">
          <thead className="border-b border-border bg-[#fafafa] text-left text-xs text-sub">
            <tr>
              <th className="py-2 pl-5 font-medium">Site</th>
              <th className="py-2 pr-3 font-medium">Seviye</th>
              <th className="hidden py-2 pr-3 font-medium md:table-cell">Bir üst seviyeye engel</th>
              <th className="py-2 pr-5 text-right font-medium">Geçen kontrol</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((r) => {
              const counted = r.checks.filter((c) => c.outcome !== "skip");
              return (
                <tr key={r.domain} onClick={() => setOpen(r)} className={`cursor-pointer hover:bg-[#fafafa] ${r.own ? "bg-accent/[0.03]" : ""}`}>
                  <td className="py-3 pl-5 pr-3">
                    <div className="font-medium">
                      {r.brand}
                      {r.own && <span className="ml-1.5 rounded bg-accent/10 px-1 py-px text-[10px] font-medium text-accent">SEN</span>}
                    </div>
                    <div className="text-[11px] text-sub">{r.domain}</div>
                  </td>
                  <td className="py-3 pr-3">
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${LV_CLS[r.level]}`}>
                      {r.level} · {levelName(r.level)}
                    </span>
                  </td>
                  <td className="hidden max-w-[360px] py-3 pr-3 text-[12px] text-sub md:table-cell">
                    {r.error ? <span className="text-danger">{r.error}</span> : r.next ? r.checks.filter((c) => r.next!.blocking.includes(c.id)).map((c) => c.title).join(" · ") || "—" : "en üst seviye"}
                  </td>
                  <td className="py-3 pr-5 text-right tabular-nums">
                    {counted.filter((c) => c.outcome === "pass").length}/{counted.length}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-sub">Ana sayfa ve site geneli kontrol edilir; AI kullanmaz. 4–5. seviyeler (MCP, ajan kartı, ajan ticareti) yeni standartlar; çoğu site henüz bu seviyede değil — rakiplerinle kıyasla.</p>

      <Drawer isOpen={!!open} onClose={() => setOpen(null)} size="xl" eyebrow={open ? `${open.domain} · ${open.level}. seviye: ${levelName(open.level)}` : ""} title={open?.brand ?? ""}>
        {open && (
          <div className="space-y-5">
            {open.error && <p className="rounded-xl bg-danger/5 px-3 py-2 text-[13px] text-danger">{open.error}</p>}
            {[1, 2, 3, 4, 5].map((l) => {
              const cs = open.checks.filter((c) => c.level === l);
              if (!cs.length) return null;
              return (
                <div key={l}>
                  <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold">
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${LV_CLS[l]}`}>{l}</span>
                    {levelName(l)}
                  </div>
                  <div className="divide-y divide-border rounded-xl border border-border">
                    {cs.map((c) => (
                      <details key={c.id} className="group px-3 py-2">
                        <summary className="flex cursor-pointer list-none items-start gap-2.5 text-[13px]">
                          <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${OUT[c.outcome][1]}`}>{OUT[c.outcome][0]}</span>
                          <span className="min-w-0 flex-1">
                            <span className="font-medium">{c.title}</span>
                            {c.tier === "reported" && <span className="ml-1.5 text-[10px] text-sub">(isteğe bağlı)</span>}
                            <span className="block text-[11px] text-sub">{c.detail}</span>
                          </span>
                        </summary>
                        {c.outcome !== "pass" && (
                          <div className="ml-6 mt-1.5 space-y-1 text-[12px]">
                            <p className="text-sub">{c.why}</p>
                            <p className="rounded-lg bg-accent/5 px-2.5 py-1.5">{c.fix}</p>
                            {c.code && (
                              <div className="overflow-hidden rounded-lg border border-border">
                                <div className="flex items-center justify-between bg-muted/60 px-2.5 py-1 text-[11px] text-sub">
                                  <span>{c.code.file}</span>
                                  <button type="button" onClick={() => navigator.clipboard?.writeText(c.code!.text)} className="font-medium text-accent hover:underline">
                                    Kopyala
                                  </button>
                                </div>
                                <pre className="max-h-64 overflow-auto whitespace-pre-wrap px-2.5 py-2 font-mono text-[11px] leading-relaxed">{c.code.text}</pre>
                              </div>
                            )}
                          </div>
                        )}
                      </details>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Drawer>
    </div>
  );
}
