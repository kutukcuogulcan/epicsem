import Breadcrumb from "./Breadcrumb";

/**
 * Shared header for the actual tool pages (/audit, /geo, /gap, /monitor,
 * /import, /content, /local, /clients, /prompts) — same gradient-blob
 * treatment as the homepage/pricing/feature-page heroes, just without a
 * screenshot next to it (these pages ARE the screenshot; showing one of
 * itself would be redundant). Keeps the page's actual form/tool UI directly
 * below, unlike FeatureHero which sits on a pure marketing page.
 */
export default function ToolPageHeader({
  breadcrumbLabel,
  title,
  body,
  children,
}: {
  breadcrumbLabel: string;
  title: string;
  body: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-accent/[0.06] via-geo/10 to-transparent px-6 sm:px-8 py-8 sm:py-10">
      <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-accent/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-20 -left-12 h-48 w-48 rounded-full bg-geo/20 blur-3xl" aria-hidden />
      <div className="relative space-y-2 max-w-3xl">
        <Breadcrumb items={[{ label: "Ana Sayfa", href: "/" }, { label: breadcrumbLabel }]} />
        <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
        <div className="text-ink/60 text-sm max-w-3xl">{body}</div>
        {children}
      </div>
    </section>
  );
}
