import Link from "next/link";
import Reveal from "./marketing/Reveal";

/** Kapanış CTA — koyu zemin, ızgara, kayan renk lekeleri; sayfanın son "vuruşu". */
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
    <Reveal variant="scale" className="relative overflow-hidden rounded-[2rem] bg-ink px-6 sm:px-12 py-16 text-center text-white">
      <div className="pointer-events-none absolute inset-0 bg-grid-dark" aria-hidden />
      <div className="pointer-events-none absolute -top-24 -left-16 h-72 w-72 rounded-full bg-accent/50 blur-3xl animate-blob" aria-hidden />
      <div className="pointer-events-none absolute -bottom-28 -right-10 h-80 w-80 rounded-full bg-pink-500/30 blur-3xl animate-blob" style={{ animationDelay: "-8s" }} aria-hidden />
      <div className="relative space-y-5">
        <h2 className="mx-auto max-w-2xl text-3xl sm:text-4xl font-extrabold tracking-tight">{title}</h2>
        <p className="mx-auto max-w-xl text-white/70">{body}</p>
        <Link
          href={cta.href}
          className="group inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-sm font-bold text-ink shadow-xl transition-all hover:-translate-y-0.5"
        >
          {cta.label}
          <span className="transition-transform group-hover:translate-x-1">→</span>
        </Link>
      </div>
    </Reveal>
  );
}
