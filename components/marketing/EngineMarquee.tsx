/**
 * Sonsuz kayan şerit — peec.ai'daki logo bandının Epicsem karşılığı. Müşteri logosu
 * uydurmak yerine aracın gerçekten test ettiği AI motorlarını ve kapsadığı katmanları
 * gösterir. İçerik iki kez basılır, CSS %50 kaydırır → dikişsiz döngü.
 */
const ITEMS: { label: string; color: string }[] = [
  { label: "ChatGPT", color: "#10a37f" },
  { label: "Claude", color: "#d97757" },
  { label: "Gemini", color: "#4285f4" },
  { label: "Perplexity", color: "#20b8cd" },
  { label: "Google AI Overviews", color: "#fbbc05" },
  { label: "DeepSeek", color: "#4d6bfe" },
  { label: "Grok", color: "#0f172a" },
  { label: "Copilot", color: "#7c3aed" },
  { label: "SEO", color: "#16a34a" },
  { label: "AXO", color: "#5d16ff" },
  { label: "AEO", color: "#ec4899" },
  { label: "GEO", color: "#a78bfa" },
];

export default function EngineMarquee({ title = "Markanı tek panelden takip ettiğin motorlar ve katmanlar" }: { title?: string }) {
  const row = [...ITEMS, ...ITEMS];
  return (
    <section className="space-y-4">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-ink/40">{title}</p>
      <div className="marquee-mask overflow-hidden">
        <div className="animate-marquee flex w-max gap-3 py-1">
          {row.map((it, i) => (
            <span
              key={`${it.label}-${i}`}
              aria-hidden={i >= ITEMS.length}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-panel px-4 py-2 text-sm font-semibold text-ink/70 shadow-sm"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: it.color }} />
              {it.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
