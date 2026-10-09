import Breadcrumb from "./Breadcrumb";
import Reveal from "./marketing/Reveal";

/**
 * Araç sayfalarının (/audit, /geo, /gap, /monitor, /import, /content, /local, /clients,
 * /prompts …) başlığı — arvow/peec tarzı canlı hero: ızgara zemin, kayan renk lekeleri,
 * nabız atan rozet, son kelimesi akan gradyanlı büyük başlık ve sağda SEO/AXO/AEO/GEO
 * katmanlarının etrafında döndüğü animasyonlu "radar". Formun kendisi sayfada hemen altta.
 */
const ORBIT = [
  { label: "SEO", color: "#16a34a", pos: "left-[6%] top-[14%]", delay: "0s" },
  { label: "AXO", color: "#5d16ff", pos: "right-[4%] top-[22%]", delay: "1.4s" },
  { label: "AEO", color: "#ec4899", pos: "left-[12%] bottom-[10%]", delay: "2.3s" },
  { label: "GEO", color: "#a78bfa", pos: "right-[10%] bottom-[6%]", delay: "0.7s" },
];

export default function ToolPageHeader({
  breadcrumbLabel,
  title,
  body,
  children,
  eyebrow = "SEO · AXO · AEO · GEO",
}: {
  breadcrumbLabel: string;
  title: string;
  body: React.ReactNode;
  children?: React.ReactNode;
  eyebrow?: string;
}) {
  const words = title.trim().split(" ");
  const last = words.pop();
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-border bg-panel px-6 sm:px-10 py-10 sm:py-12">
      <div className="pointer-events-none absolute inset-0 bg-grid fade-mask-b opacity-80" aria-hidden />
      <div className="pointer-events-none absolute -top-24 -left-10 h-72 w-72 rounded-full bg-accent/20 blur-3xl animate-blob" aria-hidden />
      <div className="pointer-events-none absolute -bottom-28 right-1/4 h-72 w-72 rounded-full bg-pink-300/25 blur-3xl animate-blob" style={{ animationDelay: "-7s" }} aria-hidden />
      <div className="pointer-events-none absolute top-0 right-0 h-64 w-64 rounded-full bg-geo/25 blur-3xl animate-blob" style={{ animationDelay: "-12s" }} aria-hidden />

      <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8 items-center">
        <div className="space-y-4 max-w-3xl">
          <Reveal>
            <Breadcrumb items={[{ label: "Ana Sayfa", href: "/" }, { label: breadcrumbLabel }]} />
          </Reveal>
          <Reveal delay={60}>
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-panel/80 px-3.5 py-1 text-[11px] font-bold tracking-wide text-accent shadow-sm backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-accent animate-ping-soft" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
              {eyebrow}
            </span>
          </Reveal>
          <Reveal delay={120} as="h1" className="hero-title text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.1]">
            {words.join(" ")} <span className="text-accent">{last}</span>
          </Reveal>
          <Reveal delay={180} className="text-ink/60 text-base max-w-2xl">
            {body}
          </Reveal>
          {children && <Reveal delay={240}>{children}</Reveal>}
        </div>

        {/* Dekoratif radar: katmanlar markanın etrafında döner */}
        <Reveal variant="scale" delay={200} className="relative hidden lg:block h-[260px]" aria-hidden>
          <div className="absolute inset-0 flex items-center justify-center">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="absolute rounded-full border border-accent/20"
                style={{ width: `${110 + i * 70}px`, height: `${110 + i * 70}px` }}
              />
            ))}
            <span className="absolute h-24 w-24 rounded-full bg-accent/20 animate-ping-soft" />
            <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-[#7c3aed] text-2xl font-extrabold text-white shadow-xl shadow-accent/40">
              E
            </span>
          </div>
          {ORBIT.map((o) => (
            <span
              key={o.label}
              className={`absolute ${o.pos} inline-flex items-center gap-1.5 rounded-full border border-border bg-panel px-3 py-1.5 text-xs font-bold shadow-lg animate-float`}
              style={{ animationDelay: o.delay }}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: o.color }} />
              {o.label}
            </span>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
