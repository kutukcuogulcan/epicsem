import Link from "next/link";
import Breadcrumb from "./Breadcrumb";
import BrowserFrame from "./BrowserFrame";
import Reveal from "./marketing/Reveal";
import EngineMarquee from "./marketing/EngineMarquee";

/**
 * /features/* hero — arvow.com / peec.ai tarzı: tam genişlik ızgara zemin + kayan renk
 * lekeleri, ortalanmış büyük başlık (vurgulu kısım animasyonlu gradyan), CTA'lar, altında
 * kaydırınca 3B eğimden düzleşen gerçek ürün ekran görüntüsü ve etrafında süzülen katman
 * etiketleri; en altta AI motorları şeridi. Görsel her zaman uygulamanın kendi gerçek
 * ekran görüntüsü (bkz. BrowserFrame).
 */
const FLOAT_CHIPS = [
  { label: "SEO", className: "left-[-1rem] top-[18%]", color: "#16a34a", delay: "0s" },
  { label: "AXO", className: "right-[-1.25rem] top-[8%]", color: "#5d16ff", delay: "1.2s" },
  { label: "AEO", className: "left-[6%] bottom-[-1rem]", color: "#ec4899", delay: "2.1s" },
  { label: "GEO", className: "right-[4%] bottom-[-0.75rem]", color: "#a78bfa", delay: "0.6s" },
];

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
    <section className="full-bleed relative -mt-8 overflow-hidden pt-14 pb-16">
      {/* Zemin: ızgara + yavaş kayan renk lekeleri */}
      <div className="pointer-events-none absolute inset-0 bg-grid fade-mask-b" aria-hidden />
      <div className="pointer-events-none absolute -top-24 left-[10%] h-80 w-80 rounded-full bg-accent/25 blur-3xl animate-blob" aria-hidden />
      <div className="pointer-events-none absolute top-40 right-[8%] h-96 w-96 rounded-full bg-pink-300/25 blur-3xl animate-blob" style={{ animationDelay: "-6s" }} aria-hidden />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-geo/30 blur-3xl animate-blob" style={{ animationDelay: "-11s" }} aria-hidden />

      <div className="relative mx-auto max-w-6xl px-4 space-y-12">
        <div className="mx-auto max-w-3xl text-center space-y-6">
          <Reveal className="flex justify-center">
            <Breadcrumb items={[{ label: "Ana Sayfa", href: "/" }, { label: breadcrumbLabel }]} />
          </Reveal>
          <Reveal delay={60}>
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-panel/80 px-4 py-1.5 text-xs font-bold tracking-wide text-accent shadow-sm backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-accent animate-ping-soft" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
              {eyebrow}
            </span>
          </Reveal>
          <Reveal delay={120} as="h1" className="hero-title text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.08]">
            {title}
          </Reveal>
          <Reveal delay={200} as="p" className="mx-auto max-w-2xl text-base sm:text-lg text-ink/60">
            {body}
          </Reveal>
          <Reveal delay={280} className="flex flex-wrap justify-center gap-3 pt-1">
            <Link
              href={primaryCta.href}
              className="group inline-flex items-center gap-2 rounded-xl bg-accent px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-accent/30 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-accent/40"
            >
              {primaryCta.label}
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
            {secondaryCta && (
              <Link
                href={secondaryCta.href}
                className="rounded-xl border border-border bg-panel/80 px-7 py-3.5 text-sm font-semibold backdrop-blur transition-all hover:-translate-y-0.5 hover:border-ink/20"
              >
                {secondaryCta.label}
              </Link>
            )}
          </Reveal>
        </div>

        <div className="relative mx-auto max-w-5xl">
          <div className="pointer-events-none absolute -inset-x-10 top-10 bottom-0 rounded-[3rem] bg-gradient-to-r from-accent/30 via-geo/30 to-pink-300/30 blur-3xl" aria-hidden />
          <Reveal variant="tilt" delay={150} className="relative">
            <BrowserFrame src={image.src} alt={image.alt} path={image.path} width={image.width} height={image.height} priority />
          </Reveal>
          {FLOAT_CHIPS.map((c) => (
            <span
              key={c.label}
              className={`absolute hidden md:inline-flex items-center gap-1.5 rounded-full border border-border bg-panel px-3.5 py-1.5 text-xs font-bold shadow-lg animate-float ${c.className}`}
              style={{ animationDelay: c.delay }}
              aria-hidden
            >
              <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
              {c.label}
            </span>
          ))}
        </div>

        <Reveal delay={100}>
          <EngineMarquee />
        </Reveal>
      </div>
    </section>
  );
}
