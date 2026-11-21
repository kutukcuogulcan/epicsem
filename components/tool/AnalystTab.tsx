"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardHeader, EmptyBlock, ErrorBlock } from "@/components/ui";
import type { OpportunityReport } from "@/lib/geo-opportunities";
import type { Opportunity } from "@/lib/opportunity-check";

const BTN1 = "inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-accent px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60";
const BTN2 = "inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-panel px-3 text-sm font-medium text-ink shadow-[inset_0_0_0_1px_#D5D7DA,0_1px_2px_rgba(13,18,28,0.05)] hover:bg-muted disabled:opacity-60";

const CAT: Record<Opportunity["category"], string> = {
  outreach: "Dış sitede görün",
  social: "Toplulukta görün",
  creation: "Yeni sayfa yaz",
  "existing-content": "Sayfanı iyileştir",
};
const IMPACT: Record<Opportunity["impact"], [string, string]> = {
  high: ["Yüksek etki", "bg-seo/10 text-seo-ink"],
  medium: ["Orta etki", "bg-warn/10 text-warn-ink"],
  low: ["Düşük etki", "bg-muted text-sub"],
};

/** GEO analisti: son testin gerçek cevaplarından öncelikli fırsatlar (lib/geo-opportunities). */
export default function AnalystTab({ domain, brand }: { domain: string; brand: string }) {
  const [report, setReport] = useState<OpportunityReport | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/geo/opportunities?domain=${encodeURIComponent(domain)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setReport(d?.report ?? null))
      .catch(() => setReport(null));
  }, [domain]);

  async function analyze() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/geo/opportunities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Analiz yapılamadı");
      setReport(d.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analiz yapılamadı");
    } finally {
      setBusy(false);
    }
  }

  if (report === undefined) return <Card><p className="text-sm text-sub">Yükleniyor…</p></Card>;

  if (!report)
    return (
      <Card>
        <EmptyBlock
          title="Son testi analiste okut"
          description={`AI motorlarının ${brand} hakkında verdiği gerçek cevaplar, gösterdikleri kaynaklar ve rakiplerin durumu okunur; öncelikli işler çıkarılır. Her iş gerçek bir soruya ve kaynağa bağlıdır. 1 AI sorgusu.`}
          action={<button type="button" onClick={analyze} disabled={busy} className={BTN1}>{busy ? "Analiz ediliyor…" : "Analiz et"}</button>}
        />
        <ErrorBlock message={error} />
      </Card>
    );

  if (report.status === "insufficient-data")
    return (
      <Card>
        <EmptyBlock title="Yetersiz veri" description={`Son testte ${report.answers} gerçek AI cevabı var; güvenilir bir analiz için daha fazla soru ya da motorla test çalıştır. Uydurma yorum yapılmaz.`} />
      </Card>
    );

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader
          title="Analist özeti"
          subtitle={`${new Date(report.runAt).toLocaleString("tr-TR")} testindeki ${report.answers} AI cevabına göre`}
          action={<button type="button" onClick={analyze} disabled={busy} className={BTN2}>{busy ? "Analiz ediliyor…" : "Yeniden analiz et"}</button>}
        />
        <ErrorBlock message={error} />
        <ul className="space-y-1.5 text-sm">
          {report.summary.map((s) => <li key={s}>{s}</li>)}
        </ul>
        {report.risks.length > 0 && (
          <div className="mt-4 rounded-xl bg-danger/5 px-4 py-3 text-[13px]">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-danger-ink">Riskler</div>
            <ul className="space-y-1">{report.risks.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
        )}
      </Card>

      {report.opportunities.map((o, n) => (
        <Card key={o.title}>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
            <span className="text-sub">{n + 1}.</span>
            <span className="rounded-md bg-accent/10 px-2 py-0.5 text-accent">{CAT[o.category]}</span>
            <span className={`rounded-md px-2 py-0.5 ${IMPACT[o.impact][1]}`}>{IMPACT[o.impact][0]}</span>
            {o.lostAnswers > 0 && <span className="font-normal text-sub">{o.lostAnswers} kaybedilen cevap</span>}
          </div>
          <h3 className="mt-2 text-sm font-semibold">{o.title}</h3>
          <p className="mt-1 text-[13px] text-ink/80">{o.why}</p>
          <div className="mt-3 grid gap-3 text-[13px] md:grid-cols-2">
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-sub">İlgili sorular</div>
              <ul className="space-y-0.5">{o.prompts.map((p) => <li key={p.i}>&ldquo;{p.text}&rdquo;</li>)}</ul>
            </div>
            {o.sources.length > 0 && (
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-sub">AI&apos;ın gösterdiği kaynaklar</div>
                <ul className="space-y-0.5">
                  {o.sources.map((s) => (
                    <li key={s.domain}>
                      <a href={s.urls[0] ?? `https://${s.domain}`} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{s.domain}</a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {(o.category === "creation" || o.category === "existing-content") && (
            <div className="mt-3 flex justify-end">
              <Link
                href={`/editor?write=1&kw=${encodeURIComponent(o.prompts[0].text.replace(/[?!.]+$/, "").slice(0, 100))}&title=${encodeURIComponent(o.prompts[0].text.slice(0, 200))}&note=${encodeURIComponent(`${o.title}. ${o.why}`.slice(0, 700))}`}
                className={BTN1}
              >
                Yazıya dönüştür
              </Link>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
