"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useProject } from "@/components/ProjectProvider";

/**
 * Onboarding sihirbazı — site adresinden tam kurulu projeye 5 adımda.
 *  1 Site → arka planda zincir başlar (tarama → marka profili ‖ rakipler → konular → sorular, /api/onboarding/sessions)
 *  2 Marka → profil düzenlenir   3 Rakipler → seçilir/eklenir   4 Sorular → takip edilecek AI soruları seçilir
 *  5 Kurulum → proje + marka ayarları + sorular kaydedilir, ilk site denetimi (ücretsiz) ve istenirse ilk GEO testi çalışır.
 * Oturum id'si URL'de (?s=) tutulur: sayfa yenilense de kaldığı yerden devam eder.
 */

type StepStatus = "pending" | "running" | "ready" | "error";
interface Session {
  id: number;
  url: string;
  crawlStatus: StepStatus;
  profileStatus: StepStatus;
  competitorsStatus: StepStatus;
  topicsStatus: StepStatus;
  promptsStatus: StepStatus;
  crawlError: string | null;
  profileError: string | null;
  competitorsError: string | null;
  topicsError: string | null;
  promptsError: string | null;
  crawlResult: any;
  profileResult: any;
  competitorsResult: any;
  topicsResult: any;
  promptsResult: any;
}
interface Comp {
  name: string;
  domain: string;
  reason?: string;
  on: boolean;
}
interface P {
  topic: string;
  text: string;
  on: boolean;
}

const STEPS = ["Site", "Marka", "Rakipler", "Sorular", "Kurulum"] as const;
const BTN1 = "inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-accent px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50";
const BTN2 = "inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-panel px-4 text-sm font-medium text-ink shadow-[inset_0_0_0_1px_#D5D7DA,0_1px_2px_rgba(13,18,28,0.05)] hover:bg-muted disabled:opacity-50";
const INPUT = "h-10 w-full rounded-[10px] border border-border bg-panel px-3 text-sm outline-none focus:border-[#BDB4FF]";
const LABEL = "mb-1.5 block text-xs font-medium text-sub";
const ENGINES = ["anthropic", "openai", "google", "perplexity"];
const MAX_PROMPTS = 20;
const host = (u: string) => u.trim().toLowerCase().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "");

