"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Card, CardHeader, EmptyBlock, ErrorBlock, PageHeader, PageSkeleton } from "@/components/ui";
import { useProject } from "@/components/ProjectProvider";

type Tone = "professional" | "friendly" | "expert" | "simple";
interface Settings {
  description?: string;
  language?: string;
  country?: string;
  audience?: string;
  tone?: Tone;
  address?: "siz" | "sen";
  voiceNotes?: string;
  avoid?: string;
  products?: string;
  usps?: string;
  cta?: string;
  knowledge?: string;
}
interface Comp {
  name: string;
  domain: string;
}

const SECTIONS = [
  { id: "genel", label: "Genel" },
  { id: "ses", label: "Marka sesi" },
  { id: "kitle", label: "Hedef kitle" },
  { id: "urun", label: "Ürünler ve avantajlar" },
  { id: "rakip", label: "Rakipler" },
  { id: "bilgi", label: "Bilgi bankası" },
];

const TONES: { v: Tone; t: string; d: string }[] = [
  { v: "professional", t: "Profesyonel", d: "Net, güven veren" },
  { v: "friendly", t: "Samimi", d: "Sıcak, sohbet havasında" },
  { v: "expert", t: "Uzman", d: "Teknik ama anlaşılır" },
  { v: "simple", t: "Sade", d: "Kısa cümleler, yeni başlayanlar" },
];

const input = "mt-1.5 w-full rounded-[10px] border border-border bg-panel px-3 py-2 text-sm outline-none shadow-[0_1px_2px_rgba(13,18,28,0.05)] focus:border-[#BDB4FF] focus:ring-4 focus:ring-accent/10";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">{label}</span>
      {hint && <span className="ml-1.5 text-xs text-sub">{hint}</span>}
      {children}
    </label>
  );
}

