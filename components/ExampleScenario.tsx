"use client";

import { useEffect, useState } from "react";
import Reveal from "./marketing/Reveal";

export interface ScenarioStep {
  title: string;
  body: string;
}

/**
 * Kurgusal "örnek senaryo" — artık akan bir hikâye: adımlar kendiliğinden sırayla
 * vurgulanır, soldaki ilerleme çizgisi dolar, üzerine gelinen adım öne çıkar. Hâlâ iki
 * yerde açıkça "kurgusal" diye etiketli (rozet + alt not); gerçek müşteri sonucu gibi
 * okunmaz.
 */
export default function ExampleScenario({ heading, steps }: { heading: string; steps: ScenarioStep[] }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || steps.length < 2) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setActive((a) => (a + 1) % steps.length), 2800);
    return () => clearInterval(t);
  }, [paused, steps.length]);

  const progress = steps.length > 1 ? (active / (steps.length - 1)) * 100 : 100;

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-border bg-panel p-6 sm:p-10">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl animate-blob" aria-hidden />
      <div className="relative grid grid-cols-1 lg:grid-cols-[0.8fr_1.2fr] gap-8 lg:gap-12">
        <Reveal variant="left" className="space-y-4 lg:sticky lg:top-24 self-start">
          <span className="pill-outline bg-accent/5">ÖRNEK SENARYO</span>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{heading}</h2>
          <p className="text-sm text-ink/50">Adımlar kendiliğinden ilerler — üzerine gelerek durdurabilirsin.</p>
          <div className="flex gap-1.5 pt-1">
            {steps.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Adım ${i + 1}`}
                onClick={() => setActive(i)}
                className={`h-1.5 rounded-full transition-all duration-500 ${i === active ? "w-8 bg-accent" : "w-3 bg-border hover:bg-accent/40"}`}
              />
            ))}
          </div>
          <p className="text-xs text-ink/30 pt-2">
            Bu kurgusal bir örnektir — gerçek bir müşteriye veya siteye ait değildir. Aracın nasıl çalıştığını somut
            şekilde göstermek için hazırlanmıştır.
          </p>
        </Reveal>

        <ol className="relative space-y-3" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          <span className="absolute left-[19px] top-4 bottom-4 w-0.5 rounded-full bg-border" aria-hidden />
          <span
            className="absolute left-[19px] top-4 w-0.5 rounded-full bg-gradient-to-b from-accent to-pink-400 transition-all duration-700 ease-out"
            style={{ height: `calc((100% - 2rem) * ${progress / 100})` }}
            aria-hidden
          />
          {steps.map((s, i) => {
            const on = i === active;
            const done = i < active;
            return (
              <Reveal as="li" key={i} delay={i * 90} className="relative">
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  className={`flex w-full gap-4 rounded-2xl border p-4 text-left transition-all duration-500 ${
                    on ? "border-accent/40 bg-accent/[0.04] shadow-lg shadow-accent/10 translate-x-1" : "border-transparent hover:bg-muted/60"
                  }`}
                >
                  <span
                    className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-extrabold transition-all duration-500 ${
                      on ? "bg-accent text-white shadow-lg shadow-accent/30 scale-110" : done ? "bg-accent/15 text-accent" : "bg-muted text-ink/40"
                    }`}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  <span className="pt-1.5">
                    <span className={`block font-bold transition-colors ${on ? "text-ink" : "text-ink/70"}`}>{s.title}</span>
                    <span
                      className={`block text-sm text-ink/60 overflow-hidden transition-all duration-500 ${on ? "max-h-40 opacity-100 mt-1" : "max-h-0 opacity-0 sm:max-h-40 sm:opacity-60 sm:mt-1"}`}
                    >
                      {s.body}
                    </span>
                  </span>
                </button>
              </Reveal>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
