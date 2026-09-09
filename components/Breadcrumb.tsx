import Link from "next/link";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

/**
 * A quiet back-link above every tool page's title. This used to render a full
 * "Ana Sayfa / Section" trail, but every call site only ever passed two levels —
 * Home, then the exact same label the page's own <h1> restates two lines below —
 * which reads like a generic docs-site header, not the clean, single-purpose feel
 * of a real product page (e.g. Arvow: https://arvow.com, which never repeats a
 * page's own name in a crumb above it). So this only renders the link back to the
 * last item WITH an href (normally "Ana Sayfa") and drops the redundant current-page
 * segment — the h1 already says where you are. `items` still takes the full list so
 * a future page nested under a client/project (a real multi-level case) can pass
 * more than two entries and get a real trail again.
 */
export default function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  const trail = items.filter((item) => item.href);
  if (trail.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs font-medium text-ink/40">
      {trail.map((item, i) => (
        <span key={item.href} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-ink/20">/</span>}
          <Link href={item.href!} className="inline-flex items-center gap-1 hover:text-accent transition-colors">
            {i === 0 && (
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="opacity-60">
                <path d="M7.5 2.5L3 7l4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {item.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}
