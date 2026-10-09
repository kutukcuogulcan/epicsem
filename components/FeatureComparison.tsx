import { TOOL_ICONS } from "./ToolIcons";
import Reveal from "./marketing/Reveal";

/**
 * "Klasik araçlar vs. Epicsem" — iki panel, ortada VS rozeti; maddeler kaydırınca sırayla
 * belirir. Sahte "sonra" ekran görüntüsü yok, dürüst metin karşılaştırması.
 */
export default function FeatureComparison({
  without,
  withItems,
}: {
  without: { title: string; items: string[] };
  withItems: { title: string; items: string[] };
}) {
  return (
    <section className="space-y-8">
      <Reveal className="mx-auto max-w-2xl text-center space-y-3">
        <span className="pill-outline bg-accent/5">FARK</span>
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Eski yöntem bir yana, Epicsem bir yana</h2>
      </Reveal>
      <div className="relative grid grid-cols-1 md:grid-cols-2 gap-5">
        <Reveal variant="left" className="rounded-3xl border border-border bg-panel/70 p-7 space-y-5">
          <div className="text-sm font-bold uppercase tracking-wide text-ink/40">{without.title}</div>
          <ul className="space-y-3.5">
            {without.items.map((item, i) => (
              <Reveal as="li" key={item} delay={120 + i * 90} className="flex items-start gap-3 text-sm text-ink/55">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                    <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                  </svg>
                </span>
                <span className="line-through decoration-ink/20">{item}</span>
              </Reveal>
            ))}
          </ul>
        </Reveal>

        <span className="absolute left-1/2 top-1/2 z-10 hidden md:flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-paper bg-ink text-xs font-extrabold text-white shadow-xl">
          VS
        </span>

        <Reveal variant="right" delay={80} className="relative rounded-3xl p-[1.5px] bg-gradient-to-br from-accent via-geo to-pink-400 shadow-2xl shadow-accent/15">
          <div className="h-full rounded-[calc(1.5rem-1.5px)] bg-panel p-7 space-y-5">
            <div className="text-sm font-bold uppercase tracking-wide text-accent">{withItems.title}</div>
            <ul className="space-y-3.5">
              {withItems.items.map((item, i) => (
                <Reveal as="li" key={item} delay={220 + i * 90} className="flex items-start gap-3 text-sm font-medium text-ink/85">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-white">{TOOL_ICONS.check}</span>
                  {item}
                </Reveal>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
