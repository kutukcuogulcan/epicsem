"use client";

import { useEffect, useState } from "react";
import type { BulkImportRow } from "@/types";
import type { PageFixSuggestion } from "@/lib/page-fix-suggest";

interface Conn {
  id: number;
  platform: string;
  label: string;
  siteUrl: string;
}
interface Result {
  field: string;
  ok: boolean;
  detail: string;
}

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

function Field({ label, current, value, onChange, max, on, onToggle, multiline }: { label: string; current: string | null; value: string; onChange: (v: string) => void; max?: number; on: boolean; onToggle: (v: boolean) => void; multiline?: boolean }) {
  return (
    <div className={`rounded-xl border bg-panel p-3 ${on ? "border-accent/40" : "border-border"}`}>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-ink/45">
          <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} />
          {label}
        </label>
        <Copy text={value} />
      </div>
      {current && <div className="mt-1 text-xs text-ink/40 line-through decoration-ink/20">{current}</div>}
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className="mt-1 w-full resize-none rounded-lg border border-border px-2 py-1.5 text-sm outline-none focus:border-accent" />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-sm outline-none focus:border-accent" />
      )}
      {max && <div className={`mt-1 text-[10px] ${value.length > max ? "text-danger" : "text-ink/35"}`}>{value.length} / {max} karakter</div>}
    </div>
  );
}

/**
 * Sayfa ayrıntısında düzeltme paneli:
 *  1) "✦ Öneri yaz" (AI ile doldurur — ücretli tek çağrı) ya da "✎ Elle düzelt" (AI yok),
 *  2) alanlar düzenlenebilir, işaretlenenler seçilir,
 *  3) "WordPress'e uygula" — AI kullanmadan doğrudan siteye yazar.
 */
