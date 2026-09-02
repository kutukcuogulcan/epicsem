import Link from "next/link";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

/**
 * Thin trail above every tool page's title — "Ana Sayfa / Section" — the piece the
 * homepage-vs-tool-page structure was missing when compared against a real product
 * dashboard (e.g. Arvow: https://arvow.com). Deliberately minimal: no page needs more
 * than two levels today, but items accepts more (e.g. a client name) once /geo etc.
 * are opened from a specific client's page.
 */
export default function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-ink/40">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-ink/20">/</span>}
            {item.href && !isLast ? (
              <Link href={item.href} className="hover:text-accent transition-colors">
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? "text-ink/60 font-medium" : ""}>{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
