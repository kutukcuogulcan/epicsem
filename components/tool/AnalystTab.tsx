"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardHeader, EmptyBlock, ErrorBlock, BTN1, BTN2 } from "@/components/ui";
import type { OpportunityReport } from "@/lib/geo-opportunities";
import type { Opportunity } from "@/lib/opportunity-check";
import type { ContentBrief } from "@/lib/geo-brief";
import { briefToWriterLink } from "@/lib/brief-link";
import type { ChangeReport } from "@/lib/geo-change";
import type { AgentReport } from "@/lib/geo-agent";
import { actionLabel, type GeoReport } from "@/lib/geo-report";


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

const ST: Record<string, string> = { won: "1. sırada", mentioned: "anıldın", lost: "rakip kazandı", empty: "kimse anılmadı" };
const day = (iso: string) => new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });

/** Haftalık "ne değişti": son test ~1 hafta önceki (yoksa bir önceki) testle karşılaştırılır (lib/geo-change). */
function ChangeCard({ domain }: { domain: string }) {
  const [r, setR] = useState<ChangeReport | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/geo/change?domain=${encodeURIComponent(domain)}`)
      .then((x) => (x.ok ? x.json() : null))
      .then((d) => setR(d?.report ?? null))
      .catch(() => setR(null));
  }, [domain]);
  async function run() {
    setBusy(true);
    setError(null);
    try {
      const x = await fetch("/api/geo/change", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain }) });
      const d = await x.json();
      if (!x.ok) throw new Error(d.error ?? "Özet çıkarılamadı");
      setR(d.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Özet çıkarılamadı");
    } finally {
      setBusy(false);
    }
  }
  if (r === undefined) return null;
  const d = r?.diff;
  return (
    <Card>
      <CardHeader
        title="Ne değişti?"
        subtitle={r?.from ? `${day(r.from)} testi → ${day(r.to)} testi · ${d?.compared ?? 0} aynı soru × motor cevabı karşılaştırıldı` : "Son testi yaklaşık bir hafta önceki testle karşılaştırır. Değişiklik varsa 1 AI sorgusu."}
        action={<button type="button" onClick={run} disabled={busy} className={r ? BTN2 : BTN1}>{busy ? "Karşılaştırılıyor…" : r ? "Yeniden karşılaştır" : "Karşılaştır"}</button>}
      />
      <ErrorBlock message={error} />
      {r?.status === "no-baseline" && <p className="text-sm text-sub">Karşılaştıracak daha eski bir test yok. Marka Monitörleri&apos;nden otomatik ölçümü açınca her hafta burada değişimi görürsün.</p>}
      {r?.status === "no-change" && <p className="text-sm text-sub">İki test arasında aynı sorularda değişiklik yok.</p>}
      {r?.status === "ready" && d && (
        <div className="space-y-3 text-[13px]">
          <div className="text-sm">
            Görünürlük <span className="font-semibold">%{Math.round(d.visibilityBefore * 100)} → %{Math.round(d.visibilityAfter * 100)}</span>
            {d.gained.length > 0 && <span className="ml-3 text-seo-ink">↑ {d.gained.length} kazanılan</span>}
            {d.lost.length > 0 && <span className="ml-3 text-danger-ink">↓ {d.lost.length} kaybedilen</span>}
          </div>
          <ul className="space-y-1">{r.narrative.map((t) => <li key={t}>{t}</li>)}</ul>
          {(d.gained.length > 0 || d.lost.length > 0) && (
            <ul className="space-y-0.5 text-sub">
              {d.gained.slice(0, 5).map((g) => <li key={g.prompt + g.engine}><span className="text-seo-ink">↑</span> &ldquo;{g.prompt}&rdquo; · {g.engine}: {ST[g.from]} → {ST[g.to]}</li>)}
              {d.lost.slice(0, 5).map((l) => <li key={l.prompt + l.engine}><span className="text-danger-ink">↓</span> &ldquo;{l.prompt}&rdquo; · {l.engine}: {ST[l.from]} → {ST[l.to]}</li>)}
            </ul>
          )}
          {d.rivals.length > 0 && <p className="text-sub">Rakip hareketi: {d.rivals.slice(0, 4).map((x) => `${x.name} ${x.before} → ${x.after} cevap`).join(" · ")}</p>}
          {d.newSources.length > 0 && <p className="text-sub">AI&apos;ın yeni gösterdiği kaynaklar: {d.newSources.slice(0, 6).join(", ")}</p>}
          {r.actions.length > 0 && (
            <div className="rounded-xl bg-accent/5 px-4 py-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Şimdi ne yapmalı</div>
              <ul className="space-y-1">{r.actions.map((a) => <li key={a}>{a}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/** GEO analisti: son testin gerçek cevaplarından öncelikli fırsatlar (lib/geo-opportunities). */
/** Ücretsiz rapordan (lib/geo-report) ilk 3 iş: AI harcayan analizlerden önce, kodla çıkan öncelikler. */
function ReportCard() {
  const [actions, setActions] = useState<GeoReport["actions"] | null>(null);
  useEffect(() => {
    fetch("/api/geo/report")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setActions(d?.report?.actions ?? []))
      .catch(() => setActions([]));
  }, []);
  if (!actions?.length) return null;
  return (
    <Card>
      <CardHeader title="Önce bunları yap" subtitle="Son testin cevaplarından kodla çıkarıldı (AI kullanılmadı)." action={<Link href="/geo/rapor" className={BTN2}>Tam rapor</Link>} />
      <ol className="mt-3 space-y-2.5">
        {actions.slice(0, 3).map((a, i) => (
          <li key={i} className="text-sm">
            <p className="font-medium text-ink">{i + 1}. {a.title}</p>
            <p className="text-sub">{a.why}</p>
            {a.href && <Link href={a.href} className="text-accent hover:underline">{actionLabel(a.href)}</Link>}
          </li>
        ))}
      </ol>
    </Card>
  );
}

export default function AnalystTab(props: { domain: string; brand: string }) {
  return (
    <div className="space-y-3">
      <ReportCard />
      <ChangeCard domain={props.domain} />
      <Opportunities {...props} />
      <PageTermsCard domain={props.domain} />
    </div>
  );
}

/** Peec'in "ürün sayfasına şunu ekle" önerisinin karşılığı: AI cevaplarında sık geçip sayfada geçmeyen kavramlar (ücretsiz). */
function PageTermsCard({ domain }: { domain: string }) {
  const [url, setUrl] = useState(`https://${domain}`);
  const [res, setRes] = useState<{ url: string; answers: number; checked: number; missing: { term: string; docs: number }[]; needsGeo?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/geo/page-terms?domain=${encodeURIComponent(domain)}&url=${encodeURIComponent(url)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Kontrol edilemedi");
      setRes(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Kontrol edilemedi");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader title="Sayfan AI'ın konuştuğu konuları kapsıyor mu?" subtitle="Son GEO testindeki AI cevaplarında sık geçen kavramlardan sayfanda olmayanlar. Ücretsiz, AI kullanmaz." />
      <div className="flex flex-wrap gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-panel px-3 text-sm outline-none focus:border-accent" placeholder="https://site.com/urun" />
        <button type="button" onClick={run} disabled={busy || !url.trim()} className={BTN1}>
          {busy ? "Okunuyor…" : "Kontrol et"}
        </button>
      </div>
      <ErrorBlock message={err} />
      {res?.needsGeo && <p className="mt-3 text-sm text-sub">Önce bu marka için gerçek bir GEO testi çalıştır.</p>}
      {res && !res.needsGeo && (
        <div className="mt-3 text-sm">
          {res.missing.length ? (
            <>
              <p className="text-sub">
                {res.answers} AI cevabında sık geçen {res.checked} kavramdan şunlar sayfanda yok. Ürününde/hizmetinde gerçekten varsa sayfaya ekle; yoksa ekleme (uydurma bilgi AI&apos;ın güvenini düşürür).
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {res.missing.map((m) => (
                  <li key={m.term} className="rounded-md bg-accent/[0.07] px-2 py-1 text-[13px]">
                    {m.term} <span className="text-xs text-sub">· {m.docs} cevapta</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-seo-ink">AI cevaplarında sık geçen {res.checked} kavramın hepsi sayfanda geçiyor.</p>
          )}
        </div>
      )}
    </Card>
  );
}

function Opportunities({ domain, brand }: { domain: string; brand: string }) {
  const [report, setReport] = useState<OpportunityReport | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [briefs, setBriefs] = useState<Record<number, ContentBrief>>({});
  const [briefBusy, setBriefBusy] = useState<number | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const buttons = (primary: boolean) => (
    <div className="flex flex-wrap justify-end gap-2">
      <button type="button" onClick={() => analyze(false)} disabled={busy} className={BTN2}>{busy && !agentBusy ? "Analiz ediliyor…" : "Hızlı analiz"}</button>
      <button type="button" onClick={() => analyze(true)} disabled={busy} className={primary ? BTN1 : BTN2} title="Agent kaynak sayfaları kendisi açıp okur, sitene bakar; 1-3 dakika sürer, 5 AI sorgusu">
        {agentBusy ? "Agent çalışıyor (1-3 dk)…" : "Agent ile derin analiz"}
      </button>
    </div>
  );

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

  async function analyze(agent = false) {
    setBusy(true);
    setAgentBusy(agent);
    setError(null);
    try {
      const r = await fetch("/api/geo/opportunities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain, agent }) });
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
          description={`Hızlı analiz: test verisinden öncelikli işler (1 AI sorgusu). Agent ile derin analiz: AI'ın gösterdiği kaynak sayfaları agent kendisi açıp okur (${brand} orada geçiyor mu, kaçıncı), sitende ilgili sayfa var mı bakar, sonra raporu yazar (1-3 dk, 5 AI sorgusu).`}
          action={buttons(true)}
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
          title={(report as AgentReport).agent ? "Agent analizi" : "Analist özeti"}
          subtitle={`${new Date(report.runAt).toLocaleString("tr-TR")} testindeki ${report.answers} AI cevabına göre${(report as AgentReport).agent ? ` · ${(report as AgentReport).trace.filter((t) => t.startsWith("Sayfayı okudu")).length} sayfa okundu` : ""}`}
          action={buttons(false)}
        />
        <ErrorBlock message={error} />
        <ul className="space-y-1.5 text-sm">
          {report.summary.map((s) => <li key={s}>{s}</li>)}
        </ul>
        {(report as AgentReport).agent && (report as AgentReport).trace.length > 0 && (
          <details className="mt-3 text-[13px]">
            <summary className="cursor-pointer text-sub">Agent ne yaptı ({(report as AgentReport).trace.length} adım)</summary>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sub">{(report as AgentReport).trace.map((t, i) => <li key={i} className="break-all">{t}</li>)}</ol>
          </details>
        )}
        {report.risks.length > 0 && (
          <div className="mt-4 rounded-xl bg-danger/5 px-4 py-3 text-[13px]">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-danger-ink">Riskler</div>
            <ul className="space-y-1">{report.risks.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
        )}
      </Card>

      {report.opportunities.map((o, n) => (
        <Card key={o.title}>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="text-sub">{n + 1}.</span>
            <span className="rounded-md bg-accent/10 px-2 py-0.5 text-accent">{CAT[o.category]}</span>
            <span className={`rounded-md px-2 py-0.5 ${IMPACT[o.impact][1]}`}>{IMPACT[o.impact][0]}</span>
            {o.lostAnswers > 0 && <span className="font-normal text-sub">{o.lostAnswers} kaybedilen cevap</span>}
          </div>
          <h3 className="mt-2 text-sm font-semibold">{o.title}</h3>
          <p className="mt-1 text-[13px] text-ink/80">{o.why}</p>
          {o.evidence && o.evidence.length > 0 && (
            <ul className="mt-2 space-y-1 rounded-lg bg-seo/5 px-3 py-2 text-[13px]">
              {o.evidence.map((e) => (
                <li key={e.url + e.finding}>
                  <span className="text-xs font-semibold uppercase tracking-wide text-seo-ink">Okunan sayfadan bulgu · </span>
                  {e.finding}{" "}
                  <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">kaynak</a>
                </li>
              ))}
            </ul>
          )}
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
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-sub">İlgili sorular</div>
              <ul className="space-y-0.5">{o.prompts.map((p) => <li key={p.i}>&ldquo;{p.text}&rdquo;</li>)}</ul>
            </div>
            {o.sources.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-sub">AI&apos;ın gösterdiği kaynaklar</div>
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
                  <div className="text-xs font-semibold uppercase tracking-wide text-sub">İçerik brief&apos;i</div>
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
