"use client";

import type { BulkImportRow } from "@/types";
import { CRITICAL_ISSUES, ISSUE_LABEL } from "@/lib/bulk-labels";

export function short(u: string) {
  return u.replace(/^https?:\/\/(www\.)?/, "");
}

function Stat({ label, value, bad = false }: { label: string; value: React.ReactNode; bad?: boolean }) {
  return (
    <div className="rounded-lg bg-muted/60 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-ink/40">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${bad ? "text-danger" : "text-ink/80"}`}>{value}</div>
    </div>
  );
}

/** Tablo satırı + tıklayınca açılan Screaming Frog tarzı sayfa ayrıntısı. */
export default function PageRow({ row, open, onToggle }: { row: BulkImportRow; open: boolean; onToggle: () => void }) {
  const m = row.metrics;
  const sc = row.statusCode;
  return (
    <>
      <tr onClick={onToggle} className={`cursor-pointer border-t border-border align-top hover:bg-muted/40 ${open ? "bg-muted/40" : ""}`}>
        <td className="max-w-xs truncate px-5 py-2.5 font-medium" title={row.url}>
          <span className="mr-1.5 inline-block text-ink/30">{open ? "▾" : "▸"}</span>
          {short(row.url)}
        </td>
        <td className="py-2.5 pr-3">
          <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${sc && sc >= 400 ? "bg-danger/10 text-danger" : sc && sc >= 300 ? "bg-warn/10 text-warn" : sc === 0 ? "bg-danger/10 text-danger" : "bg-muted text-ink/60"}`}>
            {sc === 0 ? "hata" : sc ?? "—"}
          </span>
        </td>
        <td className={`py-2.5 pr-3 tabular-nums ${m?.responseMs && m.responseMs > 1500 ? "text-danger" : "text-ink/60"}`}>{m?.responseMs != null ? `${m.responseMs} ms` : "—"}</td>
        <td className="py-2.5 pr-3 tabular-nums text-ink/60">{row.wordCount ?? "—"}</td>
        <td className="py-2.5 pr-3 tabular-nums text-ink/60">{m ? m.inlinks : "—"}</td>
        <td className="py-2.5 pr-3 tabular-nums text-ink/60">{m?.depth ?? "—"}</td>
        <td className="py-2.5 pr-5">
          {row.issues.length === 0 ? (
            <span className="text-xs font-semibold text-seo">✓</span>
          ) : (
            <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${row.issues.some((i) => CRITICAL_ISSUES.has(i)) ? "bg-danger/10 text-danger" : "bg-warn/10 text-warn"}`}>{row.issues.length}</span>
          )}
        </td>
      </tr>
      {open && (
        <tr className="bg-muted/20">
          <td colSpan={7} className="px-5 pb-5 pt-2">
            <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
              <div className="space-y-2 text-sm">
                <div><span className="text-xs text-ink/40">Title ({row.titleLength ?? 0})</span><div className="font-medium">{row.title ?? <span className="text-danger">yok</span>}</div></div>
                <div><span className="text-xs text-ink/40">Meta açıklama ({row.metaDescriptionLength ?? 0})</span><div className="text-ink/70">{row.metaDescription ?? <span className="text-danger">yok</span>}</div></div>
                <div><span className="text-xs text-ink/40">H1 ({row.h1Count})</span><div className="text-ink/70">{row.h1 ?? <span className="text-danger">yok</span>}</div></div>
                <div><span className="text-xs text-ink/40">Canonical</span><div className="truncate text-ink/70">{row.canonical ?? "—"}</div></div>
                {row.issues.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {row.issues.map((i) => (
                      <span key={i} className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${CRITICAL_ISSUES.has(i) ? "bg-danger/10 text-danger" : "bg-warn/10 text-warn"}`}>{ISSUE_LABEL[i] ?? i}</span>
                    ))}
                  </div>
                )}
              </div>
              {m && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <Stat label="Boyut" value={m.htmlKb != null ? `${m.htmlKb} KB` : "—"} bad={(m.htmlKb ?? 0) > 500} />
                    <Stat label="Görsel / alt'sız" value={`${m.imagesTotal} / ${m.imagesMissingAlt}`} bad={m.imagesMissingAlt > 0} />
                    <Stat label="H2" value={m.h2Count} />
                    <Stat label="İç / dış link" value={`${m.internalOut} / ${m.externalOut}`} />
                    <Stat label="Dil" value={m.lang ?? "—"} bad={!m.lang && sc === 200} />
                    <Stat label="Sitemap" value={m.inSitemap ? "var" : "yok"} />
                  </div>
                  <div className="text-xs text-ink/60">
                    <span className="text-ink/40">Schema: </span>
                    {m.schemaTypes.length ? m.schemaTypes.join(", ") : <span className="text-warn">yok</span>}
                    {row.metaRobots && <><span className="ml-3 text-ink/40">Robots: </span>{row.metaRobots}</>}
                    {m.redirectTarget && <><span className="ml-3 text-ink/40">→ </span>{short(m.redirectTarget)}</>}
                  </div>
                  {m.brokenOutlinks.length > 0 && (
                    <div className="text-xs">
                      <div className="font-semibold text-danger">Kırık sayfalara giden linkler</div>
                      {m.brokenOutlinks.slice(0, 5).map((u) => (
                        <div key={u} className="truncate text-ink/60">{short(u)}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

