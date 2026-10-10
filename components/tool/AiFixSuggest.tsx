"use client";

import { useState } from "react";
import type { PageFixSuggestion } from "@/lib/page-fix-suggest";

function Copy({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(text).then(() => {
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        });
      }}
      className="shrink-0 rounded-md border border-border bg-panel px-2 py-0.5 text-[10px] font-semibold text-ink/60 hover:border-accent hover:text-accent"
    >
      {ok ? "Kopyalandı" : "Kopyala"}
    </button>
  );
}

function Field({ label, current, next, max }: { label: string; current: string | null; next: string; max?: number }) {
  return (
    <div className="rounded-xl border border-border bg-panel p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-ink/40">{label}</span>
        <Copy text={next} />
      </div>
      {current && <div className="mt-1 text-xs text-ink/40 line-through decoration-ink/20">{current}</div>}
      <div className="mt-1 text-sm font-medium text-ink/85">{next}</div>
      {max && <div className={`mt-1 text-[10px] ${next.length > max ? "text-danger" : "text-ink/35"}`}>{next.length} / {max} karakter</div>}
    </div>
  );
}

/** Sayfa ayrıntısında: "Bu sayfa için düzeltme önerisi yaz" → yeni title/meta/H1/alt/schema/içerik fikirleri. */
export default function AiFixSuggest({ url, issues }: { url: string; issues: string[] }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [s, setS] = useState<PageFixSuggestion | null>(null);

  async function run(e: React.MouseEvent) {
    e.stopPropagation();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/import/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, issues }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Öneri üretilemedi");
      setS(d);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Öneri üretilemedi");
    } finally {
      setBusy(false);
    }
  }

  if (!s) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-accent/40 bg-accent/5 px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex-1 text-sm">
          <div className="font-semibold">Bu sayfa için düzeltme önerisi</div>
          <div className="text-xs text-ink/55">Sayfanın gerçek içeriğinden yeni title, meta açıklama, H1, görsel alt metinleri ve schema yazılır — kopyalayıp yapıştırırsın.</div>
        </div>
        <button type="button" onClick={run} disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? "Yazılıyor…" : "✦ Öneri yaz"}
        </button>
        {err && <div className="w-full text-xs text-danger">{err}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-accent/30 bg-accent/5 p-4" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold">Düzeltme önerileri</div>
        <span className="rounded bg-panel px-2 py-0.5 text-[10px] font-semibold text-ink/50 ring-1 ring-border">{s.source === "ai" ? "AI ile yazıldı — yayınlamadan önce kontrol edin" : "Kural tabanlı"}</span>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {s.title && <Field label="Title" current={s.current.title} next={s.title} max={60} />}
        {s.metaDescription && <Field label="Meta açıklama" current={s.current.metaDescription} next={s.metaDescription} max={160} />}
        {s.h1 && <Field label="H1" current={s.current.h1} next={s.h1} />}
      </div>
      {s.altTexts.length > 0 && (
        <div className="rounded-xl border border-border bg-panel p-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-ink/40">Görsel alt metinleri</div>
          <div className="mt-1.5 space-y-1.5">
            {s.altTexts.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-40 shrink-0 truncate text-ink/40" title={a.src}>{a.src.split("/").pop()}</span>
                <span className="flex-1 font-medium text-ink/80">{a.alt}</span>
                <Copy text={`alt="${a.alt}"`} />
              </div>
            ))}
          </div>
        </div>
      )}
      {s.contentIdeas.length > 0 && (
        <div className="rounded-xl border border-border bg-panel p-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-ink/40">Eklenecek içerik bölümleri</div>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-sm text-ink/75">
            {s.contentIdeas.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      )}
      {s.schemaJsonLd && (
        <div className="rounded-xl border border-border bg-panel p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink/40">Schema (JSON-LD)</span>
            <Copy text={`<script type="application/ld+json">\n${s.schemaJsonLd}\n</script>`} />
          </div>
          <pre className="mt-1.5 max-h-48 overflow-auto rounded-lg bg-ink px-3 py-2 text-[11px] text-white/90">{s.schemaJsonLd}</pre>
        </div>
      )}
      {s.notes.length > 0 && <ul className="list-disc space-y-0.5 pl-4 text-xs text-ink/55">{s.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
    </div>
  );
}
