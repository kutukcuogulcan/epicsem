"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV_GROUPS } from "@/lib/nav-groups";
import { TOOL_ICONS } from "./ToolIcons";
import LogoutButton from "./LogoutButton";
import ProjectSwitcher from "./ProjectSwitcher";

const Chevron = ({ open }: { open: boolean }) => (
  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className={`transition-transform ${open ? "" : "-rotate-90"}`}>
    <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function SidebarClient({ email, isDemoFallback }: { email: string | null; isDemoFallback: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setSearch(window.location.search);
  }, [pathname]);
  useEffect(() => {
    try {
      setClosed(JSON.parse(localStorage.getItem("epicsem.nav.closed") ?? "{}"));
    } catch {
      /* yoksay */
    }
  }, []);
  const toggle = (t: string) =>
    setClosed((c) => {
      const n = { ...c, [t]: !c[t] };
      try {
        localStorage.setItem("epicsem.nav.closed", JSON.stringify(n));
      } catch {
        /* yoksay */
      }
      return n;
    });

  // Sorgu parametreli bağlantılar (ör. /local?tab=reviews) yalnızca o parametre varken aktif.
  const allHrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
  const isActive = (href: string) => {
    const [p, q] = href.split("?");
    if (!(pathname === p || pathname.startsWith(`${p}/`))) return false;
    if (q) return search.includes(q);
    // Aynı yolun sorgulu bir kardeşi aktifse bu aktif değil.
    return !allHrefs.some((h) => h !== href && h.startsWith(`${p}?`) && search.includes(h.split("?")[1]));
  };
  const chatActive = pathname === "/assistant" || pathname.startsWith("/assistant/");

  const linkClass = (active: boolean) =>
    `flex items-center gap-2.5 rounded-md px-2 py-[7px] text-[13.5px] transition-colors ${
      active ? "bg-muted font-semibold text-ink" : "text-ink/70 hover:bg-muted/70 hover:text-ink"
    }`;

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-4 shrink-0">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white text-sm font-extrabold">
            E
          </span>
          <span className="font-extrabold text-lg tracking-tight">Epicsem</span>
        </Link>
      </div>

      {/* Gezin / Sohbet sekmeleri */}
      <div className="mx-3 mb-2 grid grid-cols-2 border-b border-border text-[13px]">
        <Link href="/dashboard" onClick={() => setOpen(false)} className={`-mb-px flex items-center justify-center gap-1.5 border-b-2 pb-2 ${!chatActive ? "border-ink font-semibold text-ink" : "border-transparent text-ink/50 hover:text-ink"}`}>
          {TOOL_ICONS.overview}
          Gezin
        </Link>
        <Link href="/assistant" onClick={() => setOpen(false)} className={`-mb-px flex items-center justify-center gap-1.5 border-b-2 pb-2 ${chatActive ? "border-ink font-semibold text-ink" : "border-transparent text-ink/50 hover:text-ink"}`}>
          {TOOL_ICONS.chat}
          Sohbet
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-3">
        <Link href="/dashboard" onClick={() => setOpen(false)} className={linkClass(pathname === "/dashboard")}>
          <span className="text-ink/60">{TOOL_ICONS.overview}</span>
          Genel Bakış
        </Link>

        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <button type="button" onClick={() => toggle(group.title)} className="flex w-full items-center gap-1 px-2 pb-1 text-[12px] font-medium text-ink/45 hover:text-ink/70">
              {group.title}
              <Chevron open={!closed[group.title]} />
            </button>
            {!closed[group.title] && (
              <div className="space-y-px">
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => {
                        setOpen(false);
                        setSearch(item.href.includes("?") ? `?${item.href.split("?")[1]}` : "");
                      }}
                      className={linkClass(active)}
                    >
                      <span className={active ? "text-ink" : "text-ink/55"}>{TOOL_ICONS[item.icon]}</span>
                      <span className="truncate">{item.label}</span>
                      {item.badge && <span className="ml-auto rounded bg-accent/10 px-1.5 py-px text-[9px] font-bold tracking-wide text-accent">{item.badge}</span>}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="border-t border-border px-3 pt-3 shrink-0">
        <ProjectSwitcher />
      </div>
      <div className="px-4 py-3 space-y-2 shrink-0">
        <Link
          href="/billing"
          onClick={() => setOpen(false)}
          className={`${linkClass(isActive("/billing"))} text-xs`}
        >
          Plan ve faturalandırma
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

      <aside className="hidden md:flex md:w-60 md:shrink-0 md:flex-col md:border-r md:border-border md:bg-panel md:h-screen md:sticky md:top-0">
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
