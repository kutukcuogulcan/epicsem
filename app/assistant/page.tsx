"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Block } from "@/lib/seo-assistant";

interface Msg {
  role: "user" | "bot";
  text?: string;
  blocks?: Block[];
}

/** **kalın** ve _italik_ — basit satır içi biçimlendirme. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") ? <strong key={i} className="font-semibold text-ink">{p.slice(2, -2)}</strong> : p.startsWith("_") && p.endsWith("_") ? <em key={i} className="text-ink/45">{p.slice(1, -1)}</em> : <span key={i}>{p}</span>
      )}
    </>
  );
}

function BotBlocks({ blocks, onAsk }: { blocks: Block[]; onAsk: (q: string) => void }) {
  return (
    <div className="space-y-2.5">
      {blocks.map((b, i) => {
        if (b.type === "text") return <p key={i} className="text-sm leading-6 text-ink/80"><Rich text={b.text} /></p>;
        if (b.type === "list") {
          const L = b.ordered ? "ol" : "ul";
          return (
            <L key={i} className={`space-y-1 pl-5 text-sm leading-6 text-ink/80 ${b.ordered ? "list-decimal" : "list-disc"}`}>
              {b.items.map((it, j) => <li key={j}><Rich text={it} /></li>)}
            </L>
          );
        }
        if (b.type === "metrics")
          return (
            <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {b.items.map((x, j) => (
                <div key={j} className="rounded-xl border border-border bg-paper px-3 py-2">
                  <div className="text-[10px] text-ink/45">{x.label}</div>
                  <div className={`text-base font-extrabold tabular-nums ${x.tone === "good" ? "text-seo" : x.tone === "bad" ? "text-danger" : x.tone === "warn" ? "text-warn" : ""}`}>{x.value}</div>
                </div>
              ))}
            </div>
          );
        if (b.type === "actions")
          return (
            <div key={i} className="flex flex-wrap gap-2 pt-1">
              {b.items.map((a, j) => (
                <Link key={j} href={a.href} className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/10">{a.label} →</Link>
              ))}
            </div>
          );
        return (
          <div key={i} className="flex flex-wrap gap-2">
            {b.items.map((q, j) => (
              <button key={j} type="button" onClick={() => onAsk(q)} className="rounded-full border border-border bg-panel px-3 py-1.5 text-xs font-semibold text-ink/65 hover:border-accent hover:text-accent">{q}</button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export default function AssistantPage() {
  const [sites, setSites] = useState<string[] | null>(null);
  const [site, setSite] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/assistant")
      .then((r) => (r.ok ? r.json() : { sites: [], suggestions: [] }))
      .then((d) => {
        setSites(d.sites ?? []);
        setSuggestions(d.suggestions ?? []);
        const q = new URLSearchParams(window.location.search).get("site");
        setSite(q || d.sites?.[0] || "");
      })
      .catch(() => setSites([]));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);

  async function ask(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    setMsgs((m) => [...m, { role: "user", text }]);
    setInput("");
    setBusy(true);
    try {
      const r = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, site }) });
      const d = await r.json();
      setMsgs((m) => [...m, { role: "bot", blocks: r.ok ? d.blocks : [{ type: "text", text: d.error ?? "Bir sorun oluştu." }] }]);
    } catch {
      setMsgs((m) => [...m, { role: "bot", blocks: [{ type: "text", text: "Bağlantı hatası, tekrar dene." }] }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-9rem)] max-w-3xl flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">SEO Asistanı</h1>
          <p className="text-sm text-ink/50">Sitenin taramalarına ve AI görünürlük testlerine bakarak cevap verir. Ücretsiz — AI kredisi harcamaz.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-panel px-3 py-1.5">
          <span className="text-xs font-bold text-ink/40">Site</span>
          {sites && sites.length > 0 ? (
            <select value={site} onChange={(e) => { setSite(e.target.value); setMsgs([]); }} className="bg-transparent text-sm font-semibold outline-none">
              {sites.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (
            <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="siteniz.com" className="w-40 bg-transparent text-sm outline-none" />
          )}
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto rounded-2xl border border-border bg-panel p-5">
        {msgs.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-2xl text-accent">✦</div>
            <div>
              <div className="font-bold">{site ? `${site} hakkında ne bilmek istersin?` : "Bir site seç ya da yaz"}</div>
              <p className="mt-1 text-sm text-ink/50">Öncelikler, AI görünürlüğü, içerik fikirleri, değişimler, belirli sorunlar…</p>
            </div>
            <div className="flex max-w-xl flex-wrap justify-center gap-2">
              {suggestions.map((q) => (
                <button key={q} type="button" onClick={() => ask(q)} disabled={!site} className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-ink/65 hover:border-accent hover:text-accent disabled:opacity-40">{q}</button>
              ))}
            </div>
            {sites && sites.length === 0 && (
              <p className="text-xs text-ink/45">
                Henüz verin yok — önce <Link href="/import" className="font-semibold text-accent">Site Taraması</Link> ya da <Link href="/geo" className="font-semibold text-accent">GEO testi</Link> çalıştır.
              </p>
            )}
          </div>
        )}
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm text-white">{m.text}</div>
            </div>
          ) : (
            <div key={i} className="flex gap-3">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-sm text-accent">✦</div>
              <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md bg-muted/50 px-4 py-3">
                <BotBlocks blocks={m.blocks ?? []} onAsk={ask} />
              </div>
            </div>
          )
        )}
        {busy && (
          <div className="flex gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-sm text-accent">✦</div>
            <div className="flex items-center gap-1 rounded-2xl bg-muted/50 px-4 py-3">
              {[0, 1, 2].map((k) => <span key={k} className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink/30" style={{ animationDelay: `${k * 120}ms` }} />)}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="mt-3 flex gap-2 rounded-2xl border border-border bg-panel p-2 shadow-sm focus-within:border-accent/50"
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={site ? `${site} hakkında sor… (ör. "alt metni eksik sayfalar")` : "Önce bir site seç"} className="flex-1 bg-transparent px-3 py-2 text-sm outline-none" />
        <button disabled={busy || !input.trim() || !site} className="rounded-xl bg-accent px-5 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40">Sor</button>
      </form>
    </div>
  );
}
