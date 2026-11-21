"use client";

/**
 * GEO → "Etki": yazı ya da off-page işinin AI görünürlüğüne etkisi (Peec "Impact" karşılığı).
 * Hedef soru + projenin kendi bağlamından üretilen bağlantılı sorular → başlangıç ölçümü →
 * iş tamamlanınca 3 gün arayla yeniden ölçüm → önce/sonra karşılaştırması.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Drawer, BTN1, BTN2, CARD } from "@/components/ui";
import { ENGINE_META } from "@/components/tool/MonitorBits";
import { INTENT_LABEL } from "@/lib/impact-labels";
import type { ImpactSummary, RelatedPrompt } from "@/lib/impact";
import type { ImpactTrack } from "@/lib/db";

type Track = ImpactTrack & { summary: ImpactSummary };

const pct = (x: number | null) => (x == null ? "—" : `%${Math.round(x * 100)}`);
const VERDICT: Record<ImpactSummary["verdict"], { label: string; cls: string }> = {
  waiting: { label: "Ölçüm bekleniyor", cls: "bg-muted text-sub" },
  early: { label: "İlk sonuç", cls: "bg-sky-50 text-sky-700" },
  up: { label: "İşe yaradı", cls: "bg-seo/10 text-seo-ink" },
  flat: { label: "Değişim yok", cls: "bg-warn/10 text-warn-ink" },
  down: { label: "Düştü", cls: "bg-danger/10 text-danger-ink" },
};
const nextAuto = (t: Track) => {
  if (!t.doneAt) return null;
  const last = t.checks.length ? t.checks[t.checks.length - 1].at : t.doneAt;
  return new Date(new Date(last).getTime() + 3 * 86400_000);
};

export default function ImpactTab() {
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [engines, setEngines] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [form, setForm] = useState<null | { kind: "article" | "offpage"; title: string; target: string; keyword: string; ref: string; done: boolean }>(null);

  const load = useCallback(() => {
    fetch("/api/impact")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Yüklenemedi");
        setTracks(d.tracks);
        setEngines(d.engines ?? []);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Yüklenemedi"));
  }, []);
  useEffect(() => {
    load();
    // Başka sayfalardan hazır açılış: /geo?tab=impact&target=…&title=…&kind=article&ref=…&done=1
    const qs = new URLSearchParams(window.location.search);
    if (qs.get("target")) {
      setForm({
        kind: qs.get("kind") === "offpage" ? "offpage" : "article",
        title: (qs.get("title") ?? "").slice(0, 200),
        target: (qs.get("target") ?? "").slice(0, 200),
        keyword: (qs.get("kw") ?? "").slice(0, 120),
        ref: (qs.get("ref") ?? "").slice(0, 300),
        done: qs.get("done") === "1",
      });
    }
  }, [load]);

  async function act(id: number, action: "done" | "measure") {
    setBusyId(id);
    setErr(null);
    try {
      const r = await fetch("/api/impact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "İşlem başarısız");
      setTracks((ts) => (ts ?? []).map((t) => (t.id === id ? d.track : t)));
      if (action === "measure") window.dispatchEvent(new Event("epicsem:usage-changed"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "İşlem başarısız");
    } finally {
      setBusyId(null);
    }
  }
  async function remove(id: number) {
    if (!confirm("Bu takip silinsin mi?")) return;
    await fetch(`/api/impact?id=${id}`, { method: "DELETE" });
    setTracks((ts) => (ts ?? []).filter((t) => t.id !== id));
  }

  const list = tracks ?? [];
  const measured = list.filter((t) => t.summary.verdict !== "waiting");
  const worked = list.filter((t) => t.summary.verdict === "up").length;
  const deltas = measured.map((t) => (t.summary.after ?? 0) - (t.summary.before ?? 0));
  const avg = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 md:p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">Yaptığın iş AI görünürlüğünü değiştirdi mi?</h2>
            <p className="text-xs text-sub">
              Bir yazı ya da off-page işi için hedef soruyu ve onunla bağlantılı soruları seç. Önce şimdiki durum ölçülür; işi tamamlayınca 3 gün arayla yeniden ölçülür ve önce/sonra karşılaştırılır.
            </p>
          </div>
          <button type="button" disabled={!engines.length} onClick={() => setForm({ kind: "article", title: "", target: "", keyword: "", ref: "", done: false })} className={BTN1}>
            + Yeni etki ölçümü
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          {([
            ["Takip edilen iş", String(list.length), "yazı ve off-page işleri"],
            ["Sonucu çıkan", String(measured.length), "işten sonra en az 1 ölçüm"],
            ["İşe yarayan", String(worked), "anılma oranı en az 10 puan arttı"],
            ["Ortalama değişim", avg == null ? "—" : `${avg >= 0 ? "+" : ""}${Math.round(avg * 100)} puan`, "anılma oranında, önce → sonra"],
          ] as const).map(([l, v, h]) => (
            <div key={l} className="min-w-0 rounded-xl border border-border px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-sub">{l}</div>
              <div className={`mt-1 text-[24px] font-semibold tabular-nums ${l === "Ortalama değişim" && avg != null ? (avg > 0 ? "text-seo-ink" : avg < 0 ? "text-danger-ink" : "") : ""}`}>{v}</div>
              <div className="truncate text-[11px] text-sub">{h}</div>
            </div>
          ))}
        </div>
        {!engines.length && tracks && <p className="mt-3 text-xs text-danger-ink">Ölçüm için en az bir AI motorunun anahtarı gerekli. <Link href="/integrations" className="font-medium underline">Entegrasyonlar&apos;dan ekle</Link></p>}
        {err && <p className="mt-3 text-xs text-danger-ink">{err}</p>}
      </div>

      {tracks === null ? (
        <div className={`${CARD} px-6 py-10 text-center text-sm text-sub`}>Yükleniyor…</div>
      ) : list.length === 0 ? (
        <div className={`${CARD} px-6 py-10 text-center`}>
          <div className="text-base font-semibold">Henüz takip edilen iş yok</div>
          <p className="mx-auto mt-1 max-w-md text-sm text-sub">Yazdığın ya da yazacağın bir içerik için &quot;Yeni etki ölçümü&quot;ne bas. Ya da editörde yazıyı yayınladıktan sonra &quot;Etkisini ölç&quot;ü kullan.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((t) => {
            const s = t.summary;
            const v = VERDICT[s.verdict];
            const na = nextAuto(t);
            const isOpen = open === t.id;
            return (
              <div key={t.id} className={CARD}>
                <div className="flex flex-wrap items-start gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-sub">{t.kind === "article" ? "Yazı" : "Off-page"}</span>
                      <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${v.cls}`}>{v.label}</span>
                    </div>
                    <div className="mt-1 text-[14px] font-semibold">{t.title}</div>
                    <div className="text-xs text-sub">
                      Hedef: &ldquo;{t.targetPrompt}&rdquo; · {t.prompts.length} soru × {t.engines.length} motor
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-[11px] text-sub">Önce</div>
                      <div className="text-[20px] font-semibold tabular-nums">{pct(s.before)}</div>
                    </div>
                    <div className="text-sub">→</div>
                    <div className="text-center">
                      <div className="text-[11px] text-sub">Sonra{s.afterChecks > 1 ? ` (${s.afterChecks} ölçüm ort.)` : ""}</div>
                      <div className={`text-[20px] font-semibold tabular-nums ${s.after != null && s.before != null ? (s.after > s.before ? "text-seo-ink" : s.after < s.before ? "text-danger-ink" : "") : ""}`}>{pct(s.after)}</div>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5 text-xs">
                  {!t.doneAt ? (
                    <>
                      <span className="text-sub">İş henüz tamamlanmadı. Yayınlayınca ya da tamamlayınca işaretle; ölçüm sayacı o gün başlar.</span>
                      <button type="button" onClick={() => act(t.id, "done")} disabled={busyId === t.id} className="ml-auto inline-flex h-7 items-center rounded-lg bg-accent px-2.5 font-medium text-white disabled:opacity-50">
                        {t.kind === "article" ? "Yayınladım" : "Tamamlandı"}
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-sub">
                        {new Date(t.doneAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} tarihinde tamamlandı · {s.afterChecks} sonraki ölçüm
                        {s.afterChecks < 3 && na ? ` · sıradaki otomatik ölçüm ${na > new Date() ? na.toLocaleDateString("tr-TR", { day: "numeric", month: "short" }) : "hazır"}` : ""}
                        {s.verdict === "early" ? " · tek ölçüm; kesin sonuç için bir ölçüm daha bekle" : ""}
                      </span>
                      <button type="button" onClick={() => act(t.id, "measure")} disabled={busyId === t.id || !engines.length} className="ml-auto inline-flex h-7 items-center rounded-lg px-2.5 font-medium shadow-[inset_0_0_0_1px_#D5D7DA] hover:bg-muted disabled:opacity-50" title={`${t.prompts.length * t.engines.length} AI sorgusu`}>
                        {busyId === t.id ? "Ölçülüyor…" : "Şimdi ölç"}
                      </button>
                    </>
                  )}
                  <button type="button" onClick={() => setOpen(isOpen ? null : t.id)} className="inline-flex h-7 items-center rounded-lg px-2.5 font-medium shadow-[inset_0_0_0_1px_#D5D7DA] hover:bg-muted">
                    {isOpen ? "Gizle" : "Soru bazında"}
                  </button>
                  <button type="button" onClick={() => remove(t.id)} className="inline-flex h-7 items-center rounded-lg px-2 text-danger-ink hover:bg-danger/10" title="Sil">
                    ✕
                  </button>
                </div>
                {isOpen && (
                  <div className="overflow-x-auto border-t border-border">
                    <table className="w-full min-w-[560px] text-[13px]">
                      <thead className="bg-[#fafafa] text-left text-xs text-sub">
                        <tr>
                          <th className="py-2 pl-4 font-medium">Soru</th>
                          <th className="py-2 pr-3 font-medium">Motorlar (önce → sonra)</th>
                          <th className="py-2 pr-4 text-right font-medium">Önce → Sonra</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {s.perPrompt.map((p) => (
                          <tr key={p.prompt} className="align-top">
                            <td className="max-w-[320px] py-2 pl-4 pr-3">
                              <div>{p.prompt}</div>
                              <span className="text-[11px] text-sub">{INTENT_LABEL[p.intent] ?? p.intent}</span>
                            </td>
                            <td className="py-2 pr-3">
                              <div className="flex flex-wrap gap-1">
                                {p.engines.map((e) => (
                                  <span key={e.engine} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px]">
                                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: ENGINE_META[e.engine]?.color ?? "#999" }} />
                                    {ENGINE_META[e.engine]?.name ?? e.engine}
                                    <b className={e.before ? "text-seo-ink" : "text-sub"}>{e.before == null ? "–" : e.before ? "✓" : "✕"}</b>→
                                    <b className={e.after == null ? "text-sub" : e.after >= 0.5 ? "text-seo-ink" : "text-danger-ink"}>{e.after == null ? "?" : e.after >= 0.5 ? "✓" : "✕"}</b>
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="py-2 pr-4 text-right tabular-nums">
                              {pct(p.before)} → <b>{pct(p.after)}</b>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="px-4 py-2 text-[11px] text-sub">✓ = marka cevapta anıldı. AI cevapları günden güne değişir; karar için birden fazla ölçümün ortalamasına bak.</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {form && <NewTrack init={form} engines={engines} onClose={() => setForm(null)} onCreated={(t) => { setTracks((ts) => [t, ...(ts ?? [])]); setForm(null); setOpen(t.id); window.dispatchEvent(new Event("epicsem:usage-changed")); }} />}
    </div>
  );
}

function NewTrack({
  init,
  engines,
  onClose,
  onCreated,
}: {
  init: { kind: "article" | "offpage"; title: string; target: string; keyword: string; ref: string; done: boolean };
  engines: string[];
  onClose: () => void;
  onCreated: (t: Track) => void;
}) {
  const [f, setF] = useState(init);
  const [prompts, setPrompts] = useState<(RelatedPrompt & { on: boolean })[] | null>(null);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState<"suggest" | "create" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function suggest() {
    if (f.target.trim().length < 5) return setErr("Hedef soruyu yaz.");
    setBusy("suggest");
    setErr(null);
    try {
      const r = await fetch("/api/impact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "suggest", target: f.target, keyword: f.keyword || undefined }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Sorular üretilemedi");
      setPrompts(d.prompts.map((p: RelatedPrompt) => ({ ...p, on: true })));
      window.dispatchEvent(new Event("epicsem:usage-changed"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sorular üretilemedi");
    } finally {
      setBusy(null);
    }
  }
  const chosen = (prompts ?? []).filter((p) => p.on);
  async function create() {
    if (!f.title.trim()) return setErr("Bir başlık yaz (ör. yazının başlığı).");
    setBusy("create");
    setErr(null);
    try {
      const r = await fetch("/api/impact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", kind: f.kind, title: f.title, ref: f.ref || undefined, target: f.target, prompts: chosen.map(({ text, intent, source }) => ({ text, intent, source })), done: f.done }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Ölçüm başlatılamadı");
      onCreated(d.track);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ölçüm başlatılamadı");
    } finally {
      setBusy(null);
    }
  }
  const input = "h-9 w-full rounded-[10px] border border-border bg-panel px-3 text-sm outline-none focus:border-[#BDB4FF]";

  return (
    <Drawer isOpen onClose={onClose} eyebrow="Etki ölçümü" title="Yeni etki ölçümü" subtitle="Hedef soru + projenin kendi konusundan üretilen bağlantılı sorular" size="lg">
      <div className="space-y-4 text-sm">
        <div className="flex gap-2">
          {(["article", "offpage"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setF({ ...f, kind: k })} className={`h-8 rounded-[9px] px-3 text-[13px] font-medium ${f.kind === k ? "bg-accent/5 shadow-[inset_0_0_0_1px_#BDB4FF]" : "text-sub shadow-[inset_0_0_0_1px_#E4E5E8]"}`}>
              {k === "article" ? "Yazı" : "Off-page işi"}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="text-xs font-medium text-sub">{f.kind === "article" ? "Yazının başlığı" : "Yapılan iş"}</span>
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={f.kind === "article" ? "ör. Diş implantı fiyatları 2026" : "ör. Karşılaştırma sitesinde listelendik"} className={`${input} mt-1`} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-sub">Hedef soru (insanların AI&apos;a sorduğu)</span>
          <input value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} placeholder="ör. İstanbul'da iyi bir implant kliniği hangisi?" className={`${input} mt-1`} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-sub">Anahtar kelime (opsiyonel)</span>
          <input value={f.keyword} onChange={(e) => setF({ ...f, keyword: e.target.value })} className={`${input} mt-1`} />
        </label>
        <button type="button" onClick={suggest} disabled={busy !== null} className={BTN2} title="1 AI sorgusu">
          {busy === "suggest" ? "Üretiliyor…" : prompts ? "Yeniden üret" : "Bağlantılı soruları üret"}
        </button>

        {prompts && (
          <div className="space-y-2">
            <div className="text-xs text-sub">Ölçülecek sorular (işaretli olanlar). Projenin açıklaması, ürünleri ve prompt kütüphanesinden üretildi.</div>
            <div className="divide-y divide-border rounded-xl border border-border">
              {prompts.map((p, i) => (
                <label key={p.text + i} className="flex items-start gap-2.5 px-3 py-2">
                  <input type="checkbox" checked={p.on} disabled={p.source === "target"} onChange={(e) => setPrompts(prompts.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} className="mt-1" />
                  <span className="min-w-0 flex-1">
                    {p.text}
                    <span className={`ml-1.5 rounded px-1 text-[11px] font-medium ${p.source === "target" ? "bg-accent/10 text-accent" : p.source === "library" ? "bg-seo/10 text-seo-ink" : "bg-muted text-sub"}`}>
                      {p.source === "library" ? "kütüphaneden" : INTENT_LABEL[p.intent] ?? p.intent}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Kendi sorunu ekle…" className={input} />
              <button
                type="button"
                onClick={() => {
                  if (custom.trim().length < 5) return;
                  setPrompts([...prompts, { text: custom.trim(), intent: "info", source: "generated", on: true }]);
                  setCustom("");
                }}
                className={BTN2}
              >
                Ekle
              </button>
            </div>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={f.done} onChange={(e) => setF({ ...f, done: e.target.checked })} />
              {f.kind === "article" ? "Yazı zaten yayında" : "İş zaten tamamlandı"} (ölçüm sayacı bugünden başlasın)
            </label>
            {f.done && <p className="text-xs text-warn-ink">Yazı zaten yayındaysa bugünkü ölçüm &quot;önce&quot; sayılır; gerçek &quot;önce&quot; durumu bilinemez. En doğru sonuç için takibi yayından önce başlat.</p>}
            <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
              <span className="text-xs text-sub">
                {chosen.length} soru × {engines.length} motor = <b>{chosen.length * engines.length}</b> AI sorgusu (başlangıç ölçümü)
              </span>
              <button type="button" onClick={create} disabled={busy !== null || !chosen.length || !engines.length} className={BTN1}>
                {busy === "create" ? "Ölçülüyor (~1 dk)…" : "Ölç ve takibe al"}
              </button>
            </div>
          </div>
        )}
        {err && <p className="text-xs text-danger-ink">{err}</p>}
      </div>
    </Drawer>
  );
}
