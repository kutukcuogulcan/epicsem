"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { GeoRunResult } from "@/types";
import { Drawer, BTN1, BTN2, CARD } from "@/components/ui";
import { ACTION_LABEL, buildActionPlan, pitchTemplate, type ActionType, type BrandRef, type GeoAction } from "@/lib/geo-actions";

/** GEO "Aksiyon planı" sekmesi — kaybedilen cevapların kaynaklarından çıkan işler (AI'sız). */

const TYPE_CLS: Record<ActionType, string> = {
  write: "bg-accent/10 text-accent",
  listicle: "bg-warn/10 text-warn-ink",
  community: "bg-sky-50 text-sky-700",
  counter: "bg-danger/10 text-danger-ink",
  "own-page": "bg-seo/10 text-seo-ink",
  entity: "bg-violet-50 text-violet-700",
  sentiment: "bg-danger/10 text-danger-ink",
};
const EFFORT_CLS = { Kolay: "bg-seo/10 text-seo-ink", Orta: "bg-warn/10 text-warn-ink", Zor: "bg-danger/10 text-danger-ink" } as const;

export default function GeoActionsTab({ runs, own, competitors, onTab }: { runs: GeoRunResult[]; own: BrandRef; competitors: BrandRef[]; onTab?: (t: "entity" | "sources") => void }) {
  const plan = useMemo(() => buildActionPlan(runs, own, competitors), [runs, own, competitors]);
  const [open, setOpen] = useState<GeoAction | null>(null);
  const [pitch, setPitch] = useState<{ label: string; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const nonBranded = runs.filter((r) => !r.branded);
  const lost = nonBranded.filter((r) => !r.mentioned);
  const lostPrompts = new Set(lost.map((r) => r.promptText)).size;
  const maxImpact = Math.max(1, ...plan.map((a) => a.impact));

  async function toAutoblog(prompts: string[]) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/feeds/append", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keywords: prompts, siteUrl: own.domain }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Eklenemedi");
      setMsg({ ok: true, text: `${d.added} soru "${d.feedName}" beslemesine eklendi; Autoblog bu sorulardan yazı üretebilir.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Eklenemedi" });
    } finally {
      setBusy(false);
    }
  }
  const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  });

  if (!plan.length)
    return (
      <div className={`${CARD} px-5 py-10 text-center`}>
        <div className="text-sm font-semibold">Bu testte acil bir iş çıkmadı</div>
        <p className="mx-auto mt-1 max-w-md text-[13px] text-sub">Markan markasız soruların çoğunda anılıyor. Yeni alanları görmek için Prompt kütüphanesine persona soruları ekleyip testi genişlet.</p>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {([
          ["Kaybedilen cevap", `${lost.length}`, `/${nonBranded.length}`, "markasız sorularda anılmadığın", lost.length ? "text-danger-ink" : "text-seo-ink"],
          ["Etkilenen soru", `${lostPrompts}`, "", "en az bir motorda yoksun", ""],
          ["Aksiyon", `${plan.length}`, "", "türüne göre gruplandı", "text-accent"],
          ["Önde olan rakip", plan.flatMap((a) => a.competitors).length ? mostCommon(plan.flatMap((a) => a.competitors)) : "—", "", "kaybettiğin cevaplarda en çok anılan", ""],
        ] as const).map(([l, v, suf, hint, col]) => (
          <div key={l} className={`${CARD} px-4 py-4`}>
            <div className="text-xs font-medium text-sub">{l}</div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className={`truncate text-[24px] font-semibold leading-8 tabular-nums ${col}`}>{v}</span>
              {suf && <span className="text-sm text-sub">{suf}</span>}
            </div>
            <div className="mt-1 h-4 truncate text-xs text-sub">{hint}</div>
          </div>
        ))}
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="px-5 pt-4">
          <h3 className="text-sm font-semibold">Aksiyon planı</h3>
          <p className="text-xs text-sub">Kaybettiğin cevaplarda AI&apos;ın dayandığı kaynaklardan çıkarıldı, etkisine göre sıralı. Satıra tıkla → kanıt ve adımlar.</p>
        </div>
        <div className="mt-3">
          {plan.map((a, i) => (
            <button key={a.id} type="button" onClick={() => setOpen(a)} className="flex w-full items-center gap-4 border-t border-border px-5 py-3.5 text-left hover:bg-[#fafafa]">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${TYPE_CLS[a.type]}`}>{ACTION_LABEL[a.type]}</span>
                  <span className="truncate text-[13px] font-medium">{a.title}</span>
                </div>
                <div className="mt-0.5 line-clamp-1 text-xs text-sub">{a.why}</div>
              </div>
              <div className="hidden w-40 shrink-0 md:block">
                <div className="flex justify-between text-xs text-sub">
                  <span>Etki</span>
                  <span className="tabular-nums">{a.impact} cevap</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(a.impact / maxImpact) * 100}%` }} />
                </div>
              </div>
              <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium ${EFFORT_CLS[a.effort]}`}>{a.effort}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-sub">Plan bu testin cevaplarından hesaplanır, AI kullanmaz. Sonuçlar ölçümdür, garanti değildir; aksiyonlardan sonra testi tekrarlayıp karşılaştır.</p>

      <Drawer
        isOpen={!!open}
        onClose={() => {
          setOpen(null);
          setPitch(null);
          setMsg(null);
        }}
        size="xl"
        eyebrow={open ? `${ACTION_LABEL[open.type]} · ${open.impact} cevabı etkiler · efor: ${open.effort}` : ""}
        title={open?.title ?? ""}
        footer={
          open && (
            <div className="flex flex-wrap justify-end gap-2">
              {open.type === "write" && (
                <>
                  <button type="button" disabled={busy} onClick={() => toAutoblog(open.prompts)} className={BTN2}>
                    {busy ? "Ekleniyor…" : `${open.prompts.length} soruyu Autoblog'a ekle`}
                  </button>
                  <Link href={`/editor?new=${encodeURIComponent(open.prompts[0])}`} className={BTN1}>
                    İlk yazıyı yaz
                  </Link>
                </>
              )}
              {open.type === "counter" && (
                <Link href={`/editor?new=${encodeURIComponent(`${own.name} alternatif karşılaştırma`)}`} className={BTN1}>
                  Karşılaştırma yazısı yaz
                </Link>
              )}
              {open.type === "entity" && onTab && (
                <button type="button" onClick={() => onTab("entity")} className={BTN1}>
                  Bilgi grafını aç
                </button>
              )}
              {open.type === "own-page" && (
                <Link href="/audit" className={BTN1}>
                  Sayfayı denetle
                </Link>
              )}
              {(open.type === "community" || open.type === "listicle") && onTab && (
                <button type="button" onClick={() => onTab("sources")} className={BTN2}>
                  Tüm kaynaklar
                </button>
              )}
            </div>
          )
        }
      >
        {open && (
          <div className="space-y-5 text-[13px]">
            <p className="leading-6">{open.why}</p>
            <div>
              <div className="mb-1.5 text-xs font-medium text-sub">Adımlar</div>
              <ol className="space-y-1.5">
                {open.steps.map((s, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-semibold text-accent">{i + 1}</span>
                    <span className="leading-5">{s}</span>
                  </li>
                ))}
              </ol>
            </div>
            {msg && <div className={`rounded-xl px-3 py-2 ${msg.ok ? "bg-seo/5 text-seo-ink" : "bg-danger/5 text-danger-ink"}`}>{msg.text}</div>}
            <div>
              <div className="mb-1.5 text-xs font-medium text-sub">Kanıt ({open.evidence.length})</div>
              <div className="divide-y divide-border rounded-xl border border-border">
                {open.evidence.map((e, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      {e.url ? (
                        <a href={e.url} target="_blank" rel="noreferrer" className="block truncate font-medium hover:text-accent">
                          {e.label} ↗
                        </a>
                      ) : (
                        <div className="truncate font-medium">{e.label}</div>
                      )}
                      {e.note && <div className="truncate text-xs text-sub">{e.note}</div>}
                    </div>
                    {open.type === "write" && (
                      <Link href={`/editor?new=${encodeURIComponent(e.label)}`} className="shrink-0 text-xs font-medium text-accent hover:underline">
                        Yazı yaz
                      </Link>
                    )}
                    {open.type === "listicle" && (
                      <button type="button" onClick={() => setPitch({ label: e.label, text: pitchTemplate(own, e, open.competitors) })} className="shrink-0 text-xs font-medium text-accent hover:underline">
                        E-posta taslağı
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {pitch && (
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-sub">
                  <span>E-posta taslağı · {pitch.label}</span>
                  <span>Gönderilmez; köşeli parantezleri doldurup kendin gönder</span>
                </div>
                <textarea value={pitch.text} onChange={(e) => setPitch({ ...pitch, text: e.target.value })} rows={12} className="w-full rounded-xl border border-border bg-panel p-3 text-[13px] leading-5 outline-none focus:border-[#BDB4FF]" />
                <button type="button" onClick={() => copy(pitch.text)} className={`${BTN2} mt-1.5`}>
                  {copied ? "Kopyalandı ✓" : "Kopyala"}
                </button>
              </div>
            )}
            {open.type !== "write" && open.prompts.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-medium text-sub">Etkilenen sorular</div>
                <ul className="list-disc space-y-0.5 pl-5 text-ink/80">
                  {open.prompts.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

function mostCommon(xs: string[]): string {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
}
