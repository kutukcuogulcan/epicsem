"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { GeoReport } from "@/lib/geo-report";
import type { RunDiff } from "@/lib/geo-diff";
import { EngineDot } from "@/components/tool/MonitorBits";
import { BTN1, BTN2, Card, CardHeader, EmptyBlock, ErrorBlock, PageHeader, PageSkeleton } from "@/components/ui";
import { writeGapHref } from "@/lib/geo-loss";

const pct = (x: number) => `%${Math.round(x * 100)}`;
const STATUS: Record<string, { label: string; cls: string }> = {
  won: { label: "İlk sırada", cls: "text-seo-ink" },
  mentioned: { label: "Anıldı", cls: "text-ink" },
  lost: { label: "Rakip kazandı", cls: "text-danger-ink" },
  empty: { label: "Kimse anılmadı", cls: "text-sub" },
};

/** "AI neden seni önermiyor?" — son GEO testinin bulguları tek sayfada; tarayıcıdan PDF olarak kaydedilebilir. */
export default function GeoReportPage() {
  const [d, setD] = useState<{ report: GeoReport | null; brand?: string; createdAt?: string; demo?: boolean; prevAt?: string | null; diff?: RunDiff | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    setErr(null);
    fetch("/api/geo/report")
      .then(async (r) => {
        if (r.status === 401) return void (window.location.href = "/login?next=/geo/rapor");
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Rapor alınamadı");
        setD(j);
      })
      .catch((e) => setErr(e.message));
  };
  useEffect(load, []);

  if (err) return <ErrorBlock message={err} onRetry={load} />;
  if (!d) return <PageSkeleton />;
  const r = d.report;
  if (!r || !r.answers)
    return <EmptyBlock title="Henüz GEO testi yok" description="Rapor, son AI görünürlük testinin cevaplarından hazırlanır." action={<Link href="/geo" className={BTN1}>GEO testi yap</Link>} />;
  const own = { name: d.brand ?? "", domain: "" };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title={`${d.brand}: AI görünürlük raporu`}
        description={`${new Date(d.createdAt!).toLocaleDateString("tr-TR")} tarihli testin ${r.questions} sorusu ve ${r.answers} cevabından kodla çıkarıldı (AI kullanılmadı).${d.demo ? " Demo verisi içerir." : ""}`}
        actions={
          <div className="flex gap-2 print:hidden">
            <Link href="/geo" className={BTN2}>GEO'ya dön</Link>
            <button className={BTN1} onClick={() => window.print()}>PDF olarak kaydet</button>
          </div>
        }
      />

      <Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Görünürlük" value={pct(r.visibility)} hint={r.confidence ? `±${r.confidence.margin} puan` : undefined} />
          <Stat label="İlk sırada" value={pct(r.winRate)} hint="cevapların" />
          <Stat label="Kaybedilen soru" value={`${r.lost.length}/${r.questions}`} />
          <Stat label="Kendi siten kaynak" value={`${r.ownCitedIn}/${r.answers}`} hint="cevapta" />
        </div>
        {r.confidence && r.confidence.level !== "yeterli" && <p className="mt-3 text-sm text-sub">{r.confidence.text}</p>}
      </Card>

      {d.diff && d.prevAt && <Changes diff={d.diff} prevAt={d.prevAt} />}

      {r.actions.length > 0 && (
        <Card>
          <CardHeader title="Önce bunları yap" subtitle="Sıralama veriden: en çok kaybettiğin sorular ve kaynaklar önce." />
          <ol className="mt-3 space-y-3">
            {r.actions.map((a, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
                <div>
                  <p className="text-sm font-medium text-ink">{a.title}</p>
                  <p className="text-sm text-sub">{a.why}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <Card>
        <CardHeader title="Markalar" subtitle="Takip ettiğin markaların kaç cevapta anıldığı ve kaçında ilk sırada olduğu." />
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs text-sub">
            <tr><th className="py-1.5 font-medium">Marka</th><th className="w-1/2 font-medium">Görünürlük</th><th className="text-right font-medium">İlk sırada</th></tr>
          </thead>
          <tbody>
            {r.brands.map((b) => (
              <tr key={b.name} className="border-t border-border">
                <td className={`py-2 ${b.own ? "font-semibold" : ""}`}>{b.name}{b.own ? " (sen)" : ""}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-muted"><div className={`h-2 rounded-full ${b.own ? "bg-accent" : "bg-[#A4A7AE]"}`} style={{ width: pct(b.visibility).slice(1) + "%" }} /></div>
                    <span className="w-10 text-right tabular-nums">{pct(b.visibility)}</span>
                  </div>
                </td>
                <td className="text-right tabular-nums">{b.firsts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {r.leader && r.leader.aheadIn > 0 && (
        <Card>
          <CardHeader
            title={`${r.leader.name} neden önde?`}
            subtitle={`${r.leader.firsts} cevapta ilk sırada, ${r.leader.aheadIn} cevapta senden önce. AI ${r.leader.citedIn} cevapta ${r.leader.name} sitesini kaynak gösterdi, senin siteni ${r.ownCitedIn} cevapta.`}
          />
          {r.leader.pages.length > 0 && (
            <>
              <p className="mt-3 text-xs font-medium text-sub">AI'ın kaynak gösterdiği {r.leader.name} sayfaları</p>
              <ul className="mt-1 space-y-1 text-sm">
                {r.leader.pages.map((pg) => (
                  <li key={pg.url} className="flex justify-between gap-3">
                    <a href={pg.url} target="_blank" rel="noopener noreferrer" className="truncate text-accent hover:underline">{pg.url.replace(/^https?:\/\/(www\.)?/, "")}</a>
                    <span className="flex shrink-0 gap-3">
                      <span className="tabular-nums text-sub">{pg.count} cevap</span>
                      <Link href={`/geo/karsilastir?rival=${encodeURIComponent(pg.url)}`} className="text-accent hover:underline print:hidden">Karşılaştır</Link>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-3 text-xs font-medium text-sub">Senden önce geldiği cevaplar</p>
          <ul className="mt-1 space-y-1">
            {r.leader.ahead.map((x, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5"><EngineDot engine={x.engine} size={16} /></span>
                <span className="text-ink">{x.question}</span>
                <span className="ml-auto shrink-0 text-sub">{x.ownRank ? `sen ${x.ownRank}.` : "sen yoksun"}</span>
              </li>
            ))}
          </ul>
          {r.leader.aheadIn > r.leader.ahead.length && <p className="mt-1 text-xs text-sub">+{r.leader.aheadIn - r.leader.ahead.length} cevap daha</p>}
        </Card>
      )}

      {r.lost.length > 0 && (
        <Card>
          <CardHeader title={`Kaybettiğin sorular (${r.lost.length})`} subtitle="En az bir motorda anılmadığın sorular; motor motor kimin öne çıktığı ve AI'ın ne aradığı." />
          <div className="mt-3 divide-y divide-border">
            {r.lost.map((q) => (
              <div key={q.question} className="break-inside-avoid py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-ink">{q.question}</p>
                  <Link className="shrink-0 text-sm text-accent hover:underline print:hidden" href={writeGapHref(q.question, own, q.engines.map((e) => ({ status: e.status, rivals: e.winner ? [{ name: e.winner, rank: 1 }] : [], sources: q.sources })), q.searches)}>Yazısını yaz</Link>
                </div>
                <ul className="mt-1.5 space-y-1">
                  {q.engines.map((e, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <EngineDot engine={e.engine} size={16} />
                      <span className={STATUS[e.status].cls}>{STATUS[e.status].label}</span>
                      {e.rank && e.rank > 1 && <span className="text-sub">({e.rank}. sırada)</span>}
                      {e.winner && e.status !== "won" && <span className="text-sub">· öne çıkan: {e.winner}</span>}
                    </li>
                  ))}
                </ul>
                {q.searches.length > 0 && <p className="mt-1.5 text-xs text-sub">AI'ın aramaları: {q.searches.join(" · ")}</p>}
                {q.sources.length > 0 && <p className="mt-0.5 text-xs text-sub">Baktığı kaynaklar: {q.sources.join(", ")}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {r.gapSources.length > 0 && (
        <Card>
          <CardHeader title="AI'ın baktığı ama seni anmayan kaynaklar" subtitle="Kaybettiğin cevaplarda kaynak gösterilen dış siteler (kendi siten ve rakip siteleri hariç). Sayfaların içeriği okunmadı; sayı, kaç cevapta kaynak olduklarını gösterir." />
          <table className="mt-3 w-full text-sm">
            <tbody>
              {r.gapSources.map((s) => (
                <tr key={s.domain} className="border-t border-border first:border-0">
                  <td className="py-2 font-medium">{s.domain}</td>
                  <td className="tabular-nums text-sub">{s.count} cevap</td>
                  <td className="text-right text-sub">{s.rivals.length ? `öne çıkan: ${s.rivals.join(", ")}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Link href="/backlinks" className="mt-3 inline-block text-sm text-accent hover:underline print:hidden">Bu sitelere ulaşma planı →</Link>
        </Card>
      )}

      {(r.perception.positives.length > 0 || r.perception.negatives.length > 0) && (
        <Card>
          <CardHeader title="AI seni nasıl anlatıyor?" subtitle="Markanın geçtiği cümlelerde rakiplere göre sık kullanılan ifadeler. Yüzde: markanın anıldığı cevapların kaçında geçtiği." />
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Terms title="Öne çıkan" items={r.perception.positives} />
            <Terms title="Dikkat" items={r.perception.negatives} negative />
          </div>
        </Card>
      )}

      {r.wonQuestions.length > 0 && (
        <Card>
          <CardHeader title={`Kazandığın sorular (${r.wonQuestions.length})`} subtitle="Tüm motorlarda anıldığın sorular — bu sayfaları güncel tut." />
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-ink">
            {r.wonQuestions.map((q) => <li key={q}>{q}</li>)}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs text-sub">{label}</p>
      <p className="text-2xl font-semibold tabular-nums text-ink">{value}</p>
      {hint && <p className="text-xs text-sub">{hint}</p>}
    </div>
  );
}

function Terms({ title, items, negative }: { title: string; items: GeoReport["perception"]["positives"]; negative?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium text-sub">{title}</p>
      {items.length ? (
        <ul className="mt-1.5 space-y-2">
          {items.map((t) => (
            <li key={t.term} className="text-sm">
              <span className={negative ? "font-medium text-danger-ink" : "font-medium text-ink"}>{t.term}</span> <span className="text-sub">%{t.score}</span>
              {t.example && <p className="text-xs text-sub">“{t.example}”</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-sm text-sub">{negative ? "En az 2 cevapta tekrar eden olumsuz ifade yok." : "Markana özgü tekrar eden ifade yok."}</p>
      )}
    </div>
  );
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });

function Changes({ diff, prevAt }: { diff: RunDiff; prevAt: string }) {
  const delta = Math.round((diff.visibilityAfter - diff.visibilityBefore) * 100);
  const none = !diff.gained.length && !diff.lost.length;
  return (
    <Card>
      <CardHeader
        title={`${fmt(prevAt)} testine göre ne değişti?`}
        subtitle={`İki testte de sorulan ${diff.compared} soru × motor karşılaştırıldı; yeni eklenen ya da çıkarılan sorular sayılmadı. AI cevapları testten teste oynar: tek cevaplık değişim eğilim değildir.`}
      />
      {!diff.compared ? (
        <p className="mt-3 text-sm text-sub">İki testte ortak soru yok; karşılaştırılamadı.</p>
      ) : (
        <>
          <p className="mt-3 text-sm text-ink">
            Görünürlük {pct(diff.visibilityBefore)} → <b>{pct(diff.visibilityAfter)}</b>{" "}
            <span className={delta > 0 ? "text-seo-ink" : delta < 0 ? "text-danger-ink" : "text-sub"}>({delta > 0 ? "+" : ""}{delta} puan)</span>
            {none && " · hiçbir cevapta durum değişmedi."}
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {[
              { title: `Kazanılan (${diff.gained.length})`, items: diff.gained.map((g) => ({ ...g, extra: "" })), cls: "text-seo-ink" },
              { title: `Kaybedilen (${diff.lost.length})`, items: diff.lost.map((l) => ({ ...l, extra: l.rivals.length ? `şimdi: ${l.rivals.join(", ")}` : "" })), cls: "text-danger-ink" },
            ].map((col) => (
              <div key={col.title}>
                <p className={`text-xs font-medium ${col.cls}`}>{col.title}</p>
                <ul className="mt-1.5 space-y-1.5">
                  {col.items.slice(0, 8).map((x, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="mt-0.5"><EngineDot engine={x.engine} size={16} /></span>
                      <span>
                        <span className="text-ink">{x.prompt}</span>
                        <span className="block text-xs text-sub">{STATUS[x.from].label} → {STATUS[x.to].label}{x.extra ? ` · ${x.extra}` : ""}</span>
                      </span>
                    </li>
                  ))}
                  {!col.items.length && <li className="text-sm text-sub">Yok</li>}
                  {col.items.length > 8 && <li className="text-xs text-sub">+{col.items.length - 8} daha</li>}
                </ul>
              </div>
            ))}
          </div>
          {diff.rivals.length > 0 && (
            <p className="mt-3 text-sm text-sub">
              Rakipler: {diff.rivals.slice(0, 5).map((x) => `${x.name} ${x.before}→${x.after}`).join(" · ")} cevap
            </p>
          )}
          {diff.newSources.length > 0 && <p className="mt-1 text-sm text-sub">AI'ın bu kez baktığı yeni kaynaklar: {diff.newSources.slice(0, 6).join(", ")}</p>}
        </>
      )}
    </Card>
  );
}
