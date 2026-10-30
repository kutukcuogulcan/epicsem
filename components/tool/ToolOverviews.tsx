"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import KpiCard from "./KpiCard";
import GhostChart from "./GhostChart";

const TT = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, fontSize: 12 };
const day = (d: string) => new Date(d).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
const short = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
const tone = (n: number | null) => (n == null ? "bg-muted text-ink/40" : n >= 80 ? "bg-seo/10 text-seo" : n >= 50 ? "bg-warn/10 text-warn" : "bg-danger/10 text-danger");

function useTool<T>(tool: string, refreshKey: number) {
  const [d, setD] = useState<T | null>(null);
  useEffect(() => {
    fetch(`/api/overview/tools?tool=${tool}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setD)
      .catch(() => setD(null));
  }, [tool, refreshKey]);
  return d;
}

function Skeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-28 rounded-2xl bg-muted" />)}</div>
      <div className="h-64 rounded-2xl bg-muted" />
    </div>
  );
}

function Panel({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-panel shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <span className="text-sm font-bold">{title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

/* ============================== AXO Monitoring ============================== */
interface MonitorData {
  pages: { id: number; url: string; label: string | null; score: number | null; ai: number | null; prevScore: number | null; lastAt: string | null; openAlerts: number }[];
  series: { date: string; score: number; ai: number; checks: number }[];
  alerts: { date: string; count: number }[];
}

export function MonitorOverview({ refreshKey = 0 }: { refreshKey?: number }) {
  const d = useTool<MonitorData>("monitor", refreshKey);
  if (!d) return <Skeleton />;
  if (!d.pages.length) return <GhostChart title="Henüz izlenen sayfa yok" body="Aşağıdan bir sayfa ekle — SEO ve AI erişim skorları her gün kontrol edilir, düşüşler burada grafikte ve uyarı olarak görünür." />;
  const scored = d.pages.filter((p) => p.score != null);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  const avgSeo = avg(scored.map((p) => p.score!));
  const avgAi = avg(scored.map((p) => p.ai ?? 0));
  const drops = d.pages.filter((p) => p.score != null && p.prevScore != null && p.score < p.prevScore).length;
  const open = d.pages.reduce((a, p) => a + p.openAlerts, 0);
  const s = d.series;
  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="İzlenen sayfa" value={String(d.pages.length)} spark={s.map((x) => x.checks)} hint={`${s.reduce((a, x) => a + x.checks, 0)} kontrol / 90 gün`} />
        <KpiCard label="Ort. SEO skoru" value={String(avgSeo)} delta={s.length > 1 ? s[s.length - 1].score - s[0].score : null} spark={s.map((x) => x.score)} />
        <KpiCard label="Ort. AI erişim" value={String(avgAi)} delta={s.length > 1 ? s[s.length - 1].ai - s[0].ai : null} spark={s.map((x) => x.ai)} color="#16a34a" />
        <KpiCard label="Açık uyarı" value={String(open)} spark={d.alerts.map((a) => a.count)} color="#ef4444" hint={drops ? `${drops} sayfada düşüş` : "düşüş yok"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Skor trendi (tüm sayfalar ort.)" right={<span className="flex gap-3 text-xs text-ink/50"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" />SEO</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-seo" />AI erişim</span></span>}>
          <div className="h-64 px-2 pt-4">
            {s.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={s.map((x) => ({ ...x, date: day(x.date) }))}>
                  <defs>
                    <linearGradient id="mS" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5d16ff" stopOpacity={0.2} /><stop offset="100%" stopColor="#5d16ff" stopOpacity={0} /></linearGradient>
                    <linearGradient id="mA" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#16a34a" stopOpacity={0.16} /><stop offset="100%" stopColor="#16a34a" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={30} />
                  <Tooltip contentStyle={TT} />
                  <Area type="monotone" dataKey="score" name="SEO" stroke="#5d16ff" strokeWidth={2.5} fill="url(#mS)" />
                  <Area type="monotone" dataKey="ai" name="AI erişim" stroke="#16a34a" strokeWidth={2.5} fill="url(#mA)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="p-6 text-sm text-ink/45">Trend için en az iki günlük kontrol gerekiyor. Günlük kontroller birikince burada görünecek.</p>
            )}
          </div>
        </Panel>
        <Panel title="Sayfalar">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-muted text-left text-xs font-semibold uppercase text-slate-500"><th className="px-5 py-2 text-left font-medium">Sayfa</th><th className="py-2 text-left font-medium">SEO</th><th className="py-2 text-left font-medium">AI</th><th className="py-2 pr-5 text-right font-medium">Uyarı</th></tr></thead>
            <tbody>
              {d.pages.slice(0, 8).map((p) => {
                const delta = p.score != null && p.prevScore != null ? p.score - p.prevScore : 0;
                return (
                  <tr key={p.id} className="border-t border-border">
                    <td className="max-w-[11rem] truncate px-5 py-2.5 font-medium" title={p.url}>{p.label || short(p.url)}</td>
                    <td className="py-2.5"><span className={`rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${tone(p.score)}`}>{p.score ?? "—"}</span>{delta !== 0 && <span className={`ml-1 text-[10px] font-bold ${delta > 0 ? "text-seo" : "text-danger"}`}>{delta > 0 ? `+${delta}` : delta}</span>}</td>
                    <td className="py-2.5"><span className={`rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${tone(p.ai)}`}>{p.ai ?? "—"}</span></td>
                    <td className="py-2.5 pr-5 text-right">{p.openAlerts ? <span className="rounded-md bg-danger/10 px-2 py-0.5 text-xs font-bold text-danger">{p.openAlerts}</span> : <span className="text-xs text-seo">✓</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </div>
    </section>
  );
}

/* ============================== Kampanyalar ============================== */
interface CampaignData {
  weeks: { week: string; drafts: number; published: number }[];
  drafts: number;
  published: number;
  last30: number;
}
interface CampaignLite {
  id: number;
  brandName: string;
  brandDomain: string;
  frequency: string;
  status: string;
  lastRunAt: string | null;
  lastRunNote: string | null;
  source?: string;
  postsPerRun?: number;
  nextRunAt?: string | null;
}

const FREQ_DAYS: Record<string, number> = { daily: 1, weekly: 7, monthly: 30 };
const FREQ_TR: Record<string, string> = { daily: "günlük", weekly: "haftalık", monthly: "aylık" };
const SRC_TR: Record<string, string> = { gap: "Gap Analysis", rss: "RSS", keywords: "Anahtar kelime", feed: "Besleme" };

export function CampaignsOverview({ campaigns, refreshKey = 0 }: { campaigns: CampaignLite[]; refreshKey?: number }) {
  const d = useTool<CampaignData>("campaigns", refreshKey);
  if (!d) return <Skeleton />;
  const active = campaigns.filter((c) => c.status === "active").length;
  if (!campaigns.length && !d.drafts) return <GhostChart title="Henüz autoblog yok" body="Bir autoblog kur — Gap Analysis, bir RSS beslemesi ya da anahtar kelime listen düzenli olarak taslak makaleye dönüşür ve üretim burada grafikte izlenir." />;
  const next = (c: CampaignLite) => {
    if (c.status !== "active") return "duraklatıldı";
    if (!c.lastRunAt) return "ilk çalıştırma bekleniyor";
    const t = c.nextRunAt ? new Date(c.nextRunAt).getTime() : new Date(c.lastRunAt).getTime() + (FREQ_DAYS[c.frequency] ?? 7) * 864e5;
    return t < Date.now() ? "sırada" : day(new Date(t).toISOString());
  };
  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Aktif autoblog" value={`${active}/${campaigns.length}`} />
        <KpiCard label="Son 30 gün taslak" value={String(d.last30)} spark={d.weeks.map((w) => w.drafts)} />
        <KpiCard label="Toplam taslak" value={String(d.drafts)} spark={d.weeks.map((w) => w.drafts)} color="#0ea5e9" />
        <KpiCard label="Yayına gönderilen" value={String(d.published)} spark={d.weeks.map((w) => w.published)} color="#16a34a" hint={d.drafts ? `%${Math.round((d.published / d.drafts) * 100)}` : undefined} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Haftalık içerik üretimi">
          <div className="h-60 px-2 pt-4">
            {d.weeks.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.weeks.map((w) => ({ ...w, week: day(w.week) }))} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="week" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={26} />
                  <Tooltip contentStyle={TT} cursor={{ fill: "rgba(93,22,255,0.04)" }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="drafts" name="Taslak" fill="#5d16ff" maxBarSize={28} radius={[6, 6, 0, 0]} />
                  <Bar dataKey="published" name="Yayına gönderilen" fill="#16a34a" maxBarSize={28} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="p-6 text-sm text-ink/45">Son 12 haftada taslak üretilmedi.</p>
            )}
          </div>
        </Panel>
        <Panel title="Autoblog durumu">
          <div className="divide-y divide-border">
            {campaigns.length === 0 && <div className="px-5 py-6 text-sm text-ink/45">Kampanya yok.</div>}
            {campaigns.slice(0, 6).map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{c.brandName}</div>
                  <div className="truncate text-[11px] text-ink/45">{SRC_TR[c.source ?? "gap"]} · {FREQ_TR[c.frequency] ?? c.frequency}{(c.postsPerRun ?? 1) > 1 ? ` · ${c.postsPerRun} yazı` : ""}</div>
                </div>
                <div className="shrink-0 text-right">
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${c.status === "active" ? "bg-seo/10 text-seo" : "bg-muted text-ink/50"}`}>{c.status === "active" ? "Aktif" : "Duraklatıldı"}</span>
                  <div className="mt-0.5 text-[10px] text-ink/40">sonraki: {next(c)}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </section>
  );
}

/* ============================== Yerel İşletme ============================== */
interface LocalData {
  weeks: { week: string; posts: number; replies: number }[];
  ratings: Record<string, number>;
  recent: { id: number; kind: string; business: string; input: string; output: string; rating: number | null; createdAt: string }[];
  posts: number;
  replies: number;
  businesses: number;
}

export function LocalOverview({ refreshKey = 0 }: { refreshKey?: number }) {
  const d = useTool<LocalData>("local", refreshKey);
  if (!d) return <Skeleton />;
  if (!d.posts && !d.replies) return <GhostChart title="Henüz üretim yok" body="Aşağıdan bir Google Business Profile gönderisi ya da yorum yanıtı üret — haftalık üretim, puan dağılımı ve son taslakların burada birikir." />;
  const ratingData = [1, 2, 3, 4, 5].map((r) => ({ r: `${r}★`, n: d.ratings[String(r)] ?? 0 }));
  const totalRated = ratingData.reduce((a, x) => a + x.n, 0);
  const avgRating = totalRated ? (ratingData.reduce((a, x, i) => a + x.n * (i + 1), 0) / totalRated).toFixed(1) : "—";
  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="GBP gönderisi" value={String(d.posts)} spark={d.weeks.map((w) => w.posts)} />
        <KpiCard label="Yorum yanıtı" value={String(d.replies)} spark={d.weeks.map((w) => w.replies)} color="#16a34a" />
        <KpiCard label="Yanıtlanan yorum ort." value={avgRating === "—" ? "—" : `${avgRating}★`} color="#f59e0b" hint={`${totalRated} puanlı yorum`} />
        <KpiCard label="İşletme" value={String(d.businesses)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Haftalık üretim">
          <div className="h-52 px-2 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={d.weeks.map((w) => ({ ...w, week: day(w.week) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="week" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={24} />
                <Tooltip contentStyle={TT} />
                <Line type="monotone" dataKey="posts" name="Gönderi" stroke="#5d16ff" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="replies" name="Yanıt" stroke="#16a34a" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Yanıtlanan yorumların puanı">
          <div className="h-52 px-2 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ratingData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="r" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={24} />
                <Tooltip contentStyle={TT} cursor={{ fill: "rgba(245,158,11,0.06)" }} />
                <Bar dataKey="n" name="Yorum" fill="#f59e0b" maxBarSize={44} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Son taslaklar">
          <div className="max-h-52 divide-y divide-border overflow-y-auto">
            {d.recent.map((r) => (
              <div key={r.id} className="px-4 py-2.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className={`rounded px-1.5 py-0.5 font-bold ${r.kind === "gbp-post" ? "bg-accent/10 text-accent" : "bg-seo/10 text-seo"}`}>{r.kind === "gbp-post" ? "Gönderi" : `Yanıt${r.rating ? ` · ${r.rating}★` : ""}`}</span>
                  <span className="text-ink/40">{r.business} · {day(r.createdAt)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-ink/65">{r.output}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </section>
  );
}

/* ============================== Clients (ajans portföyü) ============================== */
interface ClientRow {
  id: number;
  name: string;
  domain: string;
  seoScore: number | null;
  axoScore: number | null;
  health: number | null;
  pages: number | null;
  errors: number | null;
  visibility: number | null;
  visibilityTrend: { date: string; visibility: number }[];
  lastActivity: string | null;
}

function Spark({ data }: { data: number[] }) {
  if (data.length < 2) return <span className="text-[10px] text-ink/30">—</span>;
  const w = 64;
  const h = 20;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`).join(" ");
  const up = data[data.length - 1] >= data[0];
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={up ? "#16a34a" : "#ef4444"} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export function ClientsOverview({ refreshKey = 0 }: { refreshKey?: number }) {
  const d = useTool<{ clients: ClientRow[] }>("clients", refreshKey);
  if (!d) return <Skeleton />;
  const cs = d.clients;
  if (!cs.length) return <GhostChart title="Henüz müşteri yok" body="Aşağıdan müşterilerini ekle — her birinin SEO skoru, site sağlığı ve AI görünürlüğü tek portföy tablosunda yan yana görünür." />;
  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null);
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  const atRisk = cs.filter((c) => (c.health != null && c.health < 50) || (c.visibility != null && c.visibility < 20) || (c.seoScore != null && c.seoScore < 50));
  const chart = cs.map((c) => ({ name: c.name.length > 14 ? `${c.name.slice(0, 13)}…` : c.name, SEO: c.seoScore ?? 0, "Site sağlığı": c.health ?? 0, "AI görünürlük": c.visibility ?? 0 }));
  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Müşteri" value={String(cs.length)} />
        <KpiCard label="Ort. SEO skoru" value={avg(cs.map((c) => c.seoScore))?.toString() ?? "—"} />
        <KpiCard label="Ort. AI görünürlük" value={avg(cs.map((c) => c.visibility)) != null ? `%${avg(cs.map((c) => c.visibility))}` : "—"} color="#16a34a" />
        <KpiCard label="Dikkat isteyen" value={String(atRisk.length)} color="#ef4444" hint="düşük skor/görünürlük" />
      </div>
      <Panel title="Müşteri karşılaştırması">
        <div className="h-60 px-2 pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={28} />
              <Tooltip contentStyle={TT} cursor={{ fill: "rgba(93,22,255,0.04)" }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="SEO" fill="#5d16ff" maxBarSize={36} radius={[5, 5, 0, 0]} />
              <Bar dataKey="Site sağlığı" fill="#0ea5e9" maxBarSize={36} radius={[5, 5, 0, 0]} />
              <Bar dataKey="AI görünürlük" fill="#16a34a" maxBarSize={36} radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      <Panel title="Portföy">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-xs font-semibold uppercase text-slate-500">
                <th className="px-5 py-2.5 font-medium">Müşteri</th>
                <th className="py-2.5 pr-3 font-medium">SEO</th>
                <th className="py-2.5 pr-3 font-medium">AXO</th>
                <th className="py-2.5 pr-3 font-medium">Site sağlığı</th>
                <th className="py-2.5 pr-3 font-medium">AI görünürlük</th>
                <th className="py-2.5 pr-3 font-medium">Trend</th>
                <th className="py-2.5 pr-5 text-right font-medium">Son işlem</th>
              </tr>
            </thead>
            <tbody>
              {cs.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-muted/40">
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(c.domain)}&sz=32`} alt="" className="h-4 w-4 rounded" />
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{c.name}</div>
                        <div className="truncate text-[11px] text-ink/40">{c.domain}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 pr-3">{c.seoScore != null ? <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${tone(c.seoScore)}`}>{c.seoScore}</span> : <Link href={`/audit?url=${c.domain}`} className="text-[11px] font-semibold text-accent">Denetle</Link>}</td>
                  <td className="py-2.5 pr-3">{c.axoScore != null ? <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${tone(c.axoScore)}`}>{c.axoScore}</span> : <span className="text-xs text-ink/30">—</span>}</td>
                  <td className="py-2.5 pr-3">{c.health != null ? <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${tone(c.health)}`}>{c.health}</span> : <Link href="/import" className="text-[11px] font-semibold text-accent">Tara</Link>}{c.errors ? <span className="ml-1 text-[10px] text-danger">{c.errors} hata</span> : null}</td>
                  <td className="py-2.5 pr-3">{c.visibility != null ? <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${tone(c.visibility * 1.25)}`}>%{c.visibility}</span> : <Link href={`/geo?clientId=${c.id}`} className="text-[11px] font-semibold text-accent">GEO testi</Link>}</td>
                  <td className="py-2.5 pr-3"><Spark data={c.visibilityTrend.map((x) => x.visibility)} /></td>
                  <td className="py-2.5 pr-5 text-right text-xs text-ink/45">{c.lastActivity ? day(c.lastActivity) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </section>
  );
}
