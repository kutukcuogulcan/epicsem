import Reveal from "./marketing/Reveal";

export interface FAQItem {
  q: string;
  a: string;
}

/** Araç/ürün sayfası SSS — solda büyük başlık, sağda kayarak gelen akordeon kartları. */
export default function FAQSection({ items, title = "Sık sorulanlar" }: { items: FAQItem[]; title?: string }) {
  if (items.length === 0) return null;
  return (
    <section className="grid grid-cols-1 lg:grid-cols-[0.8fr_1.2fr] gap-8 pt-4">
      <Reveal variant="left" className="space-y-3 lg:sticky lg:top-24 self-start">
        <span className="pill-outline bg-accent/5">SSS</span>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{title}</h2>
        <p className="text-sm text-ink/50">Aklına takılan bir şey mi var? En çok sorulanlar burada.</p>
      </Reveal>
      <div className="space-y-2.5">
        {items.map((item, i) => (
          <Reveal key={item.q} delay={i * 70}>
            <details className="group rounded-2xl border border-border bg-panel px-5 py-4 transition-all hover:border-accent/30 open:border-accent/40 open:shadow-lg open:shadow-accent/5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold">
                {item.q}
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-ink/50 transition-all group-open:rotate-45 group-open:bg-accent group-open:text-white">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm text-ink/60 leading-relaxed">{item.a}</p>
            </details>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
