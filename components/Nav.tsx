import Link from "next/link";
import { DEMO_EMAIL, getCurrentUser, isOpenAccessEnabled } from "@/lib/auth";
import LogoutButton from "./LogoutButton";

const PRODUCT_GROUPS = [
  {
    title: "Analiz & Test",
    items: [
      { href: "/audit", label: "SEO + AXO Audit" },
      { href: "/geo", label: "GEO/AEO Visibility" },
      { href: "/gap", label: "Gap Analysis" },
    ],
  },
  {
    title: "Otomasyon",
    items: [
      { href: "/monitor", label: "AXO Monitoring" },
      { href: "/import", label: "Bulk Import" },
      { href: "/content", label: "Content Studio" },
    ],
  },
  {
    title: "Yönetim",
    items: [
      { href: "/clients", label: "Clients" },
      { href: "/prompts", label: "Claude Code Prompts" },
    ],
  },
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
        <Link href="/" className="font-semibold text-lg tracking-tight shrink-0">
          Epicsem <span className="text-accent">·</span>{" "}
          <span className="text-sm font-normal text-ink/50 hidden sm:inline">SEO + GEO/AEO</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm text-ink/70">
          <div className="relative group py-2">
            <button type="button" className="flex items-center gap-1 hover:text-accent transition-colors">
              Ürünler
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="mt-px opacity-50">
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity duration-150 absolute left-1/2 -translate-x-1/2 top-full pt-3 z-30">
              <div className="w-[560px] bg-panel border border-border rounded-xl shadow-lg p-6 grid grid-cols-3 gap-6">
                {PRODUCT_GROUPS.map((group) => (
                  <div key={group.title}>
                    <div className="text-xs font-semibold text-ink/40 uppercase tracking-wide mb-2">{group.title}</div>
                    <div className="space-y-1">
                      {group.items.map((item) => (
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
                ))}
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
            className="rounded-lg bg-accent text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Panele git
          </Link>
        </div>
      </div>
    </header>
  );
}