function Dot({ s }: { s: StepStatus | "skip" }) {
  if (s === "ready") return <span className="flex h-5 w-5 items-center justify-center rounded-full bg-seo-ink text-xs text-white">✓</span>;
  if (s === "running") return <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />;
  if (s === "error") return <span className="flex h-5 w-5 items-center justify-center rounded-full bg-danger-ink text-xs text-white">!</span>;
  return <span className="h-5 w-5 rounded-full border-2 border-border" />;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { refresh } = useProject();
  const [step, setStep] = useState(0);
  const [url, setUrl] = useState("");
  const [language, setLanguage] = useState<"tr" | "en">("tr");
  const [country, setCountry] = useState("Türkiye");
  const [sid, setSid] = useState<number | null>(null);
  const [s, setS] = useState<Session | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // Düzenlenebilir alanlar (zincir sonuçlarından bir kez doldurulur)
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [description, setDescription] = useState("");
  const [industry, setIndustry] = useState("");
  const [products, setProducts] = useState("");
  const [comps, setComps] = useState<Comp[]>([]);
  const ownBrands = useRef<string[]>([]); // rakip adımından gelen alt marka adayları (sunucuda siteyle doğrulanır)
  const [newComp, setNewComp] = useState({ name: "", domain: "" });
  const [prompts, setPrompts] = useState<P[]>([]);
  const [topicSel, setTopicSel] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const filled = useRef({ profile: false, comps: false, prompts: false });

  // Kurulum seçenekleri ve ilerleme
  const [doAudit, setDoAudit] = useState(true);
  const [doGeo, setDoGeo] = useState(true);
  const [geoOk, setGeoOk] = useState(false);
  const [setup, setSetup] = useState<{ k: string; l: string; s: StepStatus; note?: string }[] | null>(null);
  const [finished, setFinished] = useState(false);

  // ?s= ile kaldığı yerden devam
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const q = qs.get("s");
    if (q && Number.isInteger(Number(q))) setSid(Number(q));
    // Ücretsiz AI testinden gelindiyse site adresini önceden doldur.
    const pre = qs.get("url");
    if (pre && !q) {
      setUrl(pre.slice(0, 200));
      // Ana sayfadaki kutudan gelindiyse (?go=1) taramayı kendiliğinden başlat; adres ikinci kez onaylatılmaz.
      if (qs.get("go") === "1") autoStart.current = true;
    }
  }, []);
  const autoStart = useRef(false);
  useEffect(() => {
    if (autoStart.current && url && sid == null) {
      autoStart.current = false;
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // Oturumu yokla
  useEffect(() => {
    if (sid == null) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/onboarding/sessions/${sid}`);
        if (r.status === 401) return (window.location.href = "/login?next=/onboarding");
        const d = await r.json();
        if (stop) return;
        if (!r.ok) throw new Error(d.error ?? "Oturum okunamadı");
        const ss: Session = d.session;
        setS(ss);
        if (!url) setUrl(ss.url);
        const busy = [ss.crawlStatus, ss.profileStatus, ss.competitorsStatus, ss.topicsStatus, ss.promptsStatus].some((x) => x === "running" || x === "pending");
        const hardFail = ss.crawlStatus === "error" || ss.profileStatus === "error";
        if (busy && !hardFail) setTimeout(tick, 1500);
      } catch (e) {
        if (!stop) {
          setErr(e instanceof Error ? e.message : "Oturum okunamadı");
          setTimeout(tick, 3000);
        }
      }
    };
    tick();
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid]);

  // Sonuçlar geldikçe formları bir kez doldur
  useEffect(() => {
    if (!s) return;
    if (s.profileStatus === "ready" && !filled.current.profile && s.profileResult) {
      filled.current.profile = true;
      const p = s.profileResult;
      setName(p.brand?.name ?? "");
      setDomain(p.brand?.domain ?? host(s.url));
      setDescription(p.description ?? "");
      setIndustry(p.industry ?? "");
      setProducts((p.productTags ?? []).join(", "));
      setStep((x) => (x === 0 ? 1 : x));
    }
    if (s.competitorsStatus === "ready" && !filled.current.comps) {
      filled.current.comps = true;
      const list = (s.competitorsResult?.competitors ?? []).filter((c: any) => c.name && !/DEMO/.test(c.name));
      setComps(list.slice(0, 10).map((c: any, i: number) => ({ name: c.name, domain: c.domain ?? "", reason: c.reason, on: i < 5 && !!c.domain })));
      ownBrands.current = Array.isArray(s.competitorsResult?.ownBrands) ? s.competitorsResult.ownBrands : [];
    }
    if (s.promptsStatus === "ready" && !filled.current.prompts) {
      filled.current.prompts = true;
      const all: { topic: string; text: string }[] = [...(s.promptsResult?.prompts ?? []), ...(s.promptsResult?.brandedPrompts ?? [])];
      const auto: string[] = s.topicsResult?.autoSelected ?? [];
      const topics = Array.from(new Set(all.map((p) => p.topic)));
      const sel = auto.length ? auto.filter((t) => topics.includes(t)) : topics.slice(0, 5);
      setTopicSel(sel);
      const perTopic: Record<string, number> = {};
      setPrompts(
        all.map((p) => {
          const on = sel.includes(p.topic) && (perTopic[p.topic] = (perTopic[p.topic] ?? 0) + 1) <= 2;
          return { topic: p.topic, text: p.text, on };
        })
      );
    }
  }, [s]);

  async function start(e?: React.FormEvent) {
    e?.preventDefault();
    if (!url.trim()) return;
    setErr(null);
    setStarting(true);
    filled.current = { profile: false, comps: false, prompts: false };
    try {
      const r = await fetch("/api/onboarding/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url.trim(), language, country }) });
      if (r.status === 401) return (window.location.href = "/login?next=/onboarding");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Başlatılamadı");
      setSid(d.sessionId);
      window.history.replaceState(null, "", `/onboarding?s=${d.sessionId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Başlatılamadı");
    } finally {
      setStarting(false);
    }
  }

  const topics = useMemo(() => Array.from(new Set(prompts.map((p) => p.topic))), [prompts]);
  const chosen = prompts.filter((p) => p.on);
  const chosenComps = comps.filter((c) => c.on && c.name.trim() && c.domain.trim());

  async function finish() {
    const items = [
      { k: "project", l: "Proje", s: "running" as StepStatus },
      { k: "monitor", l: "Ana sayfa izlemeye alındı (ücretsiz)", s: "pending" as StepStatus },
      { k: "settings", l: "Marka bilgileri", s: "pending" as StepStatus },
      { k: "prompts", l: `${chosen.length} AI sorusu takipte`, s: "pending" as StepStatus },
      ...(doAudit ? [{ k: "audit", l: "İlk site denetimi (ücretsiz)", s: "pending" as StepStatus }] : []),
      ...(doGeo && chosen.length ? [{ k: "geo", l: "İlk GEO testi", s: "pending" as StepStatus }] : []),
    ];
    setSetup(items);
    const mark = (k: string, st: StepStatus, note?: string) => setSetup((xs) => (xs ? xs.map((x) => (x.k === k ? { ...x, s: st, note } : x)) : xs));
    const brand = { name: name.trim() || host(domain), domain: host(domain) };
    const competitors = chosenComps.slice(0, 6).map((c) => ({ name: c.name.trim(), domain: host(c.domain) }));
    try {
      // 1 Proje
      const pr = await fetch("/api/project", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...brand, competitors, ownBrands: ownBrands.current }) });
      const pd = await pr.json();
      if (!pr.ok) throw new Error(pd.error ?? "Proje oluşturulamadı");
      mark("project", "ready", pd.existed ? "Bu site zaten bir projeydi; o seçildi." : undefined);
      // Sunucu yeni projede ana sayfayı Sayfa İzleme'ye ekler (api/project); mevcut projede dokunulmaz.
      mark("monitor", "ready", pd.existed ? "Sayfa İzleme'den kontrol edebilirsin." : "AI botu engellenirse ya da sayfa bozulursa uyarı alırsın.");
      // 2 Ayarlar
      mark("settings", "running");
      const sr = await fetch("/api/project/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitors, settings: { description: description.slice(0, 1500), language, country, products: products.slice(0, 3000) } }),
      });
      mark("settings", sr.ok ? "ready" : "error", sr.ok ? undefined : "Ayarlar kaydedilemedi; Proje Ayarları'ndan tamamlayabilirsin.");
      // 3 Sorular
      let ids: number[] = [];
      if (chosen.length) {
        mark("prompts", "running");
        const qr = await fetch("/api/saved-prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brand, competitors, prompts: chosen.slice(0, MAX_PROMPTS).map((p) => ({ text: p.text, topic: p.topic.slice(0, 60) || "Genel" })) }),
        });
        const qd = await qr.json().catch(() => ({}));
        ids = (qd.prompts ?? []).map((x: { id: number }) => x.id);
        mark("prompts", qr.ok ? "ready" : "error", qr.ok ? undefined : qd.error ?? "Sorular kaydedilemedi");
      } else mark("prompts", "ready", "Soru seçilmedi");
      await refresh().catch(() => {});
      // 4 Denetim
      if (doAudit) {
        mark("audit", "running");
        const ar = await fetch("/api/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: brand.domain }) });
        const ad = await ar.json().catch(() => ({}));
        const unreadable = ar.ok && !ad.score && !ad.aiCrawlScore;
        mark("audit", ar.ok && !unreadable ? "ready" : "error", unreadable ? "Site okunamadı; adres doğru mu? Site Denetimi'nden tekrar deneyebilirsin." : ar.ok ? `Teknik SEO ${ad.score ?? "—"}/100 · AI erişimi ${ad.aiCrawlScore ?? "—"}/100` : ad.error ?? "Denetim başarısız");
      }
      // 5 GEO
      if (doGeo && ids.length) {
        // Tek tam test (/api/geo): sonuç GEO panosu, Genel Bakış, monitörler ve rapora kaydedilir.
        // shortcut: soru listesindeki satır bazlı görünürlük bu testten doldurulmaz; satırdan "Çalıştır" ile güncellenir.
        mark("geo", "running", `${Math.min(chosen.length, MAX_PROMPTS)} soru bağlı AI motorlarına soruluyor; birkaç dakika sürebilir…`);
        const gr = await fetch("/api/geo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brand, competitors, prompts: chosen.slice(0, MAX_PROMPTS).map((p) => ({ text: p.text, topic: p.topic.slice(0, 60) || "Genel" })), engines: ENGINES }),
        });
        const gd = await gr.json().catch(() => ({}));
        const n = Array.isArray(gd.runs) ? gd.runs.length : 0;
        setGeoOk(gr.ok && n > 0);
        mark("geo", gr.ok && n ? "ready" : "error", gr.ok && n ? `${n} AI cevabı alındı ve kaydedildi` : gd.error ?? "Test çalıştırılamadı");
        window.dispatchEvent(new Event("epicsem:usage-changed"));
      }
      setFinished(true);
    } catch (e) {
      setSetup((xs) => (xs ? xs.map((x) => (x.s === "running" ? { ...x, s: "error", note: e instanceof Error ? e.message : "Hata" } : x)) : xs));
    }
  }

  /* ---------------- görünüm ---------------- */
  const chain: [string, StepStatus, string | null][] = s
    ? [
        ["Site taranıyor", s.crawlStatus, s.crawlError],
        ["Marka profili çıkarılıyor", s.profileStatus, s.profileError],
        ["Rakipler bulunuyor (web araması)", s.competitorsStatus, s.competitorsError],
        ["Konular belirleniyor", s.topicsStatus, s.topicsError],
        ["AI soruları hazırlanıyor", s.promptsStatus, s.promptsError],
      ]
    : [];
  const hardFail = s && (s.crawlStatus === "error" || s.profileStatus === "error");
  const canGo = [true, !!name.trim() && !!domain.trim(), true, chosen.length > 0 || s?.promptsStatus === "error", true];

  return (
    <div className="mx-auto max-w-3xl py-6">
      <div className="mb-6 text-center">
        <div className="text-xs font-semibold uppercase tracking-wide text-accent">Kurulum</div>
        <h1 className="mt-1 text-2xl font-semibold text-ink">{["Siten hangisi?", "Markanı tanıyalım", "Kimlerle yarışıyorsun?", "AI'a hangi sorular sorulsun?", "Hazırız"][step]}</h1>
        <p className="mt-1 text-sm text-sub">
          {
            [
              "Adresi yaz; siteni tarayıp marka profilini, rakiplerini ve takip edilecek AI sorularını biz çıkaralım.",
              "Sitenden çıkardıklarımız. Düzelt ya da ekle; yazılar ve öneriler bu bilgilere dayanır.",
              "Web aramasıyla bulunan rakipler. AI cevaplarında seninle karşılaştırılacaklar; en fazla 6.",
              "İnsanların ChatGPT, Claude, Gemini ve Perplexity'ye sorduğu sorular. Görünürlüğün bunlarla ölçülür.",
              "Projeyi kuruyoruz. İstersen ilk denetimi ve ilk GEO testini de hemen çalıştıralım.",
            ][step]
          }
        </p>
      </div>

      {/* Adım göstergesi */}
      <div className="mb-6 flex items-center justify-center gap-1.5">
        {STEPS.map((l, i) => (
          <div key={l} className="flex items-center gap-1.5">
            <span className={`flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium ${i === step ? "bg-accent text-white" : i < step ? "bg-accent/10 text-accent" : "bg-muted text-sub"}`}>
              <span className="tabular-nums">{i < step ? "✓" : i + 1}</span>
              {l}
            </span>
            {i < STEPS.length - 1 && <span className="h-px w-4 bg-border" />}
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-panel p-6 shadow-[0_1px_2px_rgba(13,18,28,0.05)]">
        {/* 1 Site */}
        {step === 0 && (
          <div className="space-y-5">
            <form onSubmit={start} className="space-y-3">
              <div>
                <label className={LABEL}>Site adresi</label>
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="siten.com" autoFocus disabled={!!sid && !hardFail} className={`${INPUT} h-11 text-base`} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>İçerik dili</label>
                  <select value={language} onChange={(e) => setLanguage(e.target.value as "tr" | "en")} disabled={!!sid && !hardFail} className={INPUT}>
                    <option value="tr">Türkçe</option>
                    <option value="en">İngilizce</option>
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Pazar</label>
                  <input value={country} onChange={(e) => setCountry(e.target.value)} disabled={!!sid && !hardFail} className={INPUT} />
                </div>
              </div>
              {(!sid || hardFail) && (
                <button disabled={starting || !url.trim()} className={`${BTN1} w-full`}>
                  {starting ? "Başlatılıyor…" : hardFail ? "Tekrar dene" : "Siteyi analiz et"}
                </button>
              )}
              <p className="text-center text-xs text-sub">Kurulum 3 kurulum adımı kotası kullanır; aynı siteyi 7 gün içinde tekrar kurarsan ücretsizdir.</p>
            </form>
            {s && (
              <ul className="space-y-2.5 border-t border-border pt-5">
                {chain.map(([l, st, e]) => (
                  <li key={l} className="flex items-start gap-3 text-sm">
                    <Dot s={st} />
                    <div className="min-w-0">
                      <div className={st === "pending" ? "text-sub" : ""}>{l}</div>
                      {e && <div className="text-xs text-danger-ink">{e}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {err && <p className="rounded-lg bg-danger/5 px-3 py-2 text-xs text-danger-ink">{err}</p>}
          </div>
        )}

        {/* 2 Marka */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Marka adı</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Site</label>
                <input value={domain} onChange={(e) => setDomain(e.target.value)} className={INPUT} />
              </div>
            </div>
            <div>
              <label className={LABEL}>Ne yapıyor?</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="w-full rounded-[10px] border border-border bg-panel px-3 py-2 text-sm outline-none focus:border-[#BDB4FF]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Sektör</label>
                <input value={industry} onChange={(e) => setIndustry(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Ürün / hizmetler (virgülle)</label>
                <input value={products} onChange={(e) => setProducts(e.target.value)} className={INPUT} />
              </div>
            </div>
          </div>
        )}

        {/* 3 Rakipler */}
        {step === 2 && (
          <div className="space-y-4">
            {s?.competitorsStatus === "running" || s?.competitorsStatus === "pending" ? (
              <div className="flex items-center gap-3 text-sm text-sub">
                <Dot s="running" /> Rakipler web aramasıyla bulunuyor (20–40 sn)…
              </div>
            ) : (
              <>
                {s?.competitorsStatus === "error" && <p className="rounded-lg bg-warn/5 px-3 py-2 text-xs text-ink/70">Rakipler otomatik bulunamadı; aşağıdan elle ekleyebilirsin.</p>}
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {comps.map((c, i) => (
                    <li key={i} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                      <input
                        type="checkbox"
                        checked={c.on}
                        onChange={() => setComps((xs) => xs.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}
                        className="mt-2 accent-[#4f00ff]"
                        disabled={!c.on && chosenComps.length >= 6}
                      />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {c.domain && <img src={`https://www.google.com/s2/favicons?domain=${host(c.domain)}&sz=32`} alt="" className="mt-2 h-4 w-4 rounded" />}
                      <div className="min-w-0 flex-1">
                        <div className="grid grid-cols-2 gap-2">
                          <input value={c.name} onChange={(e) => setComps((xs) => xs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="h-8 rounded-[8px] border border-transparent bg-transparent px-1 font-medium outline-none hover:border-border focus:border-[#BDB4FF]" />
                          <input value={c.domain} placeholder="alan adı" onChange={(e) => setComps((xs) => xs.map((x, j) => (j === i ? { ...x, domain: e.target.value } : x)))} className="h-8 rounded-[8px] border border-transparent bg-transparent px-1 text-sub outline-none hover:border-border focus:border-[#BDB4FF]" />
                        </div>
                        {c.reason && <div className="px-1 text-xs text-sub">{c.reason}</div>}
                      </div>
                    </li>
                  ))}
                  {!comps.length && <li className="px-3 py-4 text-center text-sm text-sub">Henüz rakip yok.</li>}
                </ul>
                <div className="flex gap-2">
                  <input value={newComp.name} onChange={(e) => setNewComp({ ...newComp, name: e.target.value })} placeholder="Rakip adı" className={INPUT} />
                  <input value={newComp.domain} onChange={(e) => setNewComp({ ...newComp, domain: e.target.value })} placeholder="rakip.com" className={INPUT} />
                  <button
                    type="button"
                    disabled={!newComp.name.trim() || !newComp.domain.trim()}
                    onClick={() => {
                      setComps((xs) => [...xs, { ...newComp, on: chosenComps.length < 6 }]);
                      setNewComp({ name: "", domain: "" });
                    }}
                    className={`${BTN2} shrink-0`}
                  >
                    Ekle
                  </button>
                </div>
                <p className="text-xs text-sub">{chosenComps.length}/6 seçili</p>
              </>
            )}
          </div>
        )}

        {/* 4 Sorular */}
        {step === 3 && (
          <div className="space-y-4">
            {s?.promptsStatus === "running" || s?.promptsStatus === "pending" ? (
              <div className="flex items-center gap-3 text-sm text-sub">
                <Dot s="running" /> Konular ve sorular hazırlanıyor…
              </div>
            ) : (
              <>
                {s?.promptsStatus === "error" && <p className="rounded-lg bg-warn/5 px-3 py-2 text-xs text-ink/70">Sorular otomatik hazırlanamadı; aşağıdan kendi sorunu ekleyebilir ya da bu adımı geçebilirsin.</p>}
                {topics.length > 0 && (
                  <div>
                    <label className={LABEL}>Konular</label>
                    <div className="flex flex-wrap gap-1.5">
                      {topics.map((t) => {
                        const on = topicSel.includes(t);
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => {
                              setTopicSel((xs) => (on ? xs.filter((x) => x !== t) : [...xs, t]));
                              if (on) setPrompts((xs) => xs.map((p) => (p.topic === t ? { ...p, on: false } : p)));
                            }}
                            className={`inline-flex h-8 items-center rounded-[9px] px-3 text-[13px] font-medium ${on ? "bg-accent/5 text-ink shadow-[inset_0_0_0_1px_#BDB4FF]" : "bg-panel text-sub shadow-[inset_0_0_0_1px_#E4E5E8] hover:text-ink"}`}
                          >
                            {t}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="max-h-[380px] space-y-4 overflow-y-auto pr-1">
                  {topicSel.map((t) => (
                    <div key={t}>
                      <div className="mb-1 text-xs font-semibold text-ink">{t}</div>
                      <ul className="space-y-1">
                        {prompts
                          .map((p, i) => ({ p, i }))
                          .filter(({ p }) => p.topic === t)
                          .map(({ p, i }) => (
                            <li key={i}>
                              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-[#fafafa]">
                                <input
                                  type="checkbox"
                                  checked={p.on}
                                  disabled={!p.on && chosen.length >= MAX_PROMPTS}
                                  onChange={() => setPrompts((xs) => xs.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}
                                  className="mt-1 accent-[#4f00ff]"
                                />
                                <span>{p.text}</span>
                              </label>
                            </li>
                          ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Kendi sorunu ekle, ör. İstanbul'da en iyi … hangisi?" className={INPUT} />
                  <button
                    type="button"
                    disabled={custom.trim().length < 8 || chosen.length >= MAX_PROMPTS}
                    onClick={() => {
                      setPrompts((xs) => [...xs, { topic: "Kendi sorularım", text: custom.trim(), on: true }]);
                      setTopicSel((xs) => (xs.includes("Kendi sorularım") ? xs : [...xs, "Kendi sorularım"]));
                      setCustom("");
                    }}
                    className={`${BTN2} shrink-0`}
                  >
                    Ekle
                  </button>
                </div>
                <p className="text-xs text-sub">
                  {chosen.length}/{MAX_PROMPTS} soru seçili. Her test, soru × motor kadar AI sorgusu kullanır.
                </p>
              </>
            )}
          </div>
        )}

        {/* 5 Kurulum */}
        {step === 4 && (
          <div className="space-y-5">
            {!setup ? (
              <>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {([
                    ["Marka", name || host(domain)],
                    ["Rakip", String(chosenComps.length)],
                    ["AI sorusu", String(chosen.length)],
                  ] as const).map(([l, v]) => (
                    <div key={l} className="rounded-xl border border-border px-3 py-3">
                      <div className="text-xs text-sub">{l}</div>
                      <div className="truncate text-base font-semibold">{v}</div>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 text-sm">
                    <input type="checkbox" checked={doAudit} onChange={() => setDoAudit(!doAudit)} className="mt-1 accent-[#4f00ff]" />
                    <div>
                      <div className="font-medium">İlk site denetimini çalıştır</div>
                      <div className="text-xs text-sub">Teknik SEO, AI botları, şema, sitemap. Ücretsiz, ~20 sn.</div>
                    </div>
                  </label>
                  <label className={`flex items-start gap-3 rounded-xl border border-border p-3 text-sm ${chosen.length ? "cursor-pointer" : "opacity-50"}`}>
                    <input type="checkbox" checked={doGeo && chosen.length > 0} disabled={!chosen.length} onChange={() => setDoGeo(!doGeo)} className="mt-1 accent-[#4f00ff]" />
                    <div>
                      <div className="font-medium">İlk GEO testini çalıştır</div>
                      <div className="text-xs text-sub">
                        {chosen.length} soru, bağlı her AI motoruna sorulur: soru × motor kadar AI sorgusu kullanır (örneğin yalnızca Claude bağlıysa {chosen.length}). Birkaç dakika sürebilir.
                      </div>
                    </div>
                  </label>
                </div>
                <button type="button" onClick={finish} className={`${BTN1} w-full`}>
                  Projeyi kur
                </button>
              </>
            ) : (
              <>
                <ul className="space-y-3">
                  {setup.map((x) => (
                    <li key={x.k} className="flex items-start gap-3 text-sm">
                      <Dot s={x.s} />
                      <div>
                        <div className={x.s === "pending" ? "text-sub" : ""}>{x.l}</div>
                        {x.note && <div className={`text-xs ${x.s === "error" ? "text-danger-ink" : "text-sub"}`}>{x.note}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
                {finished && (
                  <div className="flex flex-col gap-2 border-t border-border pt-5 sm:flex-row">
                    <button type="button" onClick={() => router.push("/dashboard")} className={`${BTN1} flex-1`}>
                      Panele git
                    </button>
                    <button type="button" onClick={() => router.push(geoOk ? "/geo/rapor" : "/geo")} className={`${BTN2} flex-1`}>
                      {geoOk ? "AI raporunu gör" : "GEO'ya git"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Alt gezinme */}
        {step > 0 && !setup && (
          <div className="mt-6 flex items-center justify-between border-t border-border pt-5">
            <button type="button" onClick={() => setStep(step - 1)} className={BTN2}>
              ← Geri
            </button>
            {step < 4 && (
              <button type="button" disabled={!canGo[step]} onClick={() => setStep(step + 1)} className={BTN1}>
                Devam →
              </button>
            )}
          </div>
        )}
      </div>

      {step === 0 && !s && (
        <p className="mt-4 text-center text-xs text-sub">
          Zaten projen var mı?{" "}
          <button type="button" onClick={() => router.push("/dashboard")} className="font-medium text-accent hover:underline">
            Panele dön
          </button>
        </p>
      )}
    </div>
  );
}
