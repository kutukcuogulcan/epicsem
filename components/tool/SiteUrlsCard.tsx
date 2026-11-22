"use client";

import { useEffect, useState } from "react";
import type { SiteSection } from "@/lib/site-sections";

interface Data {
  origin: string;
  blocked: string | null;
  sitemapFiles: number;
  truncated: boolean;
  total: number;
  sections: SiteSection[];
}

/** Site Gezgini: robots.txt → site haritalarından sitenin BÜTÜN adresleri, bölümlere ayrılmış; CSV indirme. */
export default function SiteUrlsCard({ site }: { site: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    if (!site) return;
    setD(null);
    setErr(null);
    fetch(`/api/site/urls?site=${encodeURIComponent(site)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Okunamadı");
        setD(j);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Okunamadı"));
  }, [site]);

  const shown = d ? (all ? d.sections : d.sections.slice(0, 10)) : [];
  return (
    <div className="rounded-2xl border border-border bg-panel p-5 shadow-[0_1px_2px_rgba(13,18,28,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Sitedeki bütün adresler</h2>
          <p className="mt-0.5 text-xs text-sub">robots.txt&apos;deki site haritalarından okunur (tarama değil, liste). GEO konuları da bu bölümlerden üretilir.</p>
        </div>
        {d && d.total > 0 && (
          <a href={`/api/site/urls?site=${encodeURIComponent(site)}&format=csv`} className="text-xs font-medium text-accent hover:underline">
            Tüm adresleri CSV indir ({d.total.toLocaleString("tr-TR")}) →
          </a>
        )}
      </div>
      {err ? (
        <p className="mt-3 text-sm text-danger-ink">{err}</p>
      ) : !d ? (
        <p className="mt-3 text-sm text-sub">Site haritaları okunuyor…</p>
      ) : d.blocked ? (
        <p className="mt-3 rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn-ink">{d.blocked}</p>
      ) : !d.total ? (
        <p className="mt-3 text-sm text-sub">Bu sitede okunabilir bir site haritası bulunamadı (robots.txt&apos;de Sitemap satırı yok, /sitemap.xml de yok).</p>
      ) : (
        <>
          <p className="mt-3 text-sm">
            <b className="tabular-nums">{d.total.toLocaleString("tr-TR")}</b> adres · {d.sitemapFiles} site haritası dosyası
            {d.truncated && <span className="text-warn-ink"> · çok büyük site, ilk {d.total.toLocaleString("tr-TR")} adres okundu</span>}
          </p>
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
            {shown.map((s) => (
              <li key={s.path} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                <span className="w-14 shrink-0 text-right font-semibold tabular-nums">{s.count.toLocaleString("tr-TR")}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{s.label || "ana sayfa"}</span>
                  <span className="ml-2 truncate text-xs text-sub">{s.path}</span>
                </span>
                <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-muted sm:block">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(3, (s.count / d.total) * 100)}%` }} />
                </span>
              </li>
            ))}
          </ul>
          {d.sections.length > 10 && (
            <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 text-xs font-medium text-accent hover:underline">
              {all ? "Daha az göster" : `Tüm ${d.sections.length} bölümü göster`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
