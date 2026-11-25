"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { GeoRunResult } from "@/types";
import { aggregateFanout } from "@/lib/fanout";
import { ENGINE_META } from "@/components/tool/MonitorBits";
import { BTN2, CARD, EmptyBlock, StandardTable, StatCard } from "@/components/ui";

/** GEO → Promptlar → "AI'ın aramaları": motorlar cevap yazarken ne arıyor, sende karşılığı var mı? AI yok. */
export default function GeoFanoutTab({ runs }: { runs: GeoRunResult[] }) {
  const base = useMemo(() => aggregateFanout(runs), [runs]);
  const [site, setSite] = useState<{ urlCount: number; blocked: string | null; matches: ({ url: string; score: number } | null)[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!base.length) return;
    fetch("/api/geo/fanout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queries: base.slice(0, 500).map((q) => q.query) }) })
      .then(async (r) => (r.ok ? setSite(await r.json()) : setErr((await r.json().catch(() => null))?.error ?? "Site adresleri okunamadı")))
      .catch(() => setErr("Site adresleri okunamadı"));
  }, [base]);

  if (!base.length)
    return <EmptyBlock title="Bu testte arama kaydı yok" description="Motorların cevap yazarken yaptığı web aramaları yeni testlerde kaydediliyor (ChatGPT, Gemini, Perplexity). Yeni bir test çalıştırınca burada görünür." />;

  const rows = base.map((q, i) => ({ ...q, match: site?.matches[i] ?? null }));
  const known = !!site && site.urlCount > 0;
  const gaps = known ? rows.filter((r) => !r.match) : [];
  // Yazı önerisi: sık aranan, kısa (≤7 kelime) ve markanın kaybettiği aramalar önce
  const topGaps = gaps.filter((g) => g.query.split(/\s+/).length <= 7).sort((a, b) => b.count - a.count || a.ownMentionRate - b.ownMentionRate || a.query.length - b.query.length).slice(0, 3);
  const pct = (n: number) => `%${Math.round(n * 100)}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Farklı arama" value={base.length} hint={`${runs.filter((r) => r.searchQueries?.length).length} cevapta arama yapıldı`} />
        <StatCard label="Sitende karşılığı var" value={known ? pct((rows.length - gaps.length) / rows.length) : "—"} hint={known ? `${site!.urlCount.toLocaleString("tr")} adres tarandı` : site?.blocked ?? (err ? "okunamadı" : "sitemap okunuyor…")} />
        <StatCard label="Karşılığı olmayan" value={known ? gaps.length : "—"} hint="yazılacak konu" />
        <StatCard label="Markan geçti" value={pct(rows.reduce((s, r) => s + r.ownMentionRate * r.count, 0) / rows.reduce((s, r) => s + r.count, 0))} hint="bu aramaları yapan cevaplarda" />
      </div>

      {topGaps.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Ne yapmalı?</h3>
          <div className="grid gap-3 md:grid-cols-3">
            {topGaps.map((g) => (
              <div key={g.query} className={`${CARD} flex flex-col p-4`}>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">Sitende sayfası yok</div>
                <h4 className="mt-1.5 text-sm font-semibold">“{g.query}”</h4>
                <p className="mt-1 flex-1 text-[13px] text-sub">
                  AI bunu {g.count} cevapta aradı; bu cevapların {pct(g.ownMentionRate)}&apos;inde markan geçti. Bu aramaya doğrudan cevap veren bir sayfa, motorun bulup kaynak göstereceği sayfa olur.
                </p>
                <div className="mt-3 flex justify-end">
                  <Link href={`/editor?write=1&kw=${encodeURIComponent(g.query)}&note=${encodeURIComponent(`AI motorları bu aramayı yapıyor; ilgili sorular: ${g.prompts.slice(0, 3).join(" | ")}`)}`} className={BTN2}>
                    Yazı yaz
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {err && <p className="text-[13px] text-danger-ink">{err}</p>}
      <StandardTable
        columns={[
          { header: "AI'ın araması", cell: (r) => <div className="max-w-[420px] font-medium">{r.query}<div className="truncate text-xs font-normal text-sub">{r.prompts[0]}</div></div> },
          { header: "Motor", cell: (r) => <span className="text-xs text-sub">{r.engines.map((e) => ENGINE_META[e]?.name ?? e).join(", ")}</span> },
          { header: "Cevap", align: "right", cell: (r) => r.count },
          { header: "Markan", align: "right", cell: (r) => pct(r.ownMentionRate) },
          {
            header: "Sitende karşılığı",
            cell: (r) =>
              !known ? (
                <span className="text-xs text-sub">—</span>
              ) : r.match ? (
                <a href={r.match.url} target="_blank" rel="noreferrer" className="block max-w-[260px] truncate text-xs text-accent hover:underline">
                  {r.match.url.replace(/^https?:\/\/(www\.)?/, "")}
                </a>
              ) : (
                <span className="rounded-md bg-warn/10 px-1.5 py-0.5 text-xs font-medium text-warn-ink">Yok</span>
              ),
          },
        ]}
        rows={rows}
        rowKey={(r) => r.query}
      />
      <p className="text-[11px] text-sub">Eşleşme sitemap adreslerindeki kelimelere bakar (sayfa başlığına değil); “Yok” görünen bir konuyu farklı adla yazmış olabilirsin. AI kullanmaz, ücretsiz.</p>
    </div>
  );
}
