"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV_GROUPS } from "@/lib/nav-groups";
import { TOOL_ICONS } from "./ToolIcons";
import LogoutButton from "./LogoutButton";

const OverviewIcon = (
  <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="2" width="6" height="6" rx="1.2" />
    <rect x="10" y="2" width="6" height="6" rx="1.2" />
    <rect x="2" y="10" width="6" height="6" rx="1.2" />
    <rect x="10" y="10" width="6" height="6" rx="1.2" />
  </svg>
);

export default function SidebarClient({ email, isDemoFallback }: { email: string | null; isDemoFallback: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const linkClass = (active: boolean) =>
    `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
      active ? "bg-accent/10 text-accent" : "text-ink/70 hover:bg-muted"
    }`;

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-4 border-b border-border shrink-0">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white text-sm font-extrabold">
            E
          </span>
          <span className="font-extrabold text-lg tracking-tight">Epicsem</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        <Link href="/dashboard" onClick={() => setOpen(false)} className={`${linkClass(isActive("/dashboard"))} font-semibold`}>
          <span className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">{OverviewIcon}</span>
          Panel
        </Link>

        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <div className="px-2.5 text-xs font-semibold uppercase tracking-wide text-ink/35 mb-1.5">{group.title}</div>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={linkClass(isActive(item.href))}>
                  <span className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    {TOOL_ICONS[item.icon]}
                  </span>
                  <span className="truncate">{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-border px-4 py-3 space-y-2 shrink-0">
        <Link href="/pricing" className="text-xs text-ink/50 hover:text-accent block">
          Fiyatlandırma
        </Link>
        {isDemoFallback ? (
          <div className="text-xs">
            <span className="text-warn font-medium">Demo modu</span>
            <Link href="/login" className="text-accent hover:underline ml-2">
              Hesapla gir
            </Link>
          </div>
        ) : email ? (
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-ink/50 truncate">{email}</span>
            <LogoutButton />
          </div>
        ) : (
          <Link href="/login" className="text-xs text-accent hover:underline">
            Giriş yap
          </Link>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-panel/90 backdrop-blur px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white text-sm font-extrabold">
            E
          </span>
          <span className="font-extrabold text-lg tracking-tight">Epicsem</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Menüyü aç"
          className="h-9 w-9 flex items-center justify-center rounded-lg border border-border text-ink/60"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2.5 5h13M2.5 9h13M2.5 13h13" />
          </svg>
        </button>
      </div>

      <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:border-r md:border-border md:bg-panel md:h-screen md:sticky md:top-0">
        {content}
      </aside>

      {open && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 bg-panel shadow-lg overflow-y-auto">{content}</aside>
        </div>
      )}
    </>
  );
}
