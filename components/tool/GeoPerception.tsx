"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { GeoRunResult } from "@/types";
import { buildPerception, type PerceptionTerm } from "@/lib/brand-perception";

/** GEO → "Marka algısı": AI cevapları markanı hangi ifadelerle anlatıyor, rakiplerini hangi ifadelerle? AI yok. */

const CARD = "rounded-2xl border border-border bg-panel shadow-[0_1px_2px_rgba(13,18,28,0.05)]";
const BTN2 = "inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-panel px-3 text-sm font-medium text-ink shadow-[inset_0_0_0_1px_#D5D7DA,0_1px_2px_rgba(13,18,28,0.05)] hover:bg-muted";

export default function GeoPerceptionTab({ runs, own, competitors }: { runs: GeoRunResult[]; own: { name: string }; competitors: { name: string }[] }) {
  const data = useMemo(() => buildPerception(runs, [own, ...competitors.slice(0, 5)]), [runs, own, competitors]);
  const [sel, setSel] = useState<{ brand: string; t: PerceptionTerm } | null>(null);
  const me = data[0];
  const rivals = data.slice(1).filter((d) => d.mentions > 0);
  const negatives = me?.terms.filter((t) => t.negative) ?? [];
  const myTerms = new Set(me?.terms.map((t) => t.term) ?? []);
  const rivalStrengths = rivals.flatMap((r) => r.terms.filter((t) => !t.negative && t.score >= 30 && !myTerms.has(t.term)).map((t) => ({ ...t, brand: r.brand }))).sort((a, b) => b.score - a.score).slice(0, 3);

  if (!me || me.mentions === 0)
    return (
      <div className={`${CARD} px-6 py-10 text-center`}>
        <div className="text-sm font-semibold">Bu testte markan hiçbir cevapta anılmadı</div>
        <p className="mx-auto mt-1 max-w-md text-[13px] text-sub">Algı, markanın geçtiği cümlelerden çıkarılır. Önce Aksiyon planı sekmesindeki işlerle görünürlüğü artır.</p>
      </div>
    );

  const Chips = ({ brand, terms }: { brand: string; terms: PerceptionTerm[] }) => (
    <div className="flex flex-wrap gap-1.5">
      {terms.length === 0 && <span className="text-[12px] text-sub">AI bu markayı ayırt edici bir ifadeyle anlatmıyor; cevaplar genel geçer.</span>}
      {terms.map((t) => (
        <button
          key={t.term}
          type="button"
          onClick={() => setSel(sel?.t.term === t.term && sel.brand === brand ? null : { brand, t })}
          className={`rounded-lg px-2 py-1 text-[12px] font-medium ${t.negative ? "bg-danger/10 text-danger" : "bg-accent/[0.07] text-ink"} ${sel?.t.term === t.term && sel.brand === brand ? "ring-1 ring-accent" : ""}`}
          style={{ fontSize: `${11 + Math.min(4, t.score / 20)}px` }}
        >
          {t.term} <span className="text-[10px] text-sub">%{t.score}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      {(negatives.length > 0 || rivalStrengths.length > 0) && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Ne yapmalı?</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {negatives.length > 0 && (
              <div className={`${CARD} p-4`}>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-danger">Olumsuz algı</div>
                <h4 className="mt-1.5 text-sm font-semibold">AI cevapları markanı “{negatives[0].term}” ile anlatıyor</h4>
                <p className="mt-1 text-[13px] text-sub">Kaynağını bul (şikâyet sitesi, eski bilgi), kendi sitende güncel ve kaynaklı bir cevap yayınla; haklı şikâyetleri çöz.</p>
                <div className="mt-3 flex justify-end">
                  <Link href={`/editor?write=1&kw=${encodeURIComponent(`${own.name} ${negatives[0].term}`)}`} className={BTN2}>
                    Cevap yazısı yaz
                  </Link>
                </div>
              </div>
            )}
            {rivalStrengths.length > 0 && (
              <div className={`${CARD} p-4`}>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">Rakibin sahiplendiği ifade</div>
                <h4 className="mt-1.5 text-sm font-semibold">
                  “{rivalStrengths[0].term}” denince AI {rivalStrengths[0].brand}&apos;ı anıyor (%{rivalStrengths[0].score})
                </h4>
                <p className="mt-1 text-[13px] text-sub">Bu konuda gerçekten güçlüysen, bunu kanıtlayan bir sayfa ve karşılaştırma yaz; AI&apos;ın seni de bu ifadeyle anması için kaynak oluştur.</p>
                <div className="mt-3 flex justify-end">
                  <Link href={`/editor?write=1&kw=${encodeURIComponent(`${own.name} ${rivalStrengths[0].term}`)}`} className={BTN2}>
                    Yazı yaz
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className={`${CARD} p-5`}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold">AI {own.name}&apos;ı nasıl anlatıyor?</h3>
            <p className="text-xs text-sub">{me.mentions} cevapta markanın geçtiği cümlelerden, rakiplerden ayıran ifadeler · yüzde = bu ifadenin geçtiği cevap oranı</p>
          </div>
          <span className="rounded-md bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">SEN</span>
        </div>
        <div className="mt-3">
          <Chips brand={me.brand} terms={me.terms} />
        </div>
        {sel?.brand === me.brand && sel.t.example && <p className="mt-3 rounded-xl bg-muted/50 px-3 py-2 text-[12px] italic text-ink/75">“{sel.t.example}”</p>}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {rivals.map((r) => (
          <div key={r.brand} className={`${CARD} p-4`}>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">{r.brand}</h4>
              <span className="text-[11px] text-sub">{r.mentions} cevap</span>
            </div>
            <div className="mt-2">
              <Chips brand={r.brand} terms={r.terms} />
            </div>
            {sel?.brand === r.brand && sel.t.example && <p className="mt-3 rounded-xl bg-muted/50 px-3 py-2 text-[12px] italic text-ink/75">“{sel.t.example}”</p>}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-sub">AI cevaplarındaki cümlelerden kural tabanlı çıkarılır; AI kullanmaz. Daha çok soru ve motorla test ettikçe algı netleşir. Kırmızı ifadeler olumsuz sözlüğe uyanlardır.</p>
    </div>
  );
}
