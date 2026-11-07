"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader, UnderlineTabs, ErrorBlock, PageSkeleton } from "@/components/ui";
import PromptResults from "@/components/tool/PromptResults";
import { ENGINE_META, EngineDot, ScoreRing, SentimentBar, netSentiment, sentimentLabel } from "@/components/tool/MonitorBits";

interface Resp {
  engine: string;
  model: string;
  mentioned: boolean;
  position: number | null;
  sentiment: number | null;
  text: string;
  mentions: string[];
  citations: { url: string; domain: string; isOwnDomain: boolean }[];
}
interface Prompt {
  text: string;
  topic: string;
  branded: boolean;
  visibility: number;
  sentiment: number | null;
  mentions: string[];
  responses: Resp[];
}
interface Detail {
  brand: { name: string; domain: string };
  lastRunAt: string;
  demoMode: boolean;
  visibility: number;
  sentiment: number | null;
  summaries: { brand: string; domain: string; visibility: number; shareOfVoice: number; avgPosition: number | null; avgSentiment: number | null; citationCount: number }[];
  sources: { domain: string; count: number; type: string; citationShare: number; chatsCited: number }[];
  prompts: Prompt[];
  engines: { engine: string; visibility: number; sentiment: number | null; total: number }[];
  timeline: { at: string; visibility: number; sentiment: number | null }[];
  legacy?: boolean;
  schedule?: { active: boolean; intervalDays: number; lastAutoAt: string | null; lastError: string | null } | null;
}

type Tab = "prompts" | "visibility" | "sentiment" | "rivals" | "sources";
const TABS: Tab[] = ["prompts", "visibility", "sentiment", "rivals", "sources"];
const fmt = (iso: string) => new Date(iso).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const pct = (x: number) => `${Math.round(x * 100)}%`;
const SOURCE_TYPE: Record<string, string> = { You: "Sen", Competitor: "Rakip", Corporate: "Kurumsal", Editorial: "Editoryal", Government: "Kamu", Reference: "Referans", UGC: "Forum/UGC", Other: "Diğer" };

