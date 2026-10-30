"use client";

import { useEffect, useState } from "react";
import { useProject } from "@/components/ProjectProvider";

/**
 * AI SEO Editör — "Konudan yaz" sihirbazı (Arvow tarzı):
 * 1) Anahtar kelime → 2) Konu önerileri (seç ya da kendin yaz) → 3) Düzenlenebilir plan (H2/H3 + SSS)
 * → 4) Ayarlar (uzunluk, ton, öğeler) → yazı yazılır ve editörde açılır.
 * Konu ve plan adımları içerik kotası harcamaz; sadece son adım 1 kota.
 */

interface Topic {
  title: string;
  angle: string;
  intent: string;
  format: "article" | "listicle";
}
interface Section {
  h2: string;
  h3: string[];
  note: string;
}

const STEPS = ["Anahtar kelime", "Konu", "Plan", "Ayarlar"];
const INTENT_TONE: Record<string, string> = {
  bilgi: "bg-sky-50 text-sky-700",
  karşılaştırma: "bg-amber-50 text-amber-700",
  "satın alma": "bg-emerald-50 text-emerald-700",
  "nasıl yapılır": "bg-violet-50 text-violet-700",
  liste: "bg-rose-50 text-rose-700",
};

export default function WriteWizard({ onDone }: { onDone: (id: number) => void }) {
  const { project } = useProject();
  useEffect(() => {
    if (project) setSite(project.domain);
  }, [project?.domain]);

  const [step, setStep] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [site, setSite] = useState("");
  const [lang, setLang] = useState("tr");
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [format, setFormat] = useState<"article" | "listicle">("article");
  const [outline, setOutline] = useState<Section[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [length, setLength] = useState<"short" | "medium" | "long">("medium");
  const [tone, setTone] = useState("professional");
  const [opts, setOpts] = useState({ takeaways: true, faq: true, table: true, internalLinks: true, cta: false });
  const [busy, setBusy] = useState<null | "topics" | "outline" | "write">(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (busy !== "write") return;
    const t = setInterval(() => setTick((x) => x + 1), 6000);
    return () => clearInterval(t);
  }, [busy]);

  const title = custom.trim() || (pick !== null && topics ? topics[pick].title : "");

  async function post(body: object, url = "/api/editor/plan") {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.status === 401) {
      window.location.href = "/login?next=/editor";
      throw new Error("Giriş gerekli");
    }
    const d = await r.json();
    if (!r.ok) throw new Error(d.error ?? "İşlem başarısız");
    return d;
  }

  async function loadTopics() {
    if (keyword.trim().length < 2) return;
    setBusy("topics");
    setErr(null);
    try {
      const d = await post({ step: "topics", keyword, site, language: lang });
      setTopics(d.topics);
      setPick(0);
      setCustom("");
      setFormat(d.topics[0]?.format ?? "article");
      setStep(1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Konu önerileri alınamadı");
    } finally {
      setBusy(null);
    }
  }

  async function loadOutline() {
    if (!title) return;
    setBusy("outline");
    setErr(null);
    try {
      const d = await post({ step: "outline", keyword, title, site, language: lang, format });
      setOutline(d.outline);
      setQuestions(d.questions ?? []);
      setStep(2);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Plan alınamadı");
    } finally {
      setBusy(null);
    }
  }

  async function write() {
    setBusy("write");
    setTick(0);
    setErr(null);
    try {
      const d = await post(
        { topic: keyword, keyword, title, site, language: lang, format, outline, faqQuestions: questions, length, tone, ...opts },
        "/api/editor/write"
      );
      onDone(d.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Yazı yazılamadı");
      setBusy(null);
    }
  }

  const upd = (i: number, patch: Partial<Section>) => setOutline((o) => o.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: -1 | 1) =>
    setOutline((o) => {
      const j = i + d;
      if (j < 0 || j >= o.length) return o;
      const c = [...o];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });

  const words = { short: "~800 kelime", medium: "~1.400 kelime", long: "~2.000 kelime" };
  const progress = ["Plan okunuyor…", "Giriş ve kısa cevap yazılıyor…", "Bölümler yazılıyor…", "SSS ve özet ekleniyor…", "Son kontroller…"];

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-panel shadow-sm">
      {/* Adımlar */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-4 py-3">
        {STEPS.map((s, i) => {
          const done = i < step;
          const can = i < step && !busy;
          return (
            <div key={s} className="flex items-center gap-1">
              <button
                type="button"
                disabled={!can}
                onClick={() => setStep(i)}
                className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold ${i === step ? "bg-accent/10 text-accent" : done ? "text-ink/70 hover:bg-muted" : "text-ink/35"}`}
              >
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${i === step ? "bg-accent text-white" : done ? "bg-seo text-white" : "bg-muted text-ink/45"}`}>{done ? "✓" : i + 1}</span>
                {s}
              </button>
              {i < STEPS.length - 1 && <span className="h-px w-5 bg-border" />}
            </div>
          );
        })}
        <span className="ml-auto whitespace-nowrap pl-3 text-[11px] text-ink/40">Konu ve plan ücretsiz · yazı 1 kota</span>
      </div>

      <div className="p-5">
        {/* 1 — Anahtar kelime */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-bold">Hangi anahtar kelime için yazalım?</div>
              <p className="mt-0.5 text-xs text-ink/50">Anahtar kelimeyi yaz; bu kelimeyle aranabilecek farklı açılardan konu başlıkları önerelim.</p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                loadTopics();
              }}
              className="flex items-center gap-2 rounded-2xl border border-border bg-muted/40 p-2 pl-4"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-ink/35" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <circle cx="9" cy="9" r="5.5" />
                <path d="M13 13l3.5 3.5" />
              </svg>
              <input autoFocus value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="ör. abiye elbise" className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" />
              <button disabled={!!busy || keyword.trim().length < 2} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
                {busy === "topics" ? "Konular hazırlanıyor…" : "Konu öner →"}
              </button>
            </form>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-[11px] font-semibold text-ink/50">Marka sitesi</span>
                <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="markan.com" className="mt-1 w-full rounded-xl border border-border bg-panel px-3 py-2 text-sm outline-none focus:border-accent" />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-ink/50">Dil</span>
                <select value={lang} onChange={(e) => setLang(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-panel px-3 py-2 text-sm outline-none">
                  <option value="tr">Türkçe</option>
                  <option value="en">English</option>
                  <option value="de">Deutsch</option>
                </select>
              </label>
            </div>
            <button
              type="button"
              disabled={keyword.trim().length < 2}
              onClick={() => {
                setTopics([]);
                setPick(null);
                setStep(1);
              }}
              className="text-xs font-semibold text-accent hover:underline disabled:opacity-40"
            >
              Başlığı kendim yazacağım →
            </button>
          </div>
        )}

        {/* 2 — Konu */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <div className="text-sm font-bold">Bir konu seç</div>
                <p className="mt-0.5 text-xs text-ink/50">
                  &quot;{keyword}&quot; için önerilen başlıklar. Birini seç ya da kendi başlığını yaz.
                </p>
              </div>
              <button type="button" onClick={loadTopics} disabled={!!busy} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50">
                {busy === "topics" ? "Yükleniyor…" : "↻ Yeni öneriler"}
              </button>
            </div>
            {!!topics?.length && (
              <div className="grid gap-3 md:grid-cols-2">
                {topics.map((t, i) => {
                  const on = pick === i && !custom.trim();
                  return (
                    <button
                      key={t.title}
                      type="button"
                      onClick={() => {
                        setPick(i);
                        setCustom("");
                        setFormat(t.format);
                      }}
                      className={`rounded-xl border p-4 text-left transition ${on ? "border-accent bg-accent/5 ring-1 ring-accent" : "border-border hover:border-accent/40"}`}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on ? "border-accent bg-accent" : "border-ink/25"}`}>{on && <span className="h-1.5 w-1.5 rounded-full bg-white" />}</span>
                        <div className="min-w-0">
                          <div className="text-sm font-bold leading-5">{t.title}</div>
                          {t.angle && <div className="mt-1 text-xs leading-5 text-ink/55">{t.angle}</div>}
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${INTENT_TONE[t.intent] ?? "bg-muted text-ink/60"}`}>{t.intent}</span>
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-ink/60">{t.format === "listicle" ? "Liste yazısı" : "Makale"}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            <label className="block">
              <span className="text-[11px] font-semibold text-ink/50">Ya da kendi başlığın</span>
              <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={`ör. ${keyword} seçerken dikkat edilmesi gerekenler`} className="mt-1 w-full rounded-xl border border-border bg-panel px-3 py-2 text-sm outline-none focus:border-accent" />
            </label>
            <div className="flex items-center justify-between border-t border-border pt-4">
              <button type="button" onClick={() => setStep(0)} className="text-sm font-semibold text-ink/55 hover:text-ink">
                ← Geri
              </button>
              <button type="button" onClick={loadOutline} disabled={!!busy || !title} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
                {busy === "outline" ? "Plan çıkarılıyor…" : "Plan çıkar →"}
              </button>
            </div>
          </div>
        )}

        {/* 3 — Plan */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <div className="text-sm font-bold">İçerik planı</div>
                <p className="mt-0.5 text-xs text-ink/50">Başlıkları düzenle, sırala, sil ya da ekle. Yazı tam bu plana göre yazılır.</p>
              </div>
              <button type="button" onClick={loadOutline} disabled={!!busy} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50">
                {busy === "outline" ? "Yükleniyor…" : "↻ Planı yenile"}
              </button>
            </div>
            <div className="rounded-xl bg-muted/50 px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-wide text-ink/40">H1 · Başlık</div>
              <input value={title} onChange={(e) => setCustom(e.target.value)} className="mt-0.5 w-full bg-transparent text-base font-semibold outline-none" />
            </div>
            <ol className="space-y-2">
              {outline.map((s, i) => (
                <li key={i} className="group rounded-xl border border-border p-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-bold text-accent">H2</span>
                    <input value={s.h2} onChange={(e) => upd(i, { h2: e.target.value })} className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none" />
                    <div className="flex shrink-0 gap-0.5 opacity-60 group-hover:opacity-100">
                      <button type="button" onClick={() => move(i, -1)} className="rounded px-1.5 text-xs hover:bg-muted" title="Yukarı">↑</button>
                      <button type="button" onClick={() => move(i, 1)} className="rounded px-1.5 text-xs hover:bg-muted" title="Aşağı">↓</button>
                      <button type="button" onClick={() => setOutline((o) => o.filter((_, j) => j !== i))} className="rounded px-1.5 text-xs text-danger hover:bg-danger/10" title="Sil">✕</button>
                    </div>
                  </div>
                  {s.h3.map((h, k) => (
                    <div key={k} className="ml-7 mt-1.5 flex items-center gap-2">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-ink/50">H3</span>
                      <input value={h} onChange={(e) => upd(i, { h3: s.h3.map((x, m) => (m === k ? e.target.value : x)) })} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
                      <button type="button" onClick={() => upd(i, { h3: s.h3.filter((_, m) => m !== k) })} className="rounded px-1.5 text-xs text-ink/40 hover:text-danger">✕</button>
                    </div>
                  ))}
                  <div className="ml-7 mt-1.5 flex items-center gap-3">
                    {s.note && <span className="min-w-0 flex-1 truncate text-[11px] text-ink/45">{s.note}</span>}
                    <button type="button" onClick={() => upd(i, { h3: [...s.h3, ""] })} className="ml-auto shrink-0 text-[11px] font-semibold text-accent hover:underline">
                      + alt başlık
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            <button type="button" onClick={() => setOutline((o) => [...o, { h2: "", h3: [], note: "" }])} className="w-full rounded-xl border border-dashed border-border py-2 text-xs font-semibold text-ink/50 hover:border-accent/40 hover:text-accent">
              + Bölüm ekle
            </button>

            <div className="rounded-xl border border-border p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm font-bold">Sık sorulan sorular</span>
                <span className="text-[11px] text-ink/45">AI cevaplarında en çok alıntılanan bölüm</span>
              </div>
              {questions.map((q, i) => (
                <div key={i} className="mt-1 flex items-center gap-2">
                  <span className="text-xs text-ink/35">?</span>
                  <input value={q} onChange={(e) => setQuestions((a) => a.map((x, j) => (j === i ? e.target.value : x)))} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
                  <button type="button" onClick={() => setQuestions((a) => a.filter((_, j) => j !== i))} className="rounded px-1.5 text-xs text-ink/40 hover:text-danger">✕</button>
                </div>
              ))}
              <button type="button" onClick={() => setQuestions((a) => [...a, ""])} className="mt-2 text-[11px] font-semibold text-accent hover:underline">
                + soru ekle
              </button>
            </div>

            <div className="flex items-center justify-between border-t border-border pt-4">
              <button type="button" onClick={() => setStep(1)} className="text-sm font-semibold text-ink/55 hover:text-ink">
                ← Geri
              </button>
              <button type="button" onClick={() => setStep(3)} disabled={!outline.some((s) => s.h2.trim())} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
                Devam →
              </button>
            </div>
          </div>
        )}

        {/* 4 — Ayarlar */}
        {step === 3 && (
          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <div className="space-y-5">
              <div>
                <div className="mb-2 text-xs font-bold text-ink/55">Uzunluk</div>
                <div className="grid grid-cols-3 gap-2">
                  {(["short", "medium", "long"] as const).map((k) => (
                    <button key={k} type="button" onClick={() => setLength(k)} className={`rounded-xl border px-3 py-2.5 text-left ${length === k ? "border-accent bg-accent/5 ring-1 ring-accent" : "border-border hover:border-accent/40"}`}>
                      <div className="text-sm font-bold">{k === "short" ? "Kısa" : k === "medium" ? "Orta" : "Uzun"}</div>
                      <div className="text-[11px] text-ink/50">{words[k]}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-bold text-ink/55">Ton</span>
                  <select value={tone} onChange={(e) => setTone(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-panel px-3 py-2 text-sm outline-none">
                    <option value="professional">Profesyonel (siz)</option>
                    <option value="friendly">Samimi (sen)</option>
                    <option value="expert">Uzman</option>
                    <option value="simple">Sade, yeni başlayan için</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-ink/55">Biçim</span>
                  <select value={format} onChange={(e) => setFormat(e.target.value as "article" | "listicle")} className="mt-1 w-full rounded-xl border border-border bg-panel px-3 py-2 text-sm outline-none">
                    <option value="article">Makale</option>
                    <option value="listicle">Liste yazısı</option>
                  </select>
                </label>
              </div>
              <div>
                <div className="mb-2 text-xs font-bold text-ink/55">Yazıya eklenecekler</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {([
                    ["takeaways", "Öne çıkanlar", "Girişin altında 3-5 maddelik özet"],
                    ["faq", "SSS bölümü", "Plandaki sorular cevaplanır"],
                    ["table", "Tablo", "Karşılaştırma ya da kontrol listesi"],
                    ["internalLinks", "İç linkler", "Site Taraması'ndaki sayfalarından 2-4 link"],
                    ["cta", "Harekete geçirici kapanış", "Sonda markana kısa davet"],
                  ] as const).map(([k, l, d]) => (
                    <label key={k} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${opts[k] ? "border-accent/50 bg-accent/5" : "border-border"}`}>
                      <input type="checkbox" checked={opts[k]} onChange={(e) => setOpts((o) => ({ ...o, [k]: e.target.checked }))} className="mt-0.5 accent-[#5d16ff]" />
                      <span>
                        <span className="block text-sm font-semibold">{l}</span>
                        <span className="block text-[11px] text-ink/50">{d}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col rounded-xl bg-muted/50 p-4">
              <div className="text-[10px] font-bold uppercase tracking-wide text-ink/40">Özet</div>
              <div className="mt-1 text-base font-semibold leading-6">{title}</div>
              <dl className="mt-3 space-y-1.5 text-xs">
                {[
                  ["Anahtar kelime", keyword],
                  ["Site", site || "—"],
                  ["Bölüm", `${outline.filter((s) => s.h2.trim()).length} H2 · ${outline.reduce((a, s) => a + s.h3.filter((h) => h.trim()).length, 0)} H3`],
                  ["SSS", opts.faq ? `${questions.filter((q) => q.trim()).length} soru` : "yok"],
                  ["Uzunluk", words[length]],
                ].map(([a, b]) => (
                  <div key={a} className="flex justify-between gap-3">
                    <dt className="text-ink/50">{a}</dt>
                    <dd className="truncate text-right font-semibold">{b}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-[11px] leading-5 text-ink/45">Marka bilgi bankası kullanılır. Bilinmeyen rakam ya da bilgi uydurulmaz, [NEEDS: …] olarak işaretlenir.</p>
              <div className="mt-auto pt-4">
                {busy === "write" ? (
                  <div className="rounded-xl bg-panel p-3">
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-accent transition-all duration-[6000ms]" style={{ width: `${Math.min(92, 12 + tick * 16)}%` }} />
                    </div>
                    <div className="mt-2 text-xs font-semibold text-ink/60">{progress[Math.min(tick, progress.length - 1)]}</div>
                    <div className="text-[11px] text-ink/40">30–90 saniye sürebilir; bitince editörde açılacak.</div>
                  </div>
                ) : (
                  <button type="button" onClick={write} disabled={!title || !outline.some((s) => s.h2.trim())} className="w-full rounded-xl bg-accent px-5 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
                    Yazıyı yaz →
                  </button>
                )}
              </div>
            </div>
            <div className="lg:col-span-2">
              <button type="button" onClick={() => setStep(2)} disabled={!!busy} className="text-sm font-semibold text-ink/55 hover:text-ink disabled:opacity-40">
                ← Plana dön
              </button>
            </div>
          </div>
        )}

        {err && <div className="mt-4 rounded-xl bg-danger/10 px-4 py-2.5 text-sm text-danger">{err}</div>}
      </div>
    </div>
  );
}
