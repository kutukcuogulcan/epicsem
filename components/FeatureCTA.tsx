import Link from "next/link";

/** Closing CTA block for the /features/* pages — same accent-blob treatment as the
 * pricing/homepage heroes, so the last thing on the page matches the first. */
export default function FeatureCTA({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta: { href: string; label: string };
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-accent text-white px-6 sm:px-10 py-10 text-center space-y-4">
      <div className="pointer-events-none absolute -top-16 -left-10 h-48 w-48 rounded-full bg-white/10 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-20 -right-10 h-56 w-56 rounded-full bg-white/10 blur-3xl" aria-hidden />
      <h2 className="relative text-xl sm:text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="relative text-white/80 max-w-xl mx-auto text-sm">{body}</p>
      <Link href={cta.href} className="relative inline-block rounded-lg bg-white text-accent px-6 py-3 text-sm font-medium hover:opacity-90 transition-opacity">
        {cta.label}
      </Link>
    </div>
  );
}
