"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ToolPageHeader from "@/components/ToolPageHeader";

interface Result {
  host: string;
  ok: boolean;
  count: number;
  detail: string;
  via?: string;
}

/** URL İndeksleme — site haritasından ya da elle URL'leri IndexNow ile Bing, Yandex, Seznam ve Naver'a bildirir. */
export default function IndexingPage() {
  const [site, setSite] = useState("");
  const [ready, setReady] = useState<boolean | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<null | "sitemap" | "send">(null);
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);

  const urls = [...new Set(text.split(/\s+/).map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s)))];

  useEffect(() => {
    fetch("/api/assistant")
      .then((r) => (r.ok ? r.json() : { sites: [] }))
      .then((d) => d.sites?.[0] && setSite((v) => v || d.sites[0]))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!site.trim()) return setReady(null);
    const t = setTimeout(() => {
      fetch(`/api/indexnow?site=${encodeURIComponent(site.trim())}`)
        .then((r) => (r.ok ? r.json() : { ready: false }))
        .then((d) => setReady(!!d.ready))
        .catch(() => setReady(false));
    }, 400);
    return () => clearTimeout(t);
  }, [site]);

  async function fromSitemap() {
    setBusy("sitemap");
    setMsg(null);
    try {
      const r = await fetch(`/api/indexing/sitemap?url=${encodeURIComponent(site.trim())}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Site haritası okunamadı");
      setText(d.urls.join("\n"));
      setMsg({ t: `${d.urls.length} URL site haritasından alındı.` });
    } catch (e) {
      setMsg({ t: e instanceof Error ? e.message : "Site haritası okunamadı", bad: true });
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    setBusy("send");
    setMsg(null);
    setResults(null);
    try {
      const r = await fetch("/api/indexnow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ urls }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Gönderilemedi");
      setResults(d.results);
    } catch (e) {
      setMsg({ t: e instanceof Error ? e.message : "Gönderilemedi", bad: true });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <ToolPageHeader
        breadcrumbLabel="URL İndeksleme"
        title="URL İndeksleme"
        body="Yeni ya da güncellenen sayfalarını arama motorlarına anında bildir. IndexNow ile Bing, Yandex, Seznam ve Naver'a gider; Bing verisi ChatGPT aramasını da besler."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-3 rounded-2xl border border-border bg-panel p-5">
          <div className="flex flex-wrap items-center gap-2">
            <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="siten.com ya da site haritası adresi" className="min-w-0 flex-1 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm outline-none focus:border-accent" />
            <button type="button" onClick={fromSitemap} disabled={!site.trim() || !!busy} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50">
              {busy === "sitemap" ? "Okunuyor…" : "Site haritasından al"}
            </button>
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} placeholder={"Her satıra bir URL\nhttps://siten.com/yeni-sayfa\nhttps://siten.com/blog/guncel-yazi"} className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2 font-mono text-xs outline-none focus:border-accent" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-ink/50">{urls.length} geçerli URL</span>
            <button type="button" onClick={send} disabled={!urls.length || !!busy || ready === false} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
              {busy === "send" ? "Gönderiliyor…" : "Arama motorlarına bildir →"}
            </button>
          </div>
          {msg && <div className={`rounded-xl px-4 py-2.5 text-sm ${msg.bad ? "bg-danger/10 text-danger" : "bg-seo/10 text-seo"}`}>{msg.t}</div>}
          {results && (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {results.map((r) => (
                <li key={r.host} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className={`h-2 w-2 rounded-full ${r.ok ? "bg-seo" : "bg-danger"}`} />
                  <span className="font-medium">{r.host}</span>
                  <span className="text-xs text-ink/55">{r.ok ? `${r.count} URL bildirildi` : r.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-border bg-panel p-4">
            <div className="text-sm font-semibold">IndexNow durumu</div>
            {ready === null ? (
              <p className="mt-1 text-xs text-ink/50">Siteni yaz.</p>
            ) : ready ? (
              <p className="mt-1 text-xs text-seo">Hazır — bu site için anahtar kurulu.</p>
            ) : (
              <p className="mt-1 text-xs text-ink/60">
                Bu site için kurulu değil. <Link href="/integrations" className="font-semibold text-accent">Entegrasyonlar</Link>&apos;dan IndexNow ekle ya da WordPress&apos;te Epicsem Connector&apos;ı kur.
              </p>
            )}
          </div>
          <div className="rounded-2xl border border-border bg-panel p-4 text-xs leading-5 text-ink/60">
            <div className="mb-1 text-sm font-semibold text-ink">Google?</div>
            Google IndexNow&apos;u desteklemiyor. Google için Search Console&apos;da URL Denetimi → &quot;Dizine eklenmesini iste&quot; kullan ya da site haritanı Search Console&apos;a gönder.
          </div>
        </div>
      </div>
    </div>
  );
}
