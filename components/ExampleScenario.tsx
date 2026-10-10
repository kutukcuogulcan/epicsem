export interface ScenarioStep {
  title: string;
  body: string;
}

/**
 * Kurgusal "örnek senaryo" — sade, kapalı gelen bir kart (sayfayı kalabalıklaştırmasın).
 * Açılınca adımlar numaralı liste; iki yerde "kurgusal" diye etiketli.
 */
export default function ExampleScenario({ heading, steps }: { heading: string; steps: ScenarioStep[] }) {
  return (
    <details className="group rounded-2xl border border-border bg-panel">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
        <span className="flex items-center gap-3 min-w-0">
          <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-[11px] font-bold text-accent shrink-0">Örnek senaryo</span>
          <span className="truncate text-sm font-semibold">{heading}</span>
        </span>
        <span className="text-ink/40 text-xs transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="border-t border-border px-5 py-4 space-y-4">
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-ink/60">{i + 1}</span>
              <div>
                <div className="font-semibold">{s.title}</div>
                <p className="text-ink/60">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="text-xs text-ink/35">
          Bu kurgusal bir örnektir — gerçek bir müşteriye veya siteye ait değildir. Aracın nasıl çalıştığını somut şekilde göstermek için hazırlanmıştır.
        </p>
      </div>
    </details>
  );
}
