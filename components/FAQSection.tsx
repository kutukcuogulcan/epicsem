export interface FAQItem {
  q: string;
  a: string;
}

/**
 * Per-tool FAQ accordion — same <details>/<summary> pattern as the homepage's "Sık
 * sorulanlar" section, reused here so each tool page can answer the "ne işe yarar,
 * neden buna ihtiyacım var" questions a first-time visitor has before they've run
 * anything, without cluttering the working area above it.
 */
export default function FAQSection({ items, title = "Sık sorulanlar" }: { items: FAQItem[]; title?: string }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-3 pt-2">
      <h2 className="font-medium text-sm">{title}</h2>
      <div className="divide-y divide-border border-t border-b border-border">
        {items.map((item) => (
          <details key={item.q} className="group py-3">
            <summary className="flex items-center justify-between gap-4 cursor-pointer list-none text-sm font-medium">
              {item.q}
              <span className="text-ink/30 group-open:rotate-45 transition-transform text-lg leading-none shrink-0">+</span>
            </summary>
            <p className="mt-2 text-sm text-ink/60">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
