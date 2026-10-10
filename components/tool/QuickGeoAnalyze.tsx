"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Arvow tarzı "tek kutu" GEO analizi: kullanıcı sadece adresini yazar. Arka planda
 * onboarding zinciri (tarama → marka profili → web aramalı rakipler → 10 konu → promptlar)
 * çalışır; bitince otomatik seçilen konuların ilk promptlarıyla test hemen başlatılır ve
 * sonuç yukarıdaki panoya düşer. Kullanıcıya hiçbir soru sorulmaz; ince ayar "Ayarlar"
 * panelinde.
 */

type StepStatus = "pending" | "running" | "ready" | "error";
interface BrandRow {
  name: string;
  domain: string;
}

const PROMPTS_PER_TOPIC = 2;

const STEPS = [
  { key: "crawl", label: "Site taranıyor" },
  { key: "profile", label: "Marka profili çıkarılıyor" },
  { key: "competitors", label: "Rakipler web'de aranıyor" },
  { key: "prompts", label: "Konular ve promptlar yazılıyor" },
  { key: "run", label: "AI motorlarına soruluyor" },
] as const;

export default function QuickGeoAnalyze({
  onReady,
  running,
  onOpenSettings,
  nextPath = "/geo",
  runLabel,
}: {
  /** Zincir bittiğinde çağrılır — sayfa bunu mevcut test akışına verir (otomatik çalışır).
   * `pageUrls`: taramanın seçtiği kritik sayfalar (ana sayfa önce). */
  onReady: (brand: BrandRow, competitors: BrandRow[], promptsText: string, pageUrls: string[]) => void;
  nextPath?: string;
  /** Son adımın etiketi (ör. Gap'te "Sayfalar denetleniyor"). */
  runLabel?: string;
  /** Sayfanın gerçek testi şu an çalışıyor mu (son adımın durumu). */
  running: boolean;
  onOpenSettings: () => void;
}) {
  const [url, setUrl] = useState("");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [status, setStatus] = useState<Record<string, StepStatus>>({});
  const [error, setError] = useState<string | null>(null);
  const [handedOff, setHandedOff] = useState(false);
  const [done, setDone] = useState(false);
  const wasRunning = useRef(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // Sayfanın testi başlayıp bittiğinde son adımı "hazır" işaretle.
  useEffect(() => {
    if (!handedOff) return;
    if (running) wasRunning.current = true;
    if (!running && wasRunning.current) {
      wasRunning.current = false;
      setDone(true);
    }
  }, [running, handedOff]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    const v = url.trim();
    if (!v) return;
    setError(null);
    setDone(false);
    setHandedOff(false);
    setStatus({ crawl: "running" });
    try {
      const res = await fetch("/api/onboarding/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: v, language: "tr", country: "Türkiye" }),
      });
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(nextPath)}`;
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analiz başlatılamadı");
      setSessionId(data.sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analiz başlatılamadı");
      setStatus({});
    }
  }

  // Oturumu ~1 sn'de bir yokla; promptlar hazır olunca teste devret.
  useEffect(() => {
    if (sessionId == null || handedOff) return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/onboarding/sessions/${sessionId}`);
        const { session: s } = await res.json();
        if (stop || !s) return;
        setStatus({
          crawl: s.crawlStatus,
          profile: s.profileStatus,
          competitors: s.competitorsStatus,
          prompts: s.promptsStatus === "ready" ? "ready" : s.topicsStatus === "error" || s.promptsStatus === "error" ? "error" : s.profileStatus === "ready" ? "running" : "pending",
        });
        const failed = [s.crawlError, s.profileError, s.topicsError, s.promptsError].find(Boolean);
        if (s.crawlStatus === "error" || s.profileStatus === "error" || s.promptsStatus === "error" || s.topicsStatus === "error") {
          setError(failed ?? "Analiz tamamlanamadı");
          return;
        }
        if (s.promptsStatus === "ready" && s.profileStatus === "ready" && s.competitorsStatus !== "running" && s.competitorsStatus !== "pending") {
          const brand: BrandRow = { name: s.profileResult.brand.name, domain: s.profileResult.brand.domain };
          const competitors: BrandRow[] = (s.competitorsResult?.competitors ?? [])
            .filter((c: any) => c.selected !== false && c.name && c.domain)
            .map((c: any) => ({ name: c.name, domain: c.domain }));
          const selected: string[] = s.topicsResult?.autoSelected ?? [];
          const all: { topic: string; text: string }[] = s.promptsResult?.prompts ?? [];
          const picked: string[] = [];
          for (const t of selected) {
            all.filter((p) => p.topic === t).slice(0, PROMPTS_PER_TOPIC).forEach((p) => picked.push(`${p.topic}: ${p.text}`));
          }
          const promptsText = (picked.length ? picked : all.slice(0, 10).map((p) => `${p.topic}: ${p.text}`)).join("\n");
          const crawl = s.crawlResult?.siteCrawl;
          const pageUrls: string[] = (crawl?.criticalPageUrls?.length ? crawl.criticalPageUrls : [brand.domain]).slice(0, 5);
          setHandedOff(true);
          onReadyRef.current(brand, competitors, promptsText, pageUrls);
          return;
        }
        setTimeout(tick, 1000);
      } catch {
        if (!stop) setTimeout(tick, 2000);
      }
    };
    tick();
    return () => {
      stop = true;
    };
  }, [sessionId, handedOff]);

  const active = sessionId != null && !done && !error;
  const stepState = (key: string): StepStatus => {
    if (key === "run") return done ? "ready" : handedOff ? "running" : "pending";
    return status[key] ?? "pending";
  };

  return (
    <div className="space-y-4">
      <form
        onSubmit={start}
        className="flex flex-col sm:flex-row gap-2 rounded-2xl border border-border bg-panel p-2 shadow-sm transition-all focus-within:border-accent/50 focus-within:shadow-lg focus-within:shadow-accent/10"
      >
        <div className="flex flex-1 items-center gap-2 px-3">
          <span className="text-ink/30">🌐</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Markanın sitesi — ör. siteniz.com"
            disabled={active}
            className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-ink/35 disabled:opacity-60"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onOpenSettings}
            className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-ink/60 hover:border-ink/30 hover:text-ink"
            title="Marka, rakipler, promptlar ve motorlar"
          >
            ⚙ Ayarlar
          </button>
          <button
            type="submit"
            disabled={active || !url.trim()}
            className="rounded-xl bg-accent px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-accent/25 hover:opacity-90 disabled:opacity-50"
          >
            {active ? "Analiz ediliyor…" : "Analizi başlat →"}
          </button>
        </div>
      </form>

      {(sessionId != null || error) && (
        <div className="rounded-2xl border border-border bg-panel p-4">
          <ol className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            {STEPS.map((st0) => {
              const st = st0.key === "run" && runLabel ? { ...st0, label: runLabel } : st0;
              const s = stepState(st.key);
              return (
                <li
                  key={st.key}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                    s === "ready" ? "bg-seo/10 text-seo" : s === "running" ? "bg-accent/10 text-accent" : s === "error" ? "bg-danger/10 text-danger" : "bg-muted text-ink/40"
                  }`}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {s === "ready" ? "✓" : s === "error" ? "!" : s === "running" ? <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" /> : "•"}
                  </span>
                  {st.label}
                </li>
              );
            })}
          </ol>
          {error && <p className="mt-3 text-sm text-danger">{error} — adresi kontrol edip tekrar dene.</p>}
          {done && <p className="mt-3 text-sm text-ink/60">Bitti — sonuçlar yukarıdaki panoya işlendi. Marka, rakip ve promptları <button type="button" onClick={onOpenSettings} className="font-semibold text-accent hover:underline">Ayarlar</button>'dan değiştirebilirsin.</p>}
        </div>
      )}
    </div>
  );
}
