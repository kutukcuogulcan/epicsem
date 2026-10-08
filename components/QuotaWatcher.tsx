"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Mounted once in the app shell. Wraps window.fetch so any /api call that comes back
 * 402 (monthly quota hit — see lib/usage-guard.ts) opens a single upgrade modal, and
 * any successful POST nudges the top bar to refresh its usage numbers. Individual
 * pages keep their own error handling; this only adds the modal on top.
 */
export default function QuotaWatcher() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const w = window as typeof window & { __epicsemFetchWrapped?: boolean };
    if (w.__epicsemFetchWrapped) return;
    w.__epicsemFetchWrapped = true;
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const res = await original(input, init);
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/") && !url.includes("/api/usage")) {
        if (res.status === 402) {
          res
            .clone()
            .json()
            .then((d) => setMessage(d?.error ?? "Aylık kullanım limitine ulaştınız."))
            .catch(() => setMessage("Aylık kullanım limitine ulaştınız."));
        } else if (res.ok && (init?.method ?? "GET").toUpperCase() === "POST") {
          window.dispatchEvent(new Event("epicsem:usage-changed"));
        }
      }
      return res;
    };
  }, []);

  if (!message) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/40" onClick={() => setMessage(null)} />
      <div className="relative card max-w-md w-full p-7 space-y-4">
        <span className="h-12 w-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
            <path d="M10 15V5M5.5 9.5 10 5l4.5 4.5" />
          </svg>
        </span>
        <h2 className="text-lg font-extrabold">Limitine ulaştın</h2>
        <p className="text-sm text-ink/60">{message}</p>
        <div className="flex gap-3 pt-1">
          <button onClick={() => setMessage(null)} className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-bold text-ink/70 hover:bg-muted">
            Kapat
          </button>
          <Link
            href="/billing"
            onClick={() => setMessage(null)}
            className="flex-1 text-center rounded-lg bg-accent text-white px-4 py-2.5 text-sm font-bold hover:opacity-90"
          >
            Planı yükselt
          </Link>
        </div>
      </div>
    </div>
  );
}
