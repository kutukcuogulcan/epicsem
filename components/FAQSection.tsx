import Link from "next/link";
import Reveal from "./marketing/Reveal";

export interface FAQItem {
  q: string;
  a: string;
}

/**
 * SSS (arvow.com tarzı): ortalanmış başlık, tek kart içinde ince çizgilerle ayrılmış
 * akordeon satırları, altta "sorunun cevabı yok mu?" kutusu.
 */
export default function FAQSection({ items, title = "Sık sorulan sorular" }: { items: FAQItem[]; title?: string }) {
  if (items.length === 0) return null;
  return (
    <section className="mx-auto w-full max-w-3xl space-y-8 py-4">
      <Reveal className="space-y-2 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/5 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-accent">SSS</span>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
        <p className="text-sm text-ink/50">Aklına takılan bir şey mi var? En çok sorulanlar burada.</p>
      </Reveal>

      <Reveal variant="scale">
        <div className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-panel shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          {items.map((item) => (
            <details key={item.q} className="group px-5 transition-colors open:bg-accent/[0.03] sm:px-7">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[15px] font-semibold">
                <span>{item.q}</span>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-ink/50 transition-all duration-300 group-open:rotate-45 group-open:border-accent group-open:bg-accent group-open:text-white">
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M8 3v10M3 8h10" />
                  </svg>
                </span>
              </summary>
              <p className="-mt-1 pb-5 pr-12 text-sm leading-relaxed text-ink/60">{item.a}</p>
            </details>
          ))}
        </div>
      </Reveal>

      <Reveal>
        <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-dashed border-border bg-panel/60 px-5 py-4 text-center sm:flex-row sm:text-left">
          <div>
            <div className="text-sm font-bold">Sorunun cevabı burada yok mu?</div>
            <p className="text-xs text-ink/50">SEO Asistanı'na sitene özel sorabilirsin — ücretsiz, anında cevap.</p>
          </div>
          <Link href="/assistant" className="shrink-0 rounded-xl bg-ink px-4 py-2 text-xs font-bold text-white hover:opacity-90">
            Asistana sor →
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
