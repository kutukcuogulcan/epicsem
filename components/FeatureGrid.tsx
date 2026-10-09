import { TOOL_ICONS } from "./ToolIcons";
import Reveal from "./marketing/Reveal";

/**
 * Özellik "bento" ızgarası — ilk kart geniş ve gradyanlı, diğerleri fareyi takip eden ışıklı
 * kartlar; kaydırınca sırayla belirir, üzerine gelince hafifçe yükselir.
 */
export default function FeatureGrid({ items }: { items: { title: string; body: string }[] }) {
  const [first, ...rest] = items;
  return (
    <section className="space-y-8">
      <Reveal className="mx-auto max-w-2xl text-center space-y-3">
        <span className="pill-outline bg-accent/5">ÖZELLİKLER</span>
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">İhtiyacın olan her şey, tek yerde</h2>
      </Reveal>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {first && (
          <Reveal
            variant="scale"
            className="sm:col-span-2 relative overflow-hidden rounded-3xl bg-gradient-to-br from-accent to-[#7c3aed] p-7 text-white shadow-xl shadow-accent/25"
          >
            <div className="pointer-events-none absolute inset-0 bg-grid-dark" aria-hidden />
            <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/15 blur-2xl animate-blob" aria-hidden />
            <div className="relative space-y-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-white">{TOOL_ICONS.check}</span>
              <div className="text-xl font-extrabold">{first.title}</div>
              <p className="max-w-lg text-white/80">{first.body}</p>
            </div>
          </Reveal>
        )}
        {rest.map((f, i) => {
          // Son satır 2 kartla kalacaksa son kartı genişlet → ızgara boşluksuz kapanır.
          const widen = i === rest.length - 1 && (rest.length - 1) % 3 === 2;
          return (
          <Reveal
            key={f.title}
            variant="scale"
            delay={((i + 1) % 3) * 90}
            spotlight
            className={`group rounded-3xl border border-border bg-panel p-6 transition-all duration-300 hover:-translate-y-1 hover:border-accent/30 hover:shadow-xl hover:shadow-accent/10 ${widen ? "lg:col-span-2" : ""}`}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-white">
              {TOOL_ICONS.check}
            </span>
            <div className="mt-4 font-bold">{f.title}</div>
            <p className="mt-1.5 text-sm text-ink/60">{f.body}</p>
          </Reveal>
          );
        })}
      </div>
    </section>
  );
}
