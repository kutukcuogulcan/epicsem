"use client";

import { useEffect, useState } from "react";
import Reveal from "./Reveal";

/**
 * "Akan" ürün animasyonu — arvow.com'daki hareketli illüstrasyon kartlarının karşılığı.
 * Bir prompt yazılır, motorlar sırayla cevap verir, markanın geçtiği yer vurgulanır,
 * kaynaklar belirir, alttaki görünürlük çubukları dolar. Tamamen temsili (marka adı
 * "Markan", rakipler "Rakip A/B") ve ekranda öyle etiketli — gerçek müşteri verisi
 * gibi sunulmaz.
 */

const PROMPT = "İstanbul'da e-ticaret için en iyi dijital pazarlama ajansı hangisi?";

const ENGINES = [
  {
    name: "ChatGPT",
    color: "#10a37f",
    answer: ["Öne çıkan seçenekler:", "1. **Markan** — e-ticarete özel SEO + performans", "2. Rakip A — kurumsal markalara odaklı", "3. Rakip B — sosyal medya ağırlıklı"],
    sources: ["markan.com", "sikayetvar.com", "webrazzi.com"],
  },
  {
    name: "Gemini",
    color: "#4285f4",
    answer: ["Değerlendirebileceğin ajanslar:", "• Rakip A — geniş ekip, yüksek bütçe", "• **Markan** — ölçülebilir sonuç, e-ticaret uzmanlığı", "• Rakip C — yerel işletmeler"],
    sources: ["markan.com/blog", "linkedin.com", "clutch.co"],
  },
  {
    name: "Perplexity",
    color: "#20b8cd",
    answer: ["Kaynaklara göre en çok önerilenler:", "**Markan** [1], Rakip A [2], Rakip B [3]", "Markan, e-ticaret vaka çalışmalarıyla öne çıkıyor [1]."],
    sources: ["markan.com/vaka", "hangikredi.com", "reddit.com"],
  },
];

const BARS = [
  { name: "Markan", value: 72, color: "#5d16ff" },
  { name: "Rakip A", value: 54, color: "#94a3b8" },
  { name: "Rakip B", value: 31, color: "#cbd5e1" },
];

function renderLine(line: string) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") ? (
      <mark key={i} className="rounded bg-accent/15 px-1 font-bold text-accent">
        {p.slice(2, -2)}
      </mark>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

