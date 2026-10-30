"use client";

import { useState } from "react";
import { useAgencyName } from "@/lib/use-agency-name";

const DEFAULTS = [
  { name: "Başlangıç", price: "", items: "Kritik teknik SEO hatalarının düzeltilmesi\nAI arama botlarına erişim ve robots.txt düzenlemesi\nAna sayfa ve hizmet sayfalarına schema\nAylık sağlık taraması ve rapor" },
  { name: "Büyüme", price: "", items: "Başlangıç paketindeki her şey\nAyda 4 GEO uyumlu içerik\nChatGPT, Gemini, Perplexity görünürlük takibi\nRakip karşılaştırması ve fırsat raporu\nIndexNow ile anında indeksleme" },
  { name: "Kurumsal", price: "", items: "Büyüme paketindeki her şey\nAyda 8+ içerik ve mevcut içeriklerin yenilenmesi\nWikipedia/Wikidata ve bilgi grafı çalışması\nSıralama takibi ve haftalık rapor\nAylık strateji toplantısı" },
];

/** Site Taraması sonucundan müşteriye gönderilecek teklif PDF'i (AI yok). */
export default function ProposalButton({ runId, domain }: { runId: number | null; domain: string }) {
  const [open, setOpen] = useState(false);
  const [agency, setAgency] = useAgencyName();
  const [client, setClient] = useState(domain.split(".")[0].replace(/^./, (c) => c.toLocaleUpperCase("tr")));
  const [contact, setContact] = useState("");
  const [days, setDays] = useState(30);
  const [note, setNote] = useState("");
  const [pk, setPk] = useState(DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function download() {
    if (runId == null) return setErr("Bu tarama kaydedilmemiş; teklif için kayıtlı bir tarama seç.");
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          agencyName: agency || "Epicsem",
          clientName: client,
          contact,
          note,
          validDays: days,
          packages: pk.map((p) => ({ name: p.name, price: p.price, items: p.items.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 10) })),
        }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "PDF oluşturulamadı");
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${client || "teklif"}-geo-seo-teklif.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "PDF oluşturulamadı");
    } finally {
      setBusy(false);
    }
  }

  const inp = "w-full rounded-xl border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-accent";
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-xl border border-border bg-panel px-3 py-1.5 text-xs font-bold text-ink/70 hover:border-accent/40 hover:text-accent">
        Teklif PDF
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button type="button" aria-label="Kapat" onClick={() => setOpen(false)} className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" />
          <div className="relative flex h-full w-full max-w-lg flex-col border-l border-border bg-panel shadow-2xl animate-[pop-in_0.25s_ease-out]">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Müşteri teklifi</div>
                <div className="font-bold">{domain}</div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full text-ink/50 hover:bg-muted">
                ✕
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <p className="text-xs leading-5 text-ink/55">Bu taramanın bulgularıyla (sağlık skoru, öncelikli sorunlar, AI erişimi) müşteriye gönderilecek hazır bir teklif PDF&apos;i oluşturur. Fiyat yazmazsan &quot;Görüşmede belirlenir&quot; yazar.</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Ajans adı</span>
                  <input value={agency} onChange={(e) => setAgency(e.target.value)} placeholder="Ajansın" className={inp} />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Müşteri</span>
                  <input value={client} onChange={(e) => setClient(e.target.value)} className={inp} />
                </label>
                <label className="col-span-2 space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-ink/45">İletişim (PDF sonunda)</span>
                  <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Ad Soyad · telefon · e-posta" className={inp} />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Geçerlilik (gün)</span>
                  <input type="number" min={1} max={180} value={days} onChange={(e) => setDays(Math.max(1, Math.min(180, Number(e.target.value) || 30)))} className={inp} />
                </label>
              </div>
              {pk.map((p, i) => (
                <div key={i} className="space-y-2 rounded-xl border border-border p-3">
                  <div className="grid grid-cols-[1fr_9rem] gap-2">
                    <input value={p.name} onChange={(e) => setPk((a) => a.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder={`Paket ${i + 1} (boş bırakırsan çıkmaz)`} className={`${inp} font-semibold`} />
                    <input value={p.price} onChange={(e) => setPk((a) => a.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} placeholder="₺ / ay" className={inp} />
                  </div>
                  <textarea value={p.items} onChange={(e) => setPk((a) => a.map((x, j) => (j === i ? { ...x, items: e.target.value } : x)))} rows={4} className={`${inp} text-xs`} />
                </div>
              ))}
              <label className="block space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Not (isteğe bağlı)</span>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Ödeme koşulları, sözleşme süresi…" className={inp} />
              </label>
              {err && <p className="rounded-lg bg-danger/5 px-3 py-2 text-xs text-danger">{err}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2 text-sm font-semibold text-ink/60 hover:bg-muted">
                Vazgeç
              </button>
              <button type="button" onClick={download} disabled={busy || !client.trim()} className="rounded-xl bg-accent px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
                {busy ? "Hazırlanıyor…" : "PDF indir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
