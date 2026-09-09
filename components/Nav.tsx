import Link from "next/link";
import { DEMO_EMAIL, getCurrentUser, isOpenAccessEnabled } from "@/lib/auth";
import LogoutButton from "./LogoutButton";

// Every item having equal weight (3 columns × equal paragraphs) read as one flat wall
// of text — a first-time visitor couldn't tell what actually matters. Instead: the two
// headline products (the ones the hero copy itself sells — classic audit + AI-engine
// visibility) get a short one-line pitch and a badge; the rest are supporting tools a
// visitor can find but doesn't need explained up front — plain links, homepage has more.
const FEATURED_PRODUCTS = [
  { href: "/geo", badge: "G", label: "GEO/AEO Visibility", body: "Markan ChatGPT, Claude, Gemini'de görünüyor mu?" },
  { href: "/audit", badge: "A", label: "SEO + AXO Audit", body: "Sitenin Google'da ve AI'da görünürlüğünü tara." },
];

const OTHER_TOOLS = [
  { href: "/gap", label: "Gap Analysis" },
  { href: "/monitor", label: "AXO Monitoring" },
  { href: "/import", label: "Bulk Import" },
  { href: "/content", label: "Content Studio" },
  { href: "/clients", label: "Clients" },
  { href: "/prompts", label: "Claude Code Prompts" },
];

/**
 * Site-style top nav — logo, a hover mega-menu grouping every tool page (same pages
 * as before, just organized like a real product's nav instead of one flat row),
 * Pricing, and a Dashboard CTA. Pure-CSS hover dropdown (`group`/`group-hover`) so
 * this can stay a server component; no client-side interactivity needed for it.
 */
export default async function Nav() {
  const user = await getCurrentUser();
  const isDemoFallback = isOpenAccessEnabled() && user?.email === DEMO_EMAIL;

  return (
    <header className="border-b border-border bg-panel/80 backdrop-blur sticky top-0 z-20">
      <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white text-sm font-extrabold">
            E
          </span>
          <span className="font-extrabold text-lg tracking-tight">Epicsem</span>
          <span className="text-sm font-medium text-ink/40 hidden sm:inline">SEO + GEO/AEO</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-ink/70">
          <div className="relative group py-2">
            <button type="button" className="flex items-center gap-1 hover:text-accent transition-colors">
              Ürünler
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="mt-px opacity-50">
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity duration-150 absolute left-1/2 -translate-x-1/2 top-full pt-3 z-30">
              <div className="w-[520px] bg-panel border border-border rounded-xl shadow-lg p-5 flex gap-5">
                <div className="flex-1 space-y-1.5">
                  <div className="text-xs font-semibold text-ink/40 uppercase tracking-wide mb-1.5">Öne çıkanlar</div>
                  {FEATURED_PRODUCTS.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-start gap-3 rounded-lg p-2 -mx-2 hover:bg-muted transition-colors group/item"
                    >
                      <div className="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-accent/10 text-accent flex items-center justify-center text-sm font-semibold">
                        {item.badge}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-ink group-hover/item:text-accent transition-colors">
                          {item.label}
                        </div>
                        <p className="mt-0.5 text-xs text-ink/50 leading-snug">{item.body}</p>
                      </div>
                    </Link>
                  ))}
                </div>
                <div className="w-px bg-border shrink-0" />
                <div className="w-40 shrink-0">
                  <div className="text-xs font-semibold text-ink/40 uppercase tracking-wide mb-1.5">Diğer araçlar</div>
                  <div className="space-y-1">
                    {OTHER_TOOLS.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="block text-sm py-1 text-ink/70 hover:text-accent transition-colors"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <Link href="/pricing" className="hover:text-accent transition-colors">Fiyatlandırma</Link>
          <Link href="/#nasil-calisir" className="hover:text-accent transition-colors">Nasıl çalışır</Link>
        </nav>

        <div className="flex items-center gap-4 shrink-0">
          {isDemoFallback ? (
            <div className="hidden lg:flex items-center gap-3 text-xs">
              <span className="text-warn font-medium">Demo modu · giriş şart değil</span>
              <Link href="/login" className="text-accent hover:underline">Hesapla gir</Link>
            </div>
          ) : user ? (
            <div className="hidden lg:flex items-center gap-3 text-xs">
              <span className="text-ink/50">{user.email}</span>
              <LogoutButton />
            </div>
          ) : (
            <Link href="/login" className="hidden lg:inline text-sm text-accent hover:underline">Giriş yap</Link>
          )}
          <Link
            href="/audit"
            className="rounded-lg bg-accent text-white px-4 py-2 text-sm font-bold hover:opacity-90 transition-opacity"
          >
            Panele git
          </Link>
        </div>
      </div>
    </header>
  );
}
