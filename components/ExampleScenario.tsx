import Reveal from "./marketing/Reveal";

export interface ScenarioStep {
  title: string;
  body: string;
}

const COLS: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
};

/**
 * "Nasıl çalışır" bölümü (arvow.com tarzı): başlık + numaralı adım kartları, kartlar
 * arasında ince bağlantı çizgisi. Kurgusal örnek olduğu altta açıkça yazılır.
 */
export default function ExampleScenario({ heading, steps }: { heading: string; steps: ScenarioStep[] }) {
  const n = Math.min(steps.length, 5);
  return (
    <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-b from-accent/[0.05] via-panel to-panel px-5 py-8 sm:px-8 sm:py-10">
      <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
      <Reveal className="relative mx-auto max-w-2xl space-y-2 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-panel px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Nasıl çalışır
        </span>
        <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">{heading}</h2>
        <p className="text-sm text-ink/50">Adım adım bir örnek — aracın baştan sona ne yaptığını görürsün.</p>
      </Reveal>

      <ol className={`relative mt-8 grid gap-4 sm:grid-cols-2 ${COLS[n] ?? "lg:grid-cols-3"}`}>
        {steps.map((s, i) => (
          <Reveal as="li" key={i} delay={i * 80} className="group relative">
            {i < steps.length - 1 && (
              <span className="absolute left-[calc(50%+1.75rem)] right-[calc(-50%+1.75rem)] top-[1.4rem] hidden h-px border-t border-dashed border-accent/30 lg:block" aria-hidden />
            )}
            <div className="flex h-full flex-col items-center rounded-2xl border border-border bg-panel p-5 text-center transition group-hover:-translate-y-0.5 group-hover:border-accent/30 group-hover:shadow-[0_12px_30px_-18px_rgba(93,22,255,0.45)]">
              <span className="relative z-10 flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-sm font-extrabold text-white shadow-md shadow-accent/30">{i + 1}</span>
              <div className="mt-4 text-sm font-bold leading-snug">{s.title}</div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink/55">{s.body}</p>
            </div>
          </Reveal>
        ))}
      </ol>

      <p className="relative mt-6 text-center text-[11px] text-ink/35">Kurgusal bir örnektir — gerçek bir müşteriye ya da siteye ait değildir.</p>
    </section>
  );
}