export default function AiFixSuggest({ row }: { row: BulkImportRow }) {
  const url = row.url;
  const [mode, setMode] = useState<"idle" | "open">("idle");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [source, setSource] = useState<"ai" | "kural" | "elle">("elle");
  const [s, setS] = useState<PageFixSuggestion | null>(null);

  const missingAlt = (row.metrics?.images ?? []).filter((i) => i.alt === null).map((i) => ({ src: i.src, alt: "" }));
  const [title, setTitle] = useState(row.title ?? "");
  const [meta, setMeta] = useState(row.metaDescription ?? "");
  const [h1, setH1] = useState(row.h1 ?? "");
  const [schema, setSchema] = useState("");
  const [alts, setAlts] = useState<{ src: string; alt: string }[]>(missingAlt);
  const needsOg = row.issues.includes("missing-og-image") || row.issues.includes("missing-open-graph");
  const host = url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
  const [ogTitle, setOgTitle] = useState(row.h1 || row.title || "");
  const [ogBrand, setOgBrand] = useState(host.split(".")[0].replace(/^./, (c) => c.toLocaleUpperCase("tr")));
  const [on, setOn] = useState({ title: false, meta: false, h1: false, schema: false, alts: false, og: needsOg });
  const [ogProvider, setOgProvider] = useState<"epicsem" | "ogimg">("epicsem");
  const [ogimgConnected, setOgimgConnected] = useState(false);
  useEffect(() => {
    fetch("/api/integrations")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { integrations?: { provider: string }[] } | null) => {
        if (d?.integrations?.some((i) => i.provider === "ogimg")) {
          setOgimgConnected(true);
          setOgProvider("ogimg");
        }
      })
      .catch(() => {});
  }, []);
  const ogQs = (t: string) => `title=${encodeURIComponent(t)}&brand=${encodeURIComponent(ogBrand)}&domain=${encodeURIComponent(host)}${ogProvider === "ogimg" ? "&provider=ogimg" : ""}`;

  // WordPress
  const [conns, setConns] = useState<Conn[] | null>(null);
  const [connId, setConnId] = useState<number | null>(null);
  const [plugin, setPlugin] = useState<boolean | null>(null);
  const [applying, setApplying] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [editUrl, setEditUrl] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "open" || conns) return;
    fetch("/api/cms/connections")
      .then((r) => (r.ok ? r.json() : { connections: [] }))
      .then((d) => {
        const host = url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
        const wp = (d.connections ?? []).filter((c: Conn) => c.platform === "wordpress");
        setConns(wp);
        const match = wp.find((c: Conn) => c.siteUrl.replace(/^https?:\/\/(www\.)?/, "").split("/")[0] === host) ?? wp[0];
        if (match) setConnId(match.id);
      })
      .catch(() => setConns([]));
  }, [mode, conns, url]);

  useEffect(() => {
    if (connId == null) return;
    setPlugin(null);
    fetch(`/api/import/apply?connectionId=${connId}`)
      .then((r) => r.json())
      .then((d) => setPlugin(!!d.pluginInstalled))
      .catch(() => setPlugin(false));
  }, [connId]);

  async function runAi(e: React.MouseEvent) {
    e.stopPropagation();
    setMode("open");
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/import/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, issues: row.issues }) });
      const d: PageFixSuggestion & { error?: string } = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Öneri üretilemedi");
      setS(d);
      setSource(d.source);
      if (d.title) setTitle(d.title);
      if (d.metaDescription) setMeta(d.metaDescription);
      if (d.h1) setH1(d.h1);
      if (d.schemaJsonLd) setSchema(d.schemaJsonLd);
      if (d.altTexts.length) setAlts(d.altTexts);
      setOn((o) => ({ ...o, title: !!d.title, meta: !!d.metaDescription, h1: !!d.h1, schema: !!d.schemaJsonLd, alts: d.altTexts.length > 0 }));
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Öneri üretilemedi");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (connId == null) return;
    setApplying(true);
    setResults(null);
    try {
      const r = await fetch("/api/import/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: connId,
          pageUrl: url,
          fixes: {
            seoTitle: on.title ? title : undefined,
            metaDescription: on.meta ? meta : undefined,
            h1: on.h1 ? h1 : undefined,
            schemaJsonLd: on.schema ? schema : undefined,
            altTexts: on.alts ? alts.filter((a) => a.alt.trim()) : [],
            ogImage: on.og && ogTitle.trim() ? { title: ogTitle, brand: ogBrand, domain: host, provider: ogProvider } : undefined,
          },
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Uygulanamadı");
      setResults(d.results);
      setEditUrl(d.editUrl);
      setPlugin(d.pluginInstalled);
    } catch (e2) {
      setResults([{ field: "Hata", ok: false, detail: e2 instanceof Error ? e2.message : "Uygulanamadı" }]);
    } finally {
      setApplying(false);
    }
  }

  if (mode === "idle") {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-accent/40 bg-accent/5 px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-[14rem] flex-1 text-sm">
          <div className="font-semibold">Bu sayfayı düzelt</div>
          <div className="text-xs text-ink/55">Title, meta açıklama, H1, görsel alt metinleri ve schema — AI'a yazdır ya da kendin yaz, sonra tek tıkla WordPress'e uygula.</div>
        </div>
        <button type="button" onClick={runAi} disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50">✦ Öneri yaz (AI)</button>
        <button type="button" onClick={() => setMode("open")} className="rounded-lg border border-border bg-panel px-4 py-2 text-xs font-bold text-ink/70 hover:border-ink/30">✎ Elle düzelt</button>
      </div>
    );
  }

  const selected = Object.values(on).some(Boolean);
  return (
    <div className="space-y-3 rounded-xl border border-accent/30 bg-accent/5 p-4" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-bold">Düzeltmeler</div>
        <div className="flex items-center gap-2">
          {busy && <span className="text-xs text-accent">AI yazıyor…</span>}
          <span className="rounded bg-panel px-2 py-0.5 text-[10px] font-semibold text-ink/50 ring-1 ring-border">{source === "ai" ? "AI ile yazıldı — kontrol edin" : source === "kural" ? "Kural tabanlı öneri" : "Elle düzenleme"}</span>
          {!s && !busy && (
            <button type="button" onClick={runAi} className="rounded-md bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent hover:bg-accent/20">✦ AI ile doldur</button>
          )}
        </div>
      </div>
      {err && <div className="text-xs text-danger">{err}</div>}

      <div className="grid gap-2 md:grid-cols-2">
        <Field label="SEO title" current={row.title} value={title} onChange={(v) => { setTitle(v); setOn((o) => ({ ...o, title: true })); }} max={60} on={on.title} onToggle={(v) => setOn((o) => ({ ...o, title: v }))} />
        <Field label="Meta açıklama" current={row.metaDescription} value={meta} onChange={(v) => { setMeta(v); setOn((o) => ({ ...o, meta: true })); }} max={160} on={on.meta} onToggle={(v) => setOn((o) => ({ ...o, meta: v }))} multiline />
        <Field label="H1 (sayfa başlığı)" current={row.h1} value={h1} onChange={(v) => { setH1(v); setOn((o) => ({ ...o, h1: true })); }} on={on.h1} onToggle={(v) => setOn((o) => ({ ...o, h1: v }))} />
      </div>

      {alts.length > 0 && (
        <div className={`rounded-xl border bg-panel p-3 ${on.alts ? "border-accent/40" : "border-border"}`}>
          <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-ink/45">
            <input type="checkbox" checked={on.alts} onChange={(e) => setOn((o) => ({ ...o, alts: e.target.checked }))} />
            Görsel alt metinleri ({alts.length})
          </label>
          <div className="mt-1.5 space-y-1.5">
            {alts.map((a, i) => (
              <div key={a.src + i} className="flex items-center gap-2 text-xs">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.src} alt="" className="h-8 w-8 shrink-0 rounded border border-border object-cover" />
                <span className="w-32 shrink-0 truncate text-ink/40" title={a.src}>{a.src.split("/").pop()}</span>
                <input
                  value={a.alt}
                  onChange={(e) => {
                    const v = e.target.value;
                    setAlts((xs) => xs.map((x, j) => (j === i ? { ...x, alt: v } : x)));
                    setOn((o) => ({ ...o, alts: true }));
                  }}
                  placeholder="Görselin ne gösterdiğini yazın"
                  className="flex-1 rounded-lg border border-border px-2 py-1 outline-none focus:border-accent"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={`rounded-xl border bg-panel p-3 ${on.og ? "border-accent/40" : "border-border"}`}>
        <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-ink/45">
          <input type="checkbox" checked={on.og} onChange={(e) => setOn((o) => ({ ...o, og: e.target.checked }))} />
          Paylaşım görseli (og:image){needsOg ? " — eksik" : ""}
        </label>
        <div className="mt-2 grid gap-3 md:grid-cols-[1fr_14rem]">
          <div className="space-y-2">
            <input value={ogTitle} onChange={(e) => { setOgTitle(e.target.value); setOn((o) => ({ ...o, og: true })); }} placeholder="Görseldeki başlık" className="w-full rounded-lg border border-border px-2 py-1.5 text-sm outline-none focus:border-accent" />
            <input value={ogBrand} onChange={(e) => setOgBrand(e.target.value)} placeholder="Marka adı" className="w-full rounded-lg border border-border px-2 py-1.5 text-sm outline-none focus:border-accent" />
            <div className="flex flex-wrap items-center gap-2">
              <select value={ogProvider} onChange={(e) => setOgProvider(e.target.value as "epicsem" | "ogimg")} className="rounded-lg border border-border bg-white px-2 py-1 text-xs">
                <option value="epicsem">Epicsem markalı (ücretsiz)</option>
                <option value="ogimg" disabled={!ogimgConnected}>ogimg şablonu{ogimgConnected ? "" : " — bağlı değil"}</option>
              </select>
              <a href={`/api/og?download=1&${ogQs(ogTitle)}`} className="text-xs font-semibold text-accent hover:underline">PNG indir</a>
              {!ogimgConnected && <a href="/integrations" className="text-[10px] text-ink/50 hover:underline">ogimg bağla</a>}
            </div>
            <p className="text-[10px] text-ink/45">1200×630. WordPress'e uygularken öne çıkan görsel yapılır; Epicsem Connector varsa og:image olarak da basılır.</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/og?${ogQs(ogTitle || "Başlık")}`} alt="Paylaşım görseli önizlemesi" className="aspect-[1200/630] w-full rounded-lg border border-border object-cover" />
        </div>
      </div>

      <div className={`rounded-xl border bg-panel p-3 ${on.schema ? "border-accent/40" : "border-border"}`}>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-ink/45">
            <input type="checkbox" checked={on.schema} onChange={(e) => setOn((o) => ({ ...o, schema: e.target.checked }))} />
            Schema (JSON-LD)
          </label>
          {schema && <Copy text={`<script type="application/ld+json">\n${schema}\n</script>`} />}
        </div>
        <textarea value={schema} onChange={(e) => { setSchema(e.target.value); setOn((o) => ({ ...o, schema: !!e.target.value.trim() })); }} rows={schema ? 6 : 2} placeholder='{"@context":"https://schema.org","@type":"Organization", …}' className="mt-1.5 w-full resize-y rounded-lg bg-ink px-3 py-2 font-mono text-[11px] text-white/90 outline-none" />
      </div>

      {s && (s.contentIdeas.length > 0 || s.notes.length > 0) && (
        <div className="rounded-xl border border-border bg-panel p-3 text-sm">
          {s.contentIdeas.length > 0 && (
            <>
              <div className="text-[11px] font-bold uppercase tracking-wide text-ink/40">Eklenecek içerik bölümleri</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-ink/75">{s.contentIdeas.map((c, i) => <li key={i}>{c}</li>)}</ul>
              <a href={`/editor?url=${encodeURIComponent(url)}`} className="mt-2 inline-block text-xs font-semibold text-accent hover:underline">İçeriği AI SEO Editör'de genişlet →</a>
            </>
          )}
          {s.notes.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-ink/55">{s.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
        </div>
      )}

      {/* ---- WordPress'e uygula ---- */}
      <div className="rounded-xl border border-ink/10 bg-panel p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold">WordPress'e uygula</span>
          <span className="text-[10px] text-ink/40">AI kullanmaz · ücretsiz</span>
        </div>
        {conns === null ? (
          <div className="mt-2 h-8 animate-pulse rounded bg-muted" />
        ) : conns.length === 0 ? (
          <p className="mt-1.5 text-xs text-ink/55">
            Önce <a href="/content" className="font-semibold text-accent">Content Studio › CMS bağlantıları</a>'ndan bu sitenin WordPress bağlantısını ekleyin (uygulama parolasıyla).
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <select value={connId ?? ""} onChange={(e) => setConnId(Number(e.target.value))} className="rounded-lg border border-border px-2 py-1.5 text-xs outline-none">
                {conns.map((c) => <option key={c.id} value={c.id}>{c.label} — {c.siteUrl}</option>)}
              </select>
              <button type="button" onClick={apply} disabled={applying || !selected} className="rounded-lg bg-ink px-4 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-40">
                {applying ? "Uygulanıyor…" : "Seçilenleri uygula"}
              </button>
              {editUrl && <a href={editUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-accent hover:underline">WordPress'te aç ↗</a>}
            </div>
            {plugin === false && (
              <div className="rounded-lg bg-warn/10 px-3 py-2 text-[11px] leading-relaxed text-ink/70">
                SEO title, meta açıklama ve schema için sitede <b>Epicsem Connector</b> eklentisi gerekir (H1 ve alt metinleri eklentisiz de uygulanır).{" "}
                <a href="/api/wp-plugin" className="font-bold text-accent hover:underline">Eklentiyi indir (.zip)</a> → WordPress › Eklentiler › Yeni ekle › Eklenti yükle → Etkinleştir. Yoast ve Rank Math ile uyumludur.
              </div>
            )}
            {plugin && <div className="text-[11px] font-semibold text-seo">✓ Epicsem Connector eklentisi kurulu</div>}
            {results && (
              <ul className="space-y-1">
                {results.map((r, i) => (
                  <li key={i} className={`flex items-start gap-2 text-xs ${r.ok ? "text-seo" : "text-danger"}`}>
                    <span className="font-bold">{r.ok ? "✓" : "✕"}</span>
                    <span><b>{r.field}:</b> <span className="text-ink/65">{r.detail}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
