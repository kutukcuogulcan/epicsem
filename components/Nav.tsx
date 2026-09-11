import Link from "next/link";
import { DEMO_EMAIL, getCurrentUser, isOpenAccessEnabled } from "@/lib/auth";
import LogoutButton from "./LogoutButton";
import { TOOL_ICONS } from "./ToolIcons";

// Mirrors the homepage's own "Tek panel, üç iş" grouping (Analiz & Test /
// Otomasyon / Yönetim) so the nav and the homepage tell the same story about
// how the tools are organized, instead of an unrelated "featured vs. other"
// split invented just for the menu.
const NAV_GROUPS = [
  {
    title: "Analiz & Test",
    items: [
      { href: "/audit", label: "SEO + AXO Audit", icon: "audit" },
      { href: "/geo", label: "GEO/AEO Visibility", icon: "geo" },
      { href: "/gap", label: "Gap Analysis", icon: "gap" },
      { href: "/article-writer", label: "Article Writer", icon: "article" },
    ],
  },
  {
    title: "Otomasyon",
    items: [
      { href: "/monitor", label: "AXO Monitoring", icon: "monitor" },
      { href: "/campaigns", label: "Kampanyalar", icon: "campaigns" },
      { href: "/import", label: "Bulk Import", icon: "import" },
      { href: "/content", label: "Content Studio", icon: "content" },
      { href: "/local", label: "Yerel İşletme (GBP)", icon: "local" },
    ],
  },
  {
    title: "Yönetim",
    items: [
      { href: "/clients", label: "Clients", icon: "clients" },
      { href: "/prompts", label: "Claude Code Prompts", icon: "prompts" },
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
            <div className="invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity duration-150 absolute left-0 top-full pt-3 z-30">
              <div className="w-[620px] bg-panel border border-border rounded-xl shadow-lg shadow-ink/[0.08] overflow-hidden">
                <div className="grid grid-cols-3 gap-6 p-5">
                  {NAV_GROUPS.map((group) => (
                    <div key={group.title}>
                      <div className="text-sm font-semibold text-ink/70 mb-1">{group.title}</div>
                      <div>
                        {group.items.map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            className="flex items-center gap-2.5 rounded-lg py-2 px-1.5 -mx-1.5 hover:bg-muted transition-colors group/item"
                          >
                            <span className="h-9 w-9 shrink-0 rounded-lg bg-muted text-ink/70 flex items-center justify-center group-hover/item:bg-accent/10 group-hover/item:text-accent transition-colors">
                              {TOOL_ICONS[item.icon]}
                            </span>
                            <span className="text-sm font-medium text-ink/80 group-hover/item:text-accent transition-colors">
                              {item.label}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <Link
                  href="/#tum-araclar"
                  className="flex items-center justify-between border-t border-border px-5 py-3 text-sm font-semibold hover:bg-muted transition-colors"
                >
                  Tüm araçları keşfet
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6h7M6.5 2.5L10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
          <Link href="/dashboard" className="hover:text-accent transition-colors">Panel</Link>
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
            href="/dashboard"
            className="rounded-lg bg-accent text-white px-4 py-2 text-sm font-bold hover:opacity-90 transition-opacity"
          >
            Panele git
          </Link>
        </div>
      </div>
    </header>
  );
}
