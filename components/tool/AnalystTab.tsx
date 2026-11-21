"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardHeader, EmptyBlock, ErrorBlock } from "@/components/ui";
import type { OpportunityReport } from "@/lib/geo-opportunities";
import type { Opportunity } from "@/lib/opportunity-check";
import type { ContentBrief } from "@/lib/geo-brief";
import { briefToWriterLink } from "@/lib/brief-link";

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
  const [briefs, setBriefs] = useState<Record<number, ContentBrief>>({});
  const [briefBusy, setBriefBusy] = useState<number | null>(null);

  async function makeBrief(index: number) {
    setBriefBusy(index);
    setError(null);
    try {
      const r = await fetch("/api/geo/opportunities/brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain, index }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Brief üretilemedi");
      setBriefs((b) => ({ ...b, [index]: d.brief }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Brief üretilemedi");
    } finally {
      setBriefBusy(null);
    }
  }

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
          {/* İş yapılınca önce/sonra ölçüm (Etki sekmesi; hedef soru ve referans hazır gelir). */}
          <div className="mt-2">
            <a
              href={`/geo?tab=impact&target=${encodeURIComponent(o.prompts[0].text.slice(0, 200))}&title=${encodeURIComponent(o.title.slice(0, 200))}&kind=${o.category === "outreach" || o.category === "social" ? "offpage" : "article"}${o.sources[0]?.urls[0] ? `&ref=${encodeURIComponent(o.sources[0].urls[0].slice(0, 300))}` : ""}`}
              className="text-xs font-medium text-accent hover:underline"
            >
              Etkisini takibe al →
            </a>
          </div>
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
          {(o.category === "creation" || o.category === "existing-content") && (() => {
            const b = briefs[n] ?? (o as Opportunity & { brief?: ContentBrief }).brief;
            if (!b)
              return (
                <div className="mt-3 flex justify-end">
                  <button type="button" onClick={() => makeBrief(n)} disabled={briefBusy !== null} className={BTN1}>
                    {briefBusy === n ? "Brief hazırlanıyor…" : "Brief hazırla"}
                  </button>
                </div>
              );
            return (
              <div className="mt-4 space-y-3 rounded-xl border border-border p-4 text-[13px]">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-sub">İçerik brief&apos;i</div>
                  <div className="mt-1 text-sm font-semibold">{b.h1Options[0] ?? b.mainQuestion}</div>
                  {b.h1Options.length > 1 && <div className="text-sub">Alternatif: {b.h1Options.slice(1).join(" · ")}</div>}
                  <div className="mt-1 text-sub">Meta: {b.metaTitle} — {b.metaDescription}</div>
                </div>
                <p><span className="font-medium">Ana soru:</span> {b.mainQuestion}</p>
                <p><span className="font-medium">Açı:</span> {b.angle}</p>
                {b.proofPoints.length > 0 && <p><span className="font-medium">Kanıt noktaları:</span> {b.proofPoints.join(" · ")}</p>}
                <ol className="space-y-2">
                  {b.sections.map((sec, k) => (
                    <li key={k} className="rounded-lg bg-muted/50 px-3 py-2">
                      <div className="font-medium">H2: {sec.h2}</div>
                      <div className="text-sub">{sec.angle}</div>
                      {sec.questions.length > 0 && <div className="mt-1"><span className="text-sub">Cevapladığı sorular:</span> {sec.questions.map((q) => `"${q}"`).join(" · ")}</div>}
                      {sec.points.length > 0 && <ul className="mt-1 list-disc pl-5">{sec.points.map((pt) => <li key={pt}>{pt}</li>)}</ul>}
                    </li>
                  ))}
                </ol>
                {b.neverWrite.length > 0 && <p><span className="font-medium text-danger-ink">Kullanma:</span> {b.neverWrite.join(", ")}</p>}
                {b.neededInputs.length > 0 && (
                  <div className="rounded-lg bg-warn/10 px-3 py-2">
                    <div className="font-medium text-warn-ink">Yayından önce gerekli bilgiler</div>
                    <ul className="list-disc pl-5">{b.neededInputs.map((x) => <li key={x}>{x}</li>)}</ul>
                  </div>
                )}
                <div className="flex justify-end">
                  <Link href={briefToWriterLink(b, o.prompts[0].text)} className={BTN1}>Bu brief ile yaz</Link>
                </div>
              </div>
            );
          })()}
        </Card>
      ))}
    </div>
  );
}