export default function MonitorDetailPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = use(params);
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("prompts");

  const [busy, setBusy] = useState<null | "run" | "schedule">(null);
  const [note, setNote] = useState<{ t: string; bad?: boolean } | null>(null);

  async function load() {
    try {
      const r = await fetch(`/api/brand-monitors/${domain}`);
      if (r.status === 401) return void (window.location.href = `/login?next=/brand-monitors/${domain}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Monitör alınamadı");
      setD(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Monitör alınamadı");
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain]);

  async function runNow() {
    setBusy("run");
    setNote(null);
    try {
      const r = await fetch("/api/brand-monitors/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: decodeURIComponent(domain) }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Çalıştırılamadı");
      setNote({ t: `Test tamamlandı: ${j.prompts} prompt × ${j.engines} motor.` });
      await load();
    } catch (e) {
      setNote({ t: e instanceof Error ? e.message : "Çalıştırılamadı", bad: true });
    } finally {
      setBusy(null);
    }
  }

  async function saveSchedule(p: { active?: boolean; intervalDays?: number }) {
    setBusy("schedule");
    setNote(null);
    try {
      const r = await fetch("/api/brand-monitors/schedule", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: decodeURIComponent(domain), ...p }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Kaydedilemedi");
      setD((x) => (x ? { ...x, schedule: j.schedule } : x));
    } catch (e) {
      setNote({ t: e instanceof Error ? e.message : "Kaydedilemedi", bad: true });
    } finally {
      setBusy(null);
    }
  }

  if (err)
    return (
      <div className="space-y-4">
        <Link href="/brand-monitors" className="text-sm text-ink/55 hover:text-ink">
          ← Monitörler
        </Link>
        <ErrorBlock
          message={err}
          onRetry={() => {
            setErr(null);
            load();
          }}
        />
      </div>
    );
  if (!d) return <PageSkeleton />;

  const sch = d.schedule;
  const active = !!sch?.active;
  const every = sch?.intervalDays ?? 7;
  const nextAt = new Date(new Date(d.lastRunAt).getTime() + every * 864e5);
  const queries = d.prompts.length * Math.max(1, d.engines.length);
  const net = netSentiment(d.sentiment);
  const timeline = d.timeline.map((t) => ({ ...t, label: new Date(t.at).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }), v: Math.round(t.visibility * 100) }));

  return (
    <div className="space-y-6">
      <PageHeader
        back={
          <Link href="/brand-monitors" className="hover:text-ink">
            ← LLM Marka Monitörleri
          </Link>
        }
        title={`${d.brand.name} monitörü`}
        description={
          <>
            Son çalışma {fmt(d.lastRunAt)} · {d.brand.domain}
            {d.demoMode && <span className="ml-2 rounded bg-warn/10 px-1.5 py-0.5 text-[11px] font-medium text-warn">demo verisi</span>}
          </>
        }
        actions={
          <button type="button" onClick={runNow} disabled={!!busy || !!d.legacy} className="h-8 rounded-[10px] border border-border bg-panel px-3 text-sm font-medium hover:bg-[#fafafa] disabled:opacity-50">
            {busy === "run" ? "Çalışıyor…" : "↻ Şimdi çalıştır"}
          </button>
        }
      />

      {active ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-panel px-4 py-3 shadow-[0_1px_2px_rgba(13,18,28,0.05)]">
          <div className="flex items-start gap-2.5">
            <span className="mt-1.5 h-2 w-2 rounded-full bg-seo" />
            <div>
              <div className="text-sm font-medium">İzleme açık</div>
              <div className="text-xs text-sub">
                Her {every === 1 ? "gün" : `${every} günde bir`} otomatik çalışır · sonraki çalışma {nextAt.getTime() < Date.now() ? "sıradaki kontrolde" : fmt(nextAt.toISOString())} · her çalışma {queries} AI sorgusu
                {sch?.lastError && <span className="text-danger"> · son otomatik çalışma hatası: {sch.lastError}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select value={every} disabled={!!busy} onChange={(e) => saveSchedule({ intervalDays: Number(e.target.value) })} className="h-8 rounded-[10px] border border-border bg-panel px-2 text-sm outline-none">
              <option value={1}>Günlük</option>
              <option value={3}>3 günde bir</option>
              <option value={7}>Haftalık</option>
              <option value={14}>2 haftada bir</option>
              <option value={30}>Aylık</option>
            </select>
            <button type="button" disabled={!!busy} onClick={() => saveSchedule({ active: false })} className="h-8 rounded-[10px] border border-border px-3 text-sm font-medium hover:bg-[#fafafa] disabled:opacity-50">
              Duraklat
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-warn/30 bg-warn/5 px-4 py-3">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-warn text-[10px] font-medium text-white">!</span>
            <div>
              <div className="text-sm font-medium text-warn">İzleme duraklatıldı</div>
              <div className="text-xs text-sub">
                Veri toplama duruyor. Markanı AI modellerinde takip etmeye devam etmek için izlemeyi başlat ({queries} AI sorgusu / çalışma).
              </div>
            </div>
          </div>
          <button type="button" disabled={!!busy || !!d.legacy} onClick={() => saveSchedule({ active: true })} className="text-sm font-medium text-accent underline disabled:opacity-50">
            ▶ İzlemeyi başlat
          </button>
        </div>
      )}

      {note && <div className={`rounded-xl px-4 py-2.5 text-sm ${note.bad ? "bg-danger/10 text-danger" : "bg-seo/10 text-seo"}`}>{note.t}</div>}

      {d.legacy && (
        <div className="rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-ink/65">
          Bu monitörün son testi prompt bazında cevapları saklamadan önce yapılmış. Prompt ve cevap detaylarını görmek için testi bir kez yeniden çalıştır.
        </div>
      )}

      {/* KPI kartları */}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-panel p-5 shadow-[0_1px_2px_rgba(13,18,28,0.05)]">
          <div className="text-sm font-medium">Görünürlük</div>
          <div className="text-xs text-ink/45">Markanın cevaplarda geçme oranı</div>
          <div className="mt-3 flex items-center gap-3">
            <ScoreRing value={d.visibility * 100} size={40} stroke={4} />
            <div>
              <div className="text-2xl font-medium tabular-nums">{pct(d.visibility)}</div>
              <div className="text-[11px] text-ink/45">tüm motorlarda</div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-panel p-5 shadow-[0_1px_2px_rgba(13,18,28,0.05)]">
          <div className="text-sm font-medium">Duygu</div>
          <div className="text-xs text-ink/45">AI&apos;ın markanı ne kadar olumlu anlattığı</div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-medium tabular-nums">{net == null ? "—" : `${net > 0 ? "+" : ""}${net}`}</span>
            <span className="text-xs text-ink/50">({sentimentLabel(d.sentiment)})</span>
          </div>
          <div className="mt-2">
            <SentimentBar value={d.sentiment} width={260} />
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-panel p-5 shadow-[0_1px_2px_rgba(13,18,28,0.05)]">
          <div className="text-sm font-medium">Promptlar</div>
          <div className="text-xs text-ink/45">İzlenen sorular</div>
          <div className="mt-3 text-2xl font-medium tabular-nums">
            {d.prompts.length} <span className="text-sm font-normal text-ink/50">prompt</span>
          </div>
          <div className="text-[11px] text-ink/45">{d.engines.length} AI motorunda</div>
        </div>
      </div>

      {/* Sekmeler */}
      <UnderlineTabs
        value={TABS.indexOf(tab)}
        onChange={(i) => setTab(TABS[i])}
        tabs={[
          { label: "Promptlar", count: d.prompts.length },
          { label: "Görünürlük" },
          { label: "Duygu" },
          { label: "Rakipler", count: d.summaries.length - 1 || null },
          { label: "Kaynaklar", count: d.sources.length || null },
        ]}
      />

      {tab === "prompts" && <PromptResults prompts={d.prompts} brandName={d.brand.name} runAt={d.lastRunAt} />}

      {tab === "visibility" && (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className="rounded-2xl border border-border bg-panel p-5 shadow-[0_1px_2px_rgba(13,18,28,0.05)]">
            <div className="text-sm font-medium">Motor kırılımı</div>
            <div className="text-xs text-ink/45">AI motoru başına görünürlük</div>
            <ul className="mt-3 space-y-2.5">
              {d.engines.map((e) => (
                <li key={e.engine} className="flex items-center gap-2.5 text-sm">
                  <EngineDot engine={e.engine} />
                  <span className="flex-1">{ENGINE_META[e.engine]?.name ?? e.engine}</span>
                  <ScoreRing value={e.visibility * 100} size={28} />
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-border bg-panel p-5 shadow-[0_1px_2px_rgba(13,18,28,0.05)]">
            <div className="text-sm font-medium">Zaman içinde görünürlük</div>
            <div className="text-xs text-ink/45">Her GEO testi bir nokta</div>
            {timeline.length < 2 ? (
              <div className="flex h-56 items-center justify-center text-sm text-ink/45">Grafik için en az 2 test gerekiyor.</div>
            ) : (
              <div className="mt-3 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" vertical={false} />
                    <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={34} tickFormatter={(v) => `${v}%`} />
                    <Tooltip formatter={(v) => [`${v}%`, "Görünürlük"]} contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
                    <Line type="monotone" dataKey="v" stroke="#4f00ff" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "sentiment" && (
        <div className="overflow-hidden rounded-2xl border border-border bg-panel shadow-[0_1px_2px_rgba(13,18,28,0.05)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-[#fafafa] text-left text-xs font-medium text-sub">
                <th className="px-4 py-2.5 font-medium">Motor</th>
                <th className="py-2.5 pr-4 font-medium">Net duygu</th>
                <th className="py-2.5 pr-4 font-medium">Dağılım</th>
                <th className="py-2.5 pr-4 font-medium">Etiket</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {d.engines.map((e) => {
                const n = netSentiment(e.sentiment);
                return (
                  <tr key={e.engine}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <EngineDot engine={e.engine} />
                        {ENGINE_META[e.engine]?.name ?? e.engine}
                      </div>
                    </td>
                    <td className="py-3 pr-4 font-medium tabular-nums">{n == null ? "—" : `${n > 0 ? "+" : ""}${n}`}</td>
                    <td className="py-3 pr-4">
                      <SentimentBar value={e.sentiment} width={140} />
                    </td>
                    <td className="py-3 pr-4 text-xs text-ink/60">{sentimentLabel(e.sentiment)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="border-t border-border px-4 py-2.5 text-[11px] text-ink/45">Duygu, markanın geçtiği cümlelerden kurallarla hesaplanır. Marka geçmeyen cevaplar duyguya katılmaz.</p>
        </div>
      )}

      {tab === "rivals" && (
        <div className="overflow-hidden rounded-2xl border border-border bg-panel shadow-[0_1px_2px_rgba(13,18,28,0.05)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-[#fafafa] text-left text-xs font-medium text-sub">
                <th className="px-4 py-2.5 font-medium">Marka</th>
                <th className="py-2.5 pr-4 text-center font-medium">Görünürlük</th>
                <th className="py-2.5 pr-4 text-right font-medium">Ses payı</th>
                <th className="hidden py-2.5 pr-4 text-right font-medium md:table-cell">Ort. sıra</th>
                <th className="py-2.5 pr-4 font-medium">Duygu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...d.summaries]
                .sort((a, b) => b.visibility - a.visibility)
                .map((s) => (
                  <tr key={s.domain} className={s.domain === d.brand.domain ? "bg-accent/5" : ""}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`https://www.google.com/s2/favicons?domain=${s.domain}&sz=32`} alt="" className="h-4 w-4 rounded" />
                        <span className="font-medium">{s.brand}</span>
                        {s.domain === d.brand.domain && <span className="rounded bg-accent px-1.5 text-[10px] font-medium text-white">sen</span>}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-center">
                      <ScoreRing value={s.visibility * 100} />
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">{pct(s.shareOfVoice)}</td>
                    <td className="hidden py-3 pr-4 text-right tabular-nums text-ink/60 md:table-cell">{s.avgPosition != null ? s.avgPosition.toFixed(1) : "—"}</td>
                    <td className="py-3 pr-4">
                      <SentimentBar value={s.avgSentiment} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "sources" && (
        <div className="overflow-hidden rounded-2xl border border-border bg-panel shadow-[0_1px_2px_rgba(13,18,28,0.05)]">
          {d.sources.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-ink/45">Bu testte kaynak gösterilmedi.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-[#fafafa] text-left text-xs font-medium text-sub">
                  <th className="px-4 py-2.5 font-medium">Kaynak</th>
                  <th className="py-2.5 pr-4 font-medium">Tür</th>
                  <th className="py-2.5 pr-4 text-right font-medium">Atıf</th>
                  <th className="py-2.5 pr-4 text-right font-medium">Pay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {d.sources.map((s) => (
                  <tr key={s.domain}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`https://www.google.com/s2/favicons?domain=${s.domain}&sz=32`} alt="" className="h-4 w-4 rounded" />
                        {s.domain}
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-ink/60">{SOURCE_TYPE[s.type] ?? s.type}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{s.count}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-ink/60">{pct(s.citationShare)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

    </div>
  );
}
