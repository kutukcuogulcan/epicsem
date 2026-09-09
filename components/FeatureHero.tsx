import Link from "next/link";
import Breadcrumb from "./Breadcrumb";
import BrowserFrame from "./BrowserFrame";

/**
 * Shared hero for the /features/* landing pages — gradient-blob container,
 * two-column layout (copy left, real product screenshot right), one accent-
 * colored clause in the headline. Same visual language as the homepage hero
 * and the "SHOWCASES" sections there (see app/page.tsx), so a visitor who
 * lands directly on a feature page from search still recognizes the site.
 * The image is always a real screenshot of this app's own live page — see
 * BrowserFrame's own comment for why that matters here.
 */
export default function FeatureHero({
  breadcrumbLabel,
  eyebrow,
  title,
  body,
  primaryCta,
  secondaryCta,
  image,
}: {
  breadcrumbLabel: string;
  eyebrow: string;
  title: React.ReactNode;
  body: React.ReactNode;
  primaryCta: { href: string; label: string };
  secondaryCta?: { href: string; label: string };
  image: { src: string; alt: string; path: string; width: number; height: number };
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-accent/[0.06] via-geo/10 to-transparent px-6 sm:px-10 py-12 sm:py-16">
      <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-accent/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-geo/20 blur-3xl" aria-hidden />
      <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-12 items-center">
        <div className="space-y-4">
          <Breadcrumb items={[{ label: "Ana Sayfa", href: "/" }, { label: breadcrumbLabel }]} />
          <span className="pill-outline bg-accent/5">{eyebrow}</span>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight max-w-xl">{title}</h1>
          <p className="text-ink/60 text-base max-w-xl">{body}</p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href={primaryCta.href} className="rounded-lg bg-accent text-white px-6 py-3 text-sm font-bold hover:opacity-90 transition-opacity">
              {primaryCta.label}
            </Link>
            {secondaryCta && (
              <Link href={secondaryCta.href} className="rounded-lg border border-border bg-panel/60 px-6 py-3 text-sm font-medium hover:bg-muted transition-colors">
                {secondaryCta.label}
              </Link>
            )}
          </div>
        </div>
        <BrowserFrame src={image.src} alt={image.alt} path={image.path} width={image.width} height={image.height} priority />
      </div>
    </section>
  );
}
