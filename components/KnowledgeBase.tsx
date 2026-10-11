"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Marka bilgi bankası: ürünler, hizmetler, fiyat aralıkları, adres, avantajlar, ton…
 * Article Writer, Content Studio, AI SEO Editör ve "Öneri yaz" bu bilgiyi "doğru kabul
 * edilecek kaynak" olarak AI'a verir — AI'ın uydurmasını azaltır.
 */
export default function KnowledgeBase({ compact = false }: { compact?: boolean }) {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState("");
  const [state, setState] = useState<"loading" | "idle" | "saving" | "error">("loading");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/knowledge")
      .then((r) => (r.ok ? r.json() : { content: "" }))
      .then((d) => {
        setText(d.content ?? "");
        setSaved(d.content ?? "");
        setState("idle");
      })
      .catch(() => setState("idle"));
  }, []);

  async function save() {
    setState("saving");
    try {
      const r = await fetch("/api/knowledge", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: text }) });
      if (!r.ok) throw new Error();
      setSaved(text);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  async function onFile(f: File) {
    if (f.size > 500_000) return alert("Dosya çok büyük (en fazla 500 KB metin).");
    const t = await f.text();
    setText((prev) => (prev.trim() ? `${prev.trim()}\n\n--- ${f.name} ---\n${t}` : t).slice(0, 20000));
  }

  const dirty = text !== saved;
  return (
    <div className={compact ? "space-y-3" : "rounded-2xl border border-border bg-panel p-5 space-y-3"}>
      {!compact && (
        <div>
          <div className="text-sm font-bold">Marka bilgi bankası</div>
          <p className="mt-0.5 text-xs text-ink/50">AI yazarken bunları doğru kabul eder; burada ve sayfada olmayan bilgiyi uydurmaz. Article Writer, Content Studio, Editör ve "Öneri yaz" kullanır.</p>
        </div>
      )}
      {compact && <p className="text-[11px] leading-relaxed text-ink/50">AI düzenlemelerinde doğru kabul edilecek marka bilgileri. Ürün, hizmet, fiyat aralığı, adres, garanti, kargo, ton…</p>}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 20000))}
        rows={compact ? 10 : 7}
        placeholder={"ör.\n• Marka: Betüş Butik — kapalı ve açık kadın giyim\n• Kargo: 750 TL üzeri ücretsiz, 1-3 iş günü\n• İade: 14 gün koşulsuz\n• Ton: samimi, 'siz' diliyle"}
        className="w-full resize-y rounded-xl border border-border bg-panel px-3 py-2 text-sm outline-none focus:border-accent"
        disabled={state === "loading"}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={!dirty || state === "saving"} className="rounded-lg bg-accent px-4 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-40">
          {state === "saving" ? "Kaydediliyor…" : dirty ? "Kaydet" : "Kaydedildi ✓"}
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink/60 hover:border-ink/30">.txt / .md yükle</button>
        <input ref={fileRef} type="file" accept=".txt,.md,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <span className="ml-auto text-[10px] text-ink/40">{text.length.toLocaleString("tr-TR")} / 20.000</span>
        {state === "error" && <span className="text-xs text-danger">Kaydedilemedi</span>}
      </div>
    </div>
  );
}
