import Reveal from "./marketing/Reveal";

/**
 * "Nasıl çalışır" — arvow'daki ADIM 1/2/3 bölümünün akan hali: ortada dikey zaman çizgisi,
 * adımlar sağa-sola sırayla kayarak gelir, numaralar nabız gibi atar.
 */
export default function FeatureSteps({
  heading,
  subheading,
  steps,
  note = "Kurgusal bir örnek üzerinden anlatılmıştır — aracın gerçek koşularda nasıl çalıştığını somut şekilde göstermek içindir.",
}: {
  heading: string;
  subheading: string;
  steps: { title: string; body: string }[];
  note?: string | null;
}) {
  const shown = steps.slice(0, 5);
  return (
    <section className="space-y-12">
      <Reveal className="mx-auto max-w-2xl text-center space-y-3">
        <span className="pill-outline bg-accent/5">NASIL ÇALIŞIR</span>
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">{heading}</h2>
        <p className="text-ink/60">{subheading}</p>
      </Reveal>

      <div className="relative mx-auto max-w-4xl">
        <div className="absolute left-6 md:left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-gradient-to-b from-accent via-geo to-transparent" aria-hidden />
        <ol className="space-y-10">
          {shown.map((s, i) => {
            const right = i % 2 === 1;
            return (
              <li key={s.title} className="relative grid grid-cols-1 md:grid-cols-2 md:gap-16">
                <span className="absolute left-6 md:left-1/2 top-2 flex h-12 w-12 -translate-x-1/2 items-center justify-center">
                  <span className="absolute inset-0 rounded-full bg-accent/30 animate-ping-soft" style={{ animationDelay: `${i * 0.4}s` }} />
                  <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-accent text-lg font-extrabold text-white shadow-lg shadow-accent/30">
                    {i + 1}
                  </span>
                </span>
                <Reveal
                  variant={right ? "right" : "left"}
                  delay={80}
                  spotlight
                  className={`ml-16 md:ml-0 rounded-2xl border border-border bg-panel p-6 shadow-sm transition-shadow hover:shadow-lg ${right ? "md:col-start-2" : "md:col-start-1 md:text-right"}`}
                >
                  <div className="text-xs font-bold uppercase tracking-wide text-accent">Adım {i + 1}</div>
                  <div className="mt-1.5 text-lg font-bold">{s.title}</div>
                  <p className="mt-2 text-sm text-ink/60">{s.body}</p>
                </Reveal>
              </li>
            );
          })}
        </ol>
      </div>
      {note && <p className="text-center text-xs text-ink/30">{note}</p>}
    </section>
  );
}