/** Proje ayarları — Arvow'daki "Website & Brand" karşılığı. Burada girilen her şey AI yazma/öneri isteklerine eklenir. */
export default function ProjectSettingsPage() {
  const { project, ready, refresh } = useProject();
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [comps, setComps] = useState<Comp[]>([]);
  const [s, setS] = useState<Settings>({});
  const [initial, setInitial] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "save" | "fill">(null);
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const snapshot = (n: string, d: string, c: Comp[], st: Settings) => JSON.stringify({ n, d, c, st });

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await fetch("/api/project/settings");
      if (r.status === 401) return void (window.location.href = "/login?next=/project");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Ayarlar alınamadı");
      const p = d.project;
      if (p) {
        const st: Settings = { language: "tr", tone: "professional", address: "siz", ...p.settings };
        setName(p.name);
        setDomain(p.domain);
        setComps(p.competitors ?? []);
        setS(st);
        setInitial(snapshot(p.name, p.domain, p.competitors ?? [], st));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ayarlar alınamadı");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (ready) load();
  }, [ready, project?.id, load]);

  const dirty = loaded && initial !== snapshot(name, domain, comps, s);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((x) => ({ ...x, [k]: v }));

  async function save() {
    setBusy("save");
    setErr(null);
    try {
      const r = await fetch("/api/project/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), domain: domain.trim(), competitors: comps.filter((c) => c.name.trim() && c.domain.trim()), settings: s }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Kaydedilemedi");
      setInitial(snapshot(name, domain, comps, s));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Kaydedilemedi");
    } finally {
      setBusy(null);
    }
  }

  async function autofill() {
    setBusy("fill");
    setErr(null);
    setNote(null);
    try {
      const r = await fetch("/api/project/autofill", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Öneri alınamadı");
      const g = d.suggestion as Settings;
      // Sadece boş alanları doldur, kullanıcının yazdıklarını ezme.
      setS((x) => {
        const n = { ...x };
        (["description", "audience", "products", "usps", "cta"] as const).forEach((k) => {
          if (!n[k]?.trim() && g[k]) n[k] = g[k];
        });
        return n;
      });
      setNote(d.demo ? "Demo modunda sadece sitenin meta açıklaması alındı." : "Boş alanlar siteden dolduruldu. Kontrol edip kaydet.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Öneri alınamadı");
    } finally {
      setBusy(null);
    }
  }

  if (!ready || !loaded) return <PageSkeleton cards={3} />;
  if (!project)
    return (
      <div className="space-y-6">
        <PageHeader title="Proje ayarları" description="Marka bilgilerin tüm yazma ve öneri araçlarında kullanılır." />
        <Card>
          <EmptyBlock title="Henüz proje yok" description="Sol alttaki proje seçiciden bir proje oluştur, sonra ayarlarını burada doldur." />
        </Card>
      </div>
    );

  const filled = [s.description, s.audience, s.products, s.usps, s.voiceNotes, s.knowledge].filter((x) => x?.trim()).length;

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        title="Proje ayarları"
        description="Marka sesi, hedef kitle ve ürün bilgileri. Editör, Autoblog, içerik önerileri ve AI asistan bu bilgilerle yazar."
        badge={`${filled}/6 dolu`}
        actions={
          <button
            type="button"
            onClick={autofill}
            disabled={!!busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-panel px-3 text-sm font-medium text-ink shadow-[inset_0_0_0_1px_#D5D7DA,0_1px_2px_rgba(13,18,28,0.05)] hover:bg-muted disabled:opacity-50"
            title="Ana sayfanı okuyup boş alanlar için öneri çıkarır (küçük bir AI çağrısı, içerik kotası harcamaz)"
          >
            {busy === "fill" ? "Site okunuyor…" : "Siteden doldur"}
            <span className="rounded-md bg-muted px-1.5 text-[10px] text-sub">AI</span>
          </button>
        }
      />

      <ErrorBlock message={err} />
      {note && <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-2.5 text-sm text-ink/80">{note}</div>}

      <div className="grid gap-6 lg:grid-cols-[180px_1fr]">
        <nav className="hidden lg:block">
          <div className="sticky top-6 space-y-0.5">
            {SECTIONS.map((x) => (
              <a key={x.id} href={`#${x.id}`} className="block rounded-lg px-3 py-1.5 text-sm text-sub hover:bg-muted hover:text-ink">
                {x.label}
              </a>
            ))}
          </div>
        </nav>

        <div className="space-y-6">
          <Card>
            <div id="genel" className="scroll-mt-6" />
            <CardHeader title="Genel" subtitle="Projenin adı, sitesi ve hedef pazarı." />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Marka adı">
                <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
              </Field>
              <Field label="Web sitesi">
                <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="ornek.com" className={input} />
              </Field>
              <Field label="İçerik dili">
                <select value={s.language ?? "tr"} onChange={(e) => set("language", e.target.value)} className={input}>
                  <option value="tr">Türkçe</option>
                  <option value="en">English</option>
                  <option value="de">Deutsch</option>
                </select>
              </Field>
              <Field label="Ülke / pazar">
                <input value={s.country ?? ""} onChange={(e) => set("country", e.target.value)} placeholder="Türkiye" className={input} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Marka açıklaması" hint="Ne yapıyorsunuz? 1-3 cümle">
                  <textarea rows={3} value={s.description ?? ""} onChange={(e) => set("description", e.target.value)} className={input} />
                </Field>
              </div>
            </div>
          </Card>

          <Card>
            <div id="ses" className="scroll-mt-6" />
            <CardHeader title="Marka sesi" subtitle="Yazıların nasıl konuşacağını belirler." />
            <div className="mt-5 space-y-4">
              <div>
                <span className="block text-sm font-medium">Ton</span>
                <div className="mt-1.5 grid gap-2 sm:grid-cols-4">
                  {TONES.map((t) => (
                    <button
                      key={t.v}
                      type="button"
                      onClick={() => set("tone", t.v)}
                      className={`rounded-xl border px-3 py-2.5 text-left transition ${s.tone === t.v ? "border-[#BDB4FF] bg-accent/5 ring-1 ring-[#BDB4FF]" : "border-border hover:bg-muted/50"}`}
                    >
                      <div className="text-sm font-medium">{t.t}</div>
                      <div className="text-xs text-sub">{t.d}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="block text-sm font-medium">Okura hitap</span>
                <div className="mt-1.5 inline-flex rounded-[10px] border border-border p-0.5">
                  {(["siz", "sen"] as const).map((a) => (
                    <button key={a} type="button" onClick={() => set("address", a)} className={`h-7 rounded-lg px-3 text-sm font-medium ${s.address === a ? "bg-ink text-white" : "text-sub hover:text-ink"}`}>
                      {a === "siz" ? "Siz" : "Sen"}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Ses notları" hint="ör. kısa paragraflar, espri yok, teknik terimleri açıkla">
                <textarea rows={3} value={s.voiceNotes ?? ""} onChange={(e) => set("voiceNotes", e.target.value)} className={input} />
              </Field>
              <Field label="Kaçınılacaklar" hint="kullanılmaması gereken kelimeler, iddialar, rakip adları">
                <textarea rows={2} value={s.avoid ?? ""} onChange={(e) => set("avoid", e.target.value)} className={input} />
              </Field>
            </div>
          </Card>

          <Card>
            <div id="kitle" className="scroll-mt-6" />
            <CardHeader title="Hedef kitle" subtitle="Kime yazıyoruz? Sorunları, seviyeleri, aradıkları." />
            <div className="mt-5">
              <textarea rows={4} value={s.audience ?? ""} onChange={(e) => set("audience", e.target.value)} placeholder="ör. İstanbul'da ilk evini dekore eden 25-40 yaş arası çiftler; bütçe bilinçli, pratik çözüm arıyorlar." className={input} />
            </div>
          </Card>

          <Card>
            <div id="urun" className="scroll-mt-6" />
            <CardHeader title="Ürünler ve avantajlar" subtitle="Yazılar uygun yerde bunlardan bahseder; uydurma özellik eklemez." />
            <div className="mt-5 space-y-4">
              <Field label="Ürün / hizmetler" hint="her satıra bir tane">
                <textarea rows={4} value={s.products ?? ""} onChange={(e) => set("products", e.target.value)} className={input} />
              </Field>
              <Field label="Öne çıkan avantajlar" hint="sizi rakiplerden ayıran şeyler">
                <textarea rows={3} value={s.usps ?? ""} onChange={(e) => set("usps", e.target.value)} className={input} />
              </Field>
              <Field label="Çağrı (CTA)" hint="yazı sonunda okura ne yapmasını öneriyoruz">
                <input value={s.cta ?? ""} onChange={(e) => set("cta", e.target.value)} placeholder="ör. Ücretsiz keşif için bize yazın" className={input} />
              </Field>
            </div>
          </Card>

          <Card>
            <div id="rakip" className="scroll-mt-6" />
            <CardHeader
              title="Rakipler"
              subtitle="GEO testi, Rakip Açığı ve marka monitörleri bu listeyi kullanır."
              action={
                comps.length < 8 && (
                  <button type="button" onClick={() => setComps((c) => [...c, { name: "", domain: "" }])} className="inline-flex h-8 items-center rounded-[10px] px-3 text-sm font-medium text-accent hover:bg-accent/5">
                    + Rakip ekle
                  </button>
                )
              }
            />
            <div className="mt-4 space-y-2">
              {comps.length === 0 && <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-sub">Henüz rakip yok.</p>}
              {comps.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`https://www.google.com/s2/favicons?domain=${c.domain || "example.com"}&sz=32`} alt="" className="h-4 w-4 shrink-0 rounded" />
                  <input value={c.name} onChange={(e) => setComps((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} placeholder="Ad" className={`${input} mt-0`} />
                  <input value={c.domain} onChange={(e) => setComps((x) => x.map((y, j) => (j === i ? { ...y, domain: e.target.value } : y)))} placeholder="rakip.com" className={`${input} mt-0`} />
                  <button type="button" onClick={() => setComps((x) => x.filter((_, j) => j !== i))} className="shrink-0 rounded-lg px-2 py-1 text-sub hover:bg-muted hover:text-danger" aria-label="Kaldır">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div id="bilgi" className="scroll-mt-6" />
            <CardHeader
              title="Bilgi bankası"
              subtitle="Fiyatlar, politikalar, SSS, kurucu hikâyesi — AI sadece burada yazanı gerçek kabul eder."
              action={
                <Link href="/knowledge" className="text-sm font-medium text-accent hover:underline">
                  Tam ekran →
                </Link>
              }
            />
            <div className="mt-4">
              <textarea rows={8} value={s.knowledge ?? ""} onChange={(e) => set("knowledge", e.target.value)} className={`${input} font-mono text-[13px]`} />
              <div className="mt-1 text-right text-xs text-sub">{(s.knowledge ?? "").length.toLocaleString("tr")} / 20.000</div>
            </div>
          </Card>
        </div>
      </div>

      <div className={`fixed bottom-4 left-1/2 z-30 -translate-x-1/2 transition ${dirty || saved ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"}`}>
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-panel px-4 py-2.5 shadow-lg">
          <span className="text-sm text-sub">{saved ? "Kaydedildi ✓" : "Kaydedilmemiş değişiklikler var"}</span>
          {dirty && (
            <>
              <button type="button" onClick={load} disabled={!!busy} className="h-8 rounded-[10px] px-3 text-sm font-medium text-sub hover:bg-muted">
                Vazgeç
              </button>
              <button type="button" onClick={save} disabled={!!busy || !name.trim() || !domain.trim()} className="h-8 rounded-[10px] bg-accent px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                {busy === "save" ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
