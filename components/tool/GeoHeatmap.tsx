"use client";

/**
 * GEO sonucu — motor × prompt ısı haritası. Her hücre bir AI cevabı:
 * yeşil = ilk sırada / anıldın, kırmızı = rakip kazandı, gri = kimse anılmadı.
 * Hücreye tıklayınca "neden kaybettik", kaynaklar, gerçek cevap ve
 * "bu boşluğu kapatacak yazıyı yaz" düğmesi (yazı sihirbazı hazır açılır).
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import type { GeoRunResult } from "@/types";
import { Drawer } from "@/components/ui";
import { ENGINE_META } from "@/components/tool/MonitorBits";
import { STATUS_LABEL, analyzeRun, cleanDomain, writeGapHref, type BrandRef, type CellStatus, type LossAnalysis } from "@/lib/geo-loss";

const CELL: Record<CellStatus, { bg: string; fg: string; chip: string }> = {
  won: { bg: "bg-seo-ink", fg: "text-white", chip: "bg-seo/10 text-seo-ink" },
  mentioned: { bg: "bg-seo/15", fg: "text-seo-ink", chip: "bg-seo/10 text-seo-ink" },
  lost: { bg: "bg-danger-ink", fg: "text-white", chip: "bg-danger/10 text-danger-ink" },
  empty: { bg: "bg-muted", fg: "text-sub", chip: "bg-muted text-sub" },
};

interface Row {
  prompt: string;
  topic: string;
  cells: Map<string, { run: GeoRunResult; a: LossAnalysis }>;
  lost: number;
  hits: number;
}

export default function GeoHeatmap({ runs, own, rivals }: { runs: GeoRunResult[]; own: BrandRef; rivals: BrandRef[] }) {
  const [open, setOpen] = useState<{ run: GeoRunResult; a: LossAnalysis; row: Row } | null>(null);
  const [all, setAll] = useState(false);
  const [showText, setShowText] = useState(false);

  const engines = useMemo(() => [...new Set(runs.map((r) => r.engine))], [runs]);
  const rows = useMemo(() => {
    const m = new Map<string, Row>();
    for (const r of runs) {
      const row = m.get(r.promptText) ?? { prompt: r.promptText, topic: r.topic || "Genel", cells: new Map(), lost: 0, hits: 0 };
      const a = analyzeRun(r, own, rivals);
      row.cells.set(r.engine, { run: r, a });
      if (a.status === "lost" || a.status === "empty") row.lost++;
      else row.hits++;
      m.set(r.promptText, row);
    }
    return [...m.values()].sort((x, y) => y.lost - x.lost || x.hits - y.hits);
  }, [runs, own, rivals]);
  const engineRate = (e: string) => {
    const cs = rows.map((r) => r.cells.get(e)).filter(Boolean) as { a: LossAnalysis }[];
    return cs.length ? cs.filter((c) => c.a.status === "won" || c.a.status === "mentioned").length / cs.length : 0;
  };
  const shown = all ? rows : rows.slice(0, 10);
  const name = (e: string) => ENGINE_META[e]?.name ?? e;

  return (
    <div className="rounded-2xl border border-border bg-panel shadow-[0_1px_2px_rgba(13,18,28,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
        <div>
          <h2 className="text-sm font-semibold">Motor × prompt haritası</h2>
          <p className="text-xs text-sub">Her kare bir AI cevabı. Kırmızıya tıkla: neden kaybettin, ne yazmalısın.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-sub">
          {(["won", "mentioned", "lost", "empty"] as CellStatus[]).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={`h-3 w-3 rounded ${CELL[s].bg}`} />
              {STATUS_LABEL[s]}
            </span>
          ))}
        </div>
      </div>
      <p className="px-5 pt-2 text-[11px] text-sub sm:hidden">Diğer motorlar için tabloyu yana kaydır →</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-[13px]">
          <thead>
            <tr className="border-y border-border text-xs text-sub">
              <th className="py-2 pl-5 text-left font-medium">Prompt</th>
              {engines.map((e) => (
                <th key={e} className="px-1 py-2 text-center font-medium">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ background: ENGINE_META[e]?.color ?? "#999" }} />
                    {name(e)}
                  </span>
                </th>
              ))}
              <th className="py-2 pr-5 text-right font-medium">Aksiyon</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.map((row) => (
              <tr key={row.prompt}>
                <td className="max-w-[340px] py-2 pl-5">
                  <div className="truncate font-medium" title={row.prompt}>
                    {row.prompt}
                  </div>
                  <div className="text-[11px] text-sub">{row.topic}</div>
                </td>
                {engines.map((e) => {
                  const c = row.cells.get(e);
                  if (!c) return <td key={e} className="px-1 py-2 text-center text-xs text-sub">·</td>;
                  const st = CELL[c.a.status];
                  const label = c.a.ownRank ? `${c.a.ownRank}.` : c.a.status === "lost" ? c.a.rivals[0]?.name.charAt(0).toLocaleUpperCase("tr") ?? "✕" : "–";
                  return (
                    <td key={e} className="px-1 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setShowText(false);
                          setOpen({ ...c, row });
                        }}
                        title={`${name(e)}: ${STATUS_LABEL[c.a.status]}${c.a.rivals[0] && c.a.status === "lost" ? ` (${c.a.rivals[0].name})` : ""}`}
                        className={`inline-flex h-8 w-full min-w-[44px] max-w-[72px] items-center justify-center rounded-md text-xs font-semibold transition-transform hover:scale-105 ${st.bg} ${st.fg}`}
                      >
                        {label}
                      </button>
                    </td>
                  );
                })}
                <td className="py-2 pr-5 text-right">
                  {row.lost > 0 ? (
                    <Link href={writeGapHref(row.prompt, own, [...row.cells.values()].map((c) => c.a))} className="inline-flex h-7 items-center rounded-lg bg-accent px-2.5 text-xs font-medium text-white hover:opacity-90">
                      Yazıyı yaz
                    </Link>
                  ) : (
                    <span className="text-xs text-seo-ink">Kazanıyorsun</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border text-xs text-sub">
              <td className="py-2 pl-5">Motorda görünürlük</td>
              {engines.map((e) => (
                <td key={e} className="py-2 text-center font-semibold tabular-nums text-ink">
                  %{Math.round(engineRate(e) * 100)}
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {rows.length > 10 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="w-full border-t border-border py-2.5 text-xs font-medium text-accent hover:bg-muted/40">
          {all ? "Daha az göster" : `Tüm ${rows.length} promptu göster`}
        </button>
      )}

      <Drawer
        isOpen={!!open}
        onClose={() => setOpen(null)}
        eyebrow={open ? `${name(open.run.engine)} · ${STATUS_LABEL[open.a.status]}` : ""}
        title={open?.run.promptText}
        size="lg"
      >
        {open && (
          <div className="space-y-5 text-sm">
            {open.a.demo && <div className="rounded-xl bg-warn/10 px-3 py-2 text-xs text-ink/70">[DEMO] Bu cevap simüle edildi; gerçek sonuç için Entegrasyonlar&apos;dan bu motorun API anahtarını ekle.</div>}
            <div className="flex flex-wrap gap-1.5">
              <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${CELL[open.a.status].chip}`}>{STATUS_LABEL[open.a.status]}</span>
              {open.a.ownRank && <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-sub">Sıran: {open.a.ownRank}.</span>}
              {open.a.rivals.map((r) => (
                <span key={r.name} className="rounded-md bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger-ink">
                  {r.rank}. {r.name}
                </span>
              ))}
              {open.run.sentiment != null && open.run.mentioned && <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-sub">Duygu {open.run.sentiment}</span>}
            </div>

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-sub">{open.a.status === "won" ? "Neden kazandın" : "Neden kaybettin"}</h3>
              <ul className="mt-2 space-y-1.5">
                {open.a.reasons.map((x) => (
                  <li key={x} className="flex gap-2 text-[13px]">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink/40" />
                    {x}
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl bg-accent/[0.06] p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-accent">Ne yapmalı</h3>
              <p className="mt-1 text-[13px]">{open.a.fix}</p>
              {open.a.status !== "won" && (
                <>
                  <Link
                    href={writeGapHref(open.run.promptText, own, [...open.row.cells.values()].map((c) => c.a))}
                    className="mt-3 inline-flex h-9 items-center rounded-lg bg-accent px-4 text-sm font-medium text-white hover:opacity-90"
                  >
                    Bu boşluğu kapatacak yazıyı yaz
                  </Link>
                  <p className="mt-2 text-xs text-sub">
                    Yazı sihirbazı bu soru, rakipler ve kaynaklarla hazır açılır.{" "}
                    <Link href={`/geo?tab=impact&kind=article&target=${encodeURIComponent(open.run.promptText)}&title=${encodeURIComponent(open.run.promptText)}`} className="font-medium text-accent hover:underline">
                      Yazmadan önce etkisini takibe al →
                    </Link>{" "}
                    (şimdiki durum ölçülür; yayınlayınca önce/sonra karşılaştırılır)
                  </p>
                </>
              )}
            </section>

            {open.a.sources.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-sub">AI&apos;ın baktığı kaynaklar</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {open.run.citations.slice(0, 12).map((c, i) => (
                    <a key={c.url + i} href={c.url} target="_blank" rel="noopener noreferrer" className={`max-w-full truncate rounded-md px-2 py-1 text-xs hover:underline ${c.isOwnDomain ? "bg-accent/10 text-accent" : open.a.rivalCited.includes(cleanDomain(c.domain || c.url)) ? "bg-danger/10 text-danger-ink" : "bg-muted text-ink/70"}`}>
                      {c.domain || c.url}
                    </a>
                  ))}
                </div>
              </section>
            )}

            <section>
              <button type="button" onClick={() => setShowText((v) => !v)} className="text-xs font-semibold uppercase tracking-wide text-sub hover:text-ink">
                {showText ? "▾" : "▸"} AI&apos;ın gerçek cevabı
              </button>
              {showText && <div className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-muted/40 p-3 text-[13px] leading-6 text-ink/80">{open.run.responseText}</div>}
            </section>
          </div>
        )}
      </Drawer>
    </div>
  );
}
