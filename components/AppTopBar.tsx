"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Usage {
  plan: string;
  planLabel?: string;
  demoMode: boolean;
  engineQueries: { used: number; limit: number };
}

/** Thin bar above every app page: current plan + this month's engine usage + upgrade. */
export default function AppTopBar() {
  const [u, setU] = useState<Usage | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = () =>
      fetch("/api/usage")
        .then((r) => (r.ok ? r.json() : null))
        .then(setU)
        .catch(() => {})
        .finally(() => setLoaded(true));
    load();
    window.addEventListener("epicsem:usage-changed", load);
    return () => window.removeEventListener("epicsem:usage-changed", load);
  }, []);

  // Oturum yok (ör. ana sayfa sidebar'lı açıldığında): gezinme + giriş/kayıt.
  if (!u && loaded)
    return (
      <div className="hidden md:flex h-14 items-center justify-end gap-6 border-b border-border bg-panel px-6 text-sm">
        <Link href="/#nasil-calisir" className="text-ink/60 hover:text-ink">Nasıl çalışır</Link>
        <Link href="/#tum-araclar" className="text-ink/60 hover:text-ink">Araçlar</Link>
        <Link href="/pricing" className="text-ink/60 hover:text-ink">Fiyatlar</Link>
        <Link href="/login" className="font-semibold text-ink/80 hover:text-ink">Giriş yap</Link>
        <Link href="/login?mode=signup" className="rounded-lg bg-accent text-white px-3.5 py-1.5 text-xs font-bold hover:opacity-90">
          Ücretsiz başla
        </Link>
      </div>
    );

  if (!u) return <div className="hidden md:block h-14 border-b border-border bg-panel" />;

  const { used, limit } = u.engineQueries;
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const barTone = pct >= 90 ? "bg-danger" : pct >= 70 ? "bg-warn" : "bg-accent";

  return (
    <div className="hidden md:flex h-14 items-center justify-end gap-4 border-b border-border bg-panel px-6">
      {u.demoMode && <span className="badge badge-warning">Demo modu</span>}
      <Link href="/billing" className="flex items-center gap-3 group" title="Bu ayki AI motor sorgusu kullanımı">
        <div className="text-right leading-tight">
          <div className="text-[11px] text-ink/40">AI motor sorgusu</div>
          <div className="text-xs font-semibold text-ink/80">
            {used.toLocaleString("tr-TR")} / {limit.toLocaleString("tr-TR")}
          </div>
        </div>
        <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
          <div className={`h-full ${barTone}`} style={{ width: `${pct}%` }} />
        </div>
      </Link>
      <span className="pill-outline">{u.planLabel ?? u.plan}</span>
      {u.plan !== "agency" && (
        <Link href="/billing" className="rounded-lg bg-accent text-white px-3.5 py-1.5 text-xs font-bold hover:opacity-90">
          Yükselt
        </Link>
      )}
    </div>
  );
}
