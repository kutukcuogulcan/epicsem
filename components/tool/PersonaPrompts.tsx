"use client";

import { useState } from "react";
import { generatePersonaPrompts, PERSONAS, type PersonaPrompt } from "@/lib/persona-prompts";

/**
 * Persona bazlı soru üretici — GEO testine "gerçek müşteri gözünden" sorular ekler.
 * Kalıplarla üretim ücretsiz (tarayıcıda), "✦ AI ile zenginleştir" 1 prompt önerisi kredisi.
 * Eklenen her soru "Persona: soru" biçiminde gelir; böylece sonuçlarda persona bazında kırılım çıkar.
 */
export default function PersonaPrompts({
  brand,
  competitors,
  onAdd,
}: {
  brand: string;
  competitors: string[];
  onAdd: (lines: string[]) => void;
}) {
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [selected, setSelected] = useState<string[]>(["first-time", "price", "trust"]);
  const [custom, setCustom] = useState("");
  const [list, setList] = useState<(PersonaPrompt & { on: boolean })[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const customList = custom.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 4);

  function generateFree() {
    setNote(null);
    if (!category.trim()) return setNote("Önce ürün/hizmet kategorisini yaz (ör. abiye elbise).");
    const out = generatePersonaPrompts({ category, brand, competitors, city: city || undefined, personaIds: selected, customPersonas: customList });
    setList(out.map((p) => ({ ...p, on: true })));
    if (!out.length) setNote("Bir persona seç.");
  }

  async function generateAi() {
    setNote(null);
    if (!category.trim()) return setNote("Önce ürün/hizmet kategorisini yaz (ör. abiye elbise).");
    setBusy(true);
    try {
      const r = await fetch("/api/geo/persona-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand, category, city: city || undefined, competitors, personaIds: selected, customPersonas: customList }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Üretilemedi");
      setList((d.prompts as PersonaPrompt[]).map((p) => ({ ...p, on: true })));
      setNote(d.ai ? "AI ile üretildi (1 kredi)." : "AI kullanılamadı, ücretsiz kalıplarla üretildi.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Üretilemedi");
    } finally {
      setBusy(false);
    }
  }

  const chosen = list.filter((x) => x.on);
  const input = "w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent";

  return (
    <div className="space-y-3 rounded-xl border border-accent/20 bg-accent/[0.03] p-3">
      <div>
        <div className="text-sm font-bold">Persona ile soru üret</div>
        <p className="text-[11px] text-ink/50">Müşterilerin AI&apos;a gerçekte nasıl sorduğunu taklit eder. Sonuçlarda persona bazında görünürlük çıkar.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ürün/hizmet (ör. abiye elbise)" className={input} />
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Şehir (opsiyonel)" className={input} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PERSONAS.map((p) => (
          <button
            key={p.id}
            type="button"
            title={p.description}
            onClick={() => toggle(p.id)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${selected.includes(p.id) ? "border-accent bg-accent text-white" : "border-border bg-panel text-ink/60 hover:border-accent/50"}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Kendi personan (opsiyonel, virgülle): düğününe 1 ay kalan gelin, butik sahibi" className={input} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={generateFree} className="rounded-lg bg-ink px-3 py-1.5 text-xs font-bold text-white hover:opacity-90">Soruları üret (ücretsiz)</button>
        <button type="button" onClick={generateAi} disabled={busy} className="rounded-lg border border-accent/40 px-3 py-1.5 text-xs font-bold text-accent hover:bg-accent/5 disabled:opacity-50">
          {busy ? "Üretiliyor…" : "✦ AI ile zenginleştir (1 kredi)"}
        </button>
        {note && <span className="text-[11px] text-ink/55">{note}</span>}
      </div>
      {list.length > 0 && (
        <div className="space-y-2">
          <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border bg-panel p-2">
            {list.map((p, i) => (
              <li key={i}>
                <label className="flex cursor-pointer items-start gap-2 text-xs">
                  <input type="checkbox" checked={p.on} onChange={() => setList((l) => l.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} className="mt-0.5 accent-[#5d16ff]" />
                  <span>
                    <span className="mr-1 rounded bg-muted px-1.5 py-px text-[10px] font-semibold text-ink/55">{p.persona}</span>
                    {p.text}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={!chosen.length}
            onClick={() => {
              onAdd(chosen.map((p) => `${p.persona}: ${p.text}`));
              setList([]);
              setNote(`${chosen.length} soru teste eklendi.`);
            }}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-40"
          >
            Seçilenleri teste ekle ({chosen.length})
          </button>
        </div>
      )}
    </div>
  );
}