export default function AiAnswerDemo({
  eyebrow = "CANLI AKIŞ",
  title = "Bir prompt, sekiz motor, tek tablo",
  body = "Epicsem aynı soruyu tüm AI motorlarına sorar, markanın hangi cevapta, kaçıncı sırada ve hangi kaynakla geçtiğini yakalar — sonra hepsini görünürlük, SoV ve pozisyon olarak tek tabloda toplar.",
  bullets = ["Markan geçiyor mu, kaçıncı sırada?", "Hangi kaynaklar alıntılanıyor?", "Rakiplere göre görünürlük payın ne?"],
}: {
  eyebrow?: string;
  title?: string;
  body?: string;
  bullets?: string[];
}) {
  const [typed, setTyped] = useState(0);
  const [engine, setEngine] = useState(0);
  const [lines, setLines] = useState(0);

  // Prompt yazımı → her motor için satırlar teker teker → sonraki motor → döngü.
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setTyped(PROMPT.length);
      setLines(ENGINES[0].answer.length);
      return;
    }
    let t: ReturnType<typeof setTimeout>;
    if (typed < PROMPT.length) {
      t = setTimeout(() => setTyped((n) => n + 1), 28);
    } else if (lines < ENGINES[engine].answer.length) {
      t = setTimeout(() => setLines((n) => n + 1), lines === 0 ? 500 : 650);
    } else {
      t = setTimeout(() => {
        setLines(0);
        setEngine((e) => (e + 1) % ENGINES.length);
      }, 2600);
    }
    return () => clearTimeout(t);
  }, [typed, lines, engine]);

  const current = ENGINES[engine];
  const answered = lines >= current.answer.length;

  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center">
      <Reveal variant="left" className="space-y-5">
        <span className="pill-outline bg-accent/5">{eyebrow}</span>
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">{title}</h2>
        <p className="text-ink/60">{body}</p>
        <ul className="space-y-3">
          {bullets.map((b, i) => (
            <Reveal as="li" key={b} delay={150 + i * 120} className="flex items-center gap-3 text-sm font-medium text-ink/80">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white text-xs">✓</span>
              {b}
            </Reveal>
          ))}
        </ul>
      </Reveal>

      <Reveal variant="right" delay={100} className="relative">
        <div className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-accent/20 via-geo/20 to-pink-300/20 blur-2xl animate-blob" aria-hidden />
        <div className="relative rounded-2xl border border-border bg-panel shadow-2xl shadow-accent/10 overflow-hidden">
          {/* Motor sekmeleri */}
          <div className="flex items-center gap-1.5 border-b border-border bg-muted/50 px-3 py-2">
            {ENGINES.map((e, i) => (
              <span
                key={e.name}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                  i === engine ? "bg-panel shadow-sm text-ink" : "text-ink/40"
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: e.color }} />
                {e.name}
              </span>
            ))}
            <span className="ml-auto text-[10px] font-medium text-ink/30">Temsili animasyon</span>
          </div>

          <div className="p-5 space-y-4 min-h-[19rem]">
            {/* Kullanıcı promptu */}
            <div className="flex justify-end">
              <div className={`max-w-[85%] rounded-2xl rounded-br-md bg-ink text-white px-4 py-2.5 text-sm ${typed < PROMPT.length ? "typing-caret" : ""}`}>
                {PROMPT.slice(0, typed)}
              </div>
            </div>

            {/* Motor cevabı */}
            {typed >= PROMPT.length && (
              <div key={engine} className="flex gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold animate-pop" style={{ background: current.color }}>
                  {current.name[0]}
                </span>
                <div className="space-y-1.5 text-sm text-ink/80">
                  {current.answer.slice(0, lines).map((l, i) => (
                    <p key={i} className="animate-pop" style={{ animationDuration: "0.35s" }}>
                      {renderLine(l)}
                    </p>
                  ))}
                  {lines < current.answer.length && (
                    <span className="inline-flex gap-1 py-1">
                      {[0, 1, 2].map((d) => (
                        <span key={d} className="h-1.5 w-1.5 rounded-full bg-ink/30 animate-bounce" style={{ animationDelay: `${d * 120}ms` }} />
                      ))}
                    </span>
                  )}
                  {answered && (
                    <div className="flex flex-wrap gap-1.5 pt-2">
                      {current.sources.map((s, i) => (
                        <span
                          key={s}
                          className="animate-pop inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] text-ink/60"
                          style={{ animationDelay: `${i * 120}ms` }}
                        >
                          🔗 {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Görünürlük çubukları */}
          <div className="border-t border-border bg-muted/30 px-5 py-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-ink/70">Görünürlük (tüm motorlar)</span>
              {answered && <span className="animate-pop rounded-full bg-seo/10 px-2 py-0.5 font-bold text-seo">Markan #1</span>}
            </div>
            {BARS.map((b) => (
              <div key={b.name} className="flex items-center gap-3 text-xs">
                <span className="w-14 shrink-0 font-medium text-ink/60">{b.name}</span>
                <div className="h-2 flex-1 rounded-full bg-border/70 overflow-hidden">
                  <div key={`${engine}-${answered}`} className="h-full rounded-full animate-grow-x" style={{ width: `${answered ? b.value : 8}%`, background: b.color }} />
                </div>
                <span className="w-8 text-right tabular-nums font-semibold text-ink/70">%{answered ? b.value : 0}</span>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
