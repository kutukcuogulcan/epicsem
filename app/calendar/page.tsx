"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Drawer, ErrorBlock, PageHeader, UnderlineTabs } from "@/components/ui";
import { useProject } from "@/components/ProjectProvider";

/**
 * İçerik Takvimi + Onay Kuyruğu (AI kullanmaz).
 * Takvim: yayınlanan, sitede zamanlanan, planlanan ve yeni üretilen yazılar + Autoblog'un önümüzdeki çalışmaları.
 * Onay kuyruğu: Autoblog'un ürettiği, henüz onaylanmamış taslaklar — Onayla / Düzenle / Reddet.
 */

interface Draft {
  id: number;
  sourceUrl: string;
  article: { title: string; metaDescription: string; bodyMarkdown: string; openPlaceholders?: string[] };
  status: "draft" | "published-to-wp";
  publishedPostUrl: string | null;
  publishedEditUrl: string | null;
  createdAt: string;
  site?: string | null;
  publishState?: "remote-draft" | "scheduled" | "published" | "error" | null;
  scheduledAt?: string | null;
  publishError?: string | null;
  campaignId?: number | null;
  publishedAt?: string | null;
  approvedAt?: string | null;
  plannedFor?: string | null;
}
interface Campaign {
  id: number;
  brandName: string;
  brandDomain: string;
  frequency: "daily" | "weekly" | "monthly";
  status: "active" | "paused";
  postsPerRun: number;
  mode: "review" | "cms-draft" | "publish";
  nextRunAt: string | null;
  lastRunAt: string | null;
  source: string;
  feed: { name: string } | null;
}

type Kind = "published" | "scheduled" | "remote" | "planned" | "created" | "error";
interface Ev {
  key: string;
  day: string; // YYYY-MM-DD (yerel)
  kind: Kind | "run";
  title: string;
  draft?: Draft;
  campaign?: Campaign;
}

const BTN1 = "inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-accent px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60";
const BTN2 = "inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-panel px-3 text-sm font-medium text-ink shadow-[inset_0_0_0_1px_#D5D7DA,0_1px_2px_rgba(13,18,28,0.05)] hover:bg-muted disabled:opacity-60";
const BTNDANGER = "inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-panel px-3 text-sm font-medium text-danger shadow-[inset_0_0_0_1px_#F3C2C2,0_1px_2px_rgba(13,18,28,0.05)] hover:bg-danger/5 disabled:opacity-60";
const CARD = "rounded-2xl border border-border bg-panel shadow-[0_1px_2px_rgba(13,18,28,0.05)]";
const INPUT = "h-9 w-full rounded-[10px] border border-border bg-panel px-3 text-sm outline-none focus:border-[#BDB4FF]";
const chip = (on: boolean) =>
  `inline-flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-[13px] font-medium whitespace-nowrap ${on ? "bg-accent/5 text-ink shadow-[inset_0_0_0_1px_#BDB4FF]" : "bg-panel text-sub shadow-[inset_0_0_0_1px_#E4E5E8] hover:text-ink"}`;

const KIND: Record<Ev["kind"], { label: string; cls: string; dot: string }> = {
  published: { label: "Yayında", cls: "bg-seo/10 text-seo", dot: "bg-seo" },
  scheduled: { label: "Sitede zamanlandı", cls: "bg-accent/10 text-accent", dot: "bg-accent" },
  remote: { label: "Sitede taslak", cls: "bg-sky-50 text-sky-700", dot: "bg-sky-500" },
  planned: { label: "Planlandı", cls: "bg-violet-50 text-violet-700 shadow-[inset_0_0_0_1px_#DDD6FE]", dot: "bg-violet-400" },
  created: { label: "Taslak üretildi", cls: "bg-muted text-ink/70", dot: "bg-slate-400" },
  error: { label: "Yayın hatası", cls: "bg-danger/10 text-danger", dot: "bg-danger" },
  run: { label: "Autoblog çalışacak", cls: "bg-panel text-sub shadow-[inset_0_0_0_1px_#D5D7DA] border-dashed", dot: "bg-warn" },
};
const FREQ_DAYS = { daily: 1, weekly: 7, monthly: 30 } as const;
const FREQ_LABEL = { daily: "Günlük", weekly: "Haftalık", monthly: "Aylık" } as const;
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayOf = (iso: string) => ymd(new Date(iso));
const fmtDay = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const words = (md: string) => (md.replace(/[#*_>`\[\]()!-]/g, " ").match(/\S+/g) ?? []).length;
const hostOf = (s: string) => s.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
const sourceLabel = (s: string) => (s.startsWith("keyword:") ? `Kelime · ${s.slice(8)}` : s === "editor" ? "Editörde yazıldı" : s.replace(/^https?:\/\/(www\.)?/, ""));

function draftKind(d: Draft): { kind: Kind; day: string } {
  if (d.publishState === "error") return { kind: "error", day: dayOf(d.publishedAt ?? d.createdAt) };
  if (d.publishState === "published") return { kind: "published", day: dayOf(d.publishedAt ?? d.createdAt) };
  if (d.publishState === "scheduled" && d.scheduledAt) return { kind: "scheduled", day: dayOf(d.scheduledAt) };
  if (d.publishedPostUrl) return { kind: "remote", day: dayOf(d.publishedAt ?? d.createdAt) };
  if (d.plannedFor) return { kind: "planned", day: d.plannedFor };
  return { kind: "created", day: dayOf(d.createdAt) };
}
const isPending = (d: Draft) => d.campaignId != null && !d.publishedPostUrl && !d.approvedAt;
const isApproved = (d: Draft) => !!d.approvedAt && !d.publishedPostUrl;

export default function CalendarPage() {
  const { project } = useProject();
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [open, setOpen] = useState<Draft | null>(null);
  const [runOpen, setRunOpen] = useState<{ c: Campaign; day: string } | null>(null);
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState<Draft[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [qf, setQf] = useState<"pending" | "approved" | "all">("pending");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setError(null);
    try {
      const [a, b] = await Promise.all([fetch("/api/content?limit=300"), fetch("/api/campaigns")]);
      const da = await a.json();
      if (!a.ok) throw new Error(da.error || "Yazılar yüklenemedi");
      const db = b.ok ? await b.json() : { campaigns: [] };
      setDrafts(da.drafts ?? []);
      setCampaigns(db.campaigns ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yüklenemedi");
      setDrafts([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load, project?.domain]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "queue") setTab(1);
  }, []);

  const projCampaigns = useMemo(
    () => campaigns.filter((c) => !project || hostOf(c.brandDomain) === hostOf(project.domain)),
    [campaigns, project]
  );
  const campaignName = useCallback(
    (id: number | null | undefined) => {
      const c = campaigns.find((x) => x.id === id);
      return c ? `${c.feed?.name ?? c.brandName} · ${FREQ_LABEL[c.frequency]}` : null;
    },
    [campaigns]
  );

  const today = ymd(new Date());
  const monthStart = cursor;
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);

  const events = useMemo(() => {
    const out: Ev[] = [];
    for (const d of drafts ?? []) {
      const { kind, day } = draftKind(d);
      out.push({ key: `d${d.id}`, day, kind, title: d.article.title || sourceLabel(d.sourceUrl), draft: d });
    }
    // Autoblog projeksiyonu: aktif kampanyaların bu ay içindeki gelecekteki çalışmaları.
    const end = new Date(monthEnd.getFullYear(), monthEnd.getMonth(), monthEnd.getDate(), 23, 59).getTime();
    for (const c of projCampaigns) {
      if (c.status !== "active") continue;
      const step = FREQ_DAYS[c.frequency] * 864e5;
      let t = c.nextRunAt ? new Date(c.nextRunAt).getTime() : c.lastRunAt ? new Date(c.lastRunAt).getTime() + step : Date.now();
      if (t < Date.now()) t = Date.now();
      for (let i = 0; i < 40 && t <= end; i++, t += step) {
        if (t >= monthStart.getTime()) out.push({ key: `r${c.id}-${i}`, day: ymd(new Date(t)), kind: "run", title: `${c.postsPerRun} yazı · ${c.feed?.name ?? c.brandName}`, campaign: c });
      }
    }
    return out;
  }, [drafts, projCampaigns, monthStart, monthEnd]);

  const byDay = useMemo(() => {
    const m = new Map<string, Ev[]>();
    for (const e of events) m.set(e.day, [...(m.get(e.day) ?? []), e]);
    return m;
  }, [events]);

  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const lead = (first.getDay() + 6) % 7;
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - lead);
    const cells: { day: string; inMonth: boolean; date: number }[] = [];
    const total = Math.ceil((lead + monthEnd.getDate()) / 7) * 7;
    for (let i = 0; i < total; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      cells.push({ day: ymd(d), inMonth: d.getMonth() === cursor.getMonth(), date: d.getDate() });
    }
    return cells;
  }, [cursor, monthEnd]);

  const all = drafts ?? [];
  const pending = all.filter(isPending);
  const approved = all.filter(isApproved);
  const inMonth = (day: string) => day >= ymd(monthStart) && day <= ymd(monthEnd);
  const monthEvents = events.filter((e) => inMonth(e.day));
  const kpi = {
    pending: pending.length,
    planned: monthEvents.filter((e) => e.kind === "planned" || e.kind === "scheduled").length,
    published: monthEvents.filter((e) => e.kind === "published" || e.kind === "remote").length,
    runs: monthEvents.filter((e) => e.kind === "run" && e.day >= today).reduce((s, e) => s + (e.campaign?.postsPerRun ?? 0), 0),
    unplanned: approved.filter((d) => !d.plannedFor).length,
  };
  const nextRun = projCampaigns
    .filter((c) => c.status === "active" && c.nextRunAt)
    .map((c) => c.nextRunAt as string)
    .sort()[0];

  // ---------- eylemler ----------
  const patch = async (d: Draft, body: { approved?: boolean; plannedFor?: string | null }) => {
    setBusy(`p${d.id}`);
    setActionErr(null);
    try {
      const r = await fetch("/api/content", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: d.id, ...body }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Kaydedilemedi");
      setDrafts((xs) => (xs ?? []).map((x) => (x.id === d.id ? j.draft : x)));
      setOpen((o) => (o && o.id === d.id ? j.draft : o));
      return j.draft as Draft;
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Kaydedilemedi");
      return null;
    } finally {
      setBusy(null);
    }
  };
  const approveMany = async (ids: number[]) => {
    for (const id of ids) {
      const d = all.find((x) => x.id === id);
      if (d) await patch(d, { approved: true });
    }
    setSel(new Set());
  };
  const reject = async (list: Draft[]) => {
    setBusy("reject");
    setActionErr(null);
    try {
      for (const d of list) {
        const r = await fetch(`/api/content?id=${d.id}`, { method: "DELETE" });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Silinemedi");
      }
      const gone = new Set(list.map((d) => d.id));
      setDrafts((xs) => (xs ?? []).filter((x) => !gone.has(x.id)));
      setSel(new Set());
      setConfirmReject(null);
      setOpen(null);
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Silinemedi");
    } finally {
      setBusy(null);
    }
  };

  // ---------- kuyruk ----------
  const queueRows = useMemo(() => {
    const base = qf === "pending" ? pending : qf === "approved" ? approved : all.filter((d) => d.campaignId != null || d.approvedAt);
    const s = q.trim().toLocaleLowerCase("tr");
    return s ? base.filter((d) => `${d.article.title} ${d.sourceUrl}`.toLocaleLowerCase("tr").includes(s)) : base;
  }, [qf, pending, approved, all, q]);

  const actions = [
    pending.length > 0 && {
      kind: "Onay",
      color: "text-warn",
      title: `${pending.length} yazı onayını bekliyor`,
      body: "Autoblog'un ürettiği taslakları gözden geçir: onayla, editörde düzelt ya da reddet.",
      cta: (
        <button type="button" onClick={() => setTab(1)} className={BTN1}>
          Kuyruğu aç
        </button>
      ),
    },
    kpi.unplanned > 0 && {
      kind: "Plan",
      color: "text-accent",
      title: `${kpi.unplanned} onaylı yazının günü yok`,
      body: "Takvimde boş bir güne tıkla ve yazıyı o güne planla; yayın düzenin görünür olsun.",
      cta: (
        <button type="button" onClick={() => { setTab(1); setQf("approved"); }} className={BTN2}>
          Onaylananlar
        </button>
      ),
    },
    projCampaigns.filter((c) => c.status === "active").length === 0 && {
      kind: "Otomasyon",
      color: "text-seo",
      title: "Takvimi Autoblog doldursun",
      body: "Anahtar kelime ya da besleme listesinden günlük/haftalık taslak üretilir; hepsi önce bu kuyruğa düşer.",
      cta: (
        <Link href="/campaigns" className={BTN2}>
          Autoblog kur
        </Link>
      ),
    },
  ].filter(Boolean) as { kind: string; color: string; title: string; body: string; cta: React.ReactNode }[];

  const dayEvents = dayOpen ? byDay.get(dayOpen) ?? [] : [];
  const assignable = all.filter((d) => !d.publishedPostUrl && (d.approvedAt || d.campaignId == null) && d.plannedFor !== dayOpen).slice(0, 30);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bu ay ne yayınlanıyor?"
        description={
          drafts === null
            ? "Takvim yükleniyor…"
            : `${MONTHS[cursor.getMonth()]}: ${kpi.published} yayın, ${kpi.planned} planlı yazı${kpi.runs ? `, Autoblog'dan ${kpi.runs} yazı daha geliyor` : ""}. ${pending.length ? `${pending.length} taslak onay bekliyor.` : "Onay bekleyen taslak yok."}`
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/campaigns" className={BTN2}>
              Autoblog
            </Link>
            <Link href="/editor" className={BTN1}>
              Yeni yazı
            </Link>
          </div>
        }
      />

      {error && <ErrorBlock message={error} onRetry={load} />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {([
          ["Onay bekleyen", kpi.pending, "Autoblog taslağı", kpi.pending ? "text-warn" : ""],
          ["Bu ay planlı", kpi.planned, "planlandı + sitede zamanlandı", kpi.planned ? "text-accent" : ""],
          ["Bu ay yayınlanan", kpi.published, "yayında + sitede taslak", kpi.published ? "text-seo" : ""],
          ["Autoblog'dan gelecek", kpi.runs, "bu ay kalan çalışmalar", ""],
          ["Sonraki çalışma", nextRun ? new Date(nextRun).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }) : "—", nextRun ? new Date(nextRun).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "aktif Autoblog yok", ""],
        ] as const).map(([l, v, hint, col]) => (
          <div key={l} className={`${CARD} px-4 py-4`}>
            <div className="text-xs font-medium text-sub">{l}</div>
            <div className={`mt-1.5 text-[26px] font-semibold leading-8 tabular-nums ${col}`}>{drafts === null ? "…" : v}</div>
            <div className="mt-1 h-4 truncate text-[11px] text-sub">{hint}</div>
          </div>
        ))}
      </div>

      {actions.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Ne yapmalı?</h3>
          <div className={`grid gap-3 ${["", "md:grid-cols-1", "md:grid-cols-2", "md:grid-cols-3"][Math.min(actions.length, 3)]}`}>
            {actions.slice(0, 3).map((a) => (
              <div key={a.title} className={`${CARD} flex flex-col p-4`}>
                <div className={`text-[11px] font-semibold uppercase tracking-wide ${a.color}`}>{a.kind}</div>
                <h4 className="mt-1.5 text-sm font-semibold leading-5">{a.title}</h4>
                <p className="mt-1 text-[13px] text-sub">{a.body}</p>
                <div className="mt-auto flex justify-end pt-3">{a.cta}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <UnderlineTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { label: "Takvim", key: "cal" },
          { label: "Onay kuyruğu", key: "queue", count: pending.length },
        ]}
      />

      {actionErr && <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-2.5 text-[13px] text-danger">{actionErr}</div>}

      {tab === 0 && (
        <div className={`${CARD} overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Önceki ay" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className={`${BTN2} w-8 justify-center px-0`}>
                ‹
              </button>
              <h3 className="min-w-[130px] text-center text-sm font-semibold">
                {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
              </h3>
              <button type="button" aria-label="Sonraki ay" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className={`${BTN2} w-8 justify-center px-0`}>
                ›
              </button>
              <button type="button" onClick={() => { const n = new Date(); setCursor(new Date(n.getFullYear(), n.getMonth(), 1)); }} className={BTN2}>
                Bugün
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-sub">
              {(["published", "scheduled", "remote", "planned", "created", "run"] as const).map((k) => (
                <span key={k} className="inline-flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${KIND[k].dot}`} />
                  {KIND[k].label}
                </span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-7 border-t border-border bg-muted/40 text-[11px] font-medium uppercase tracking-wide text-sub">
            {WEEKDAYS.map((w) => (
              <div key={w} className="px-2 py-2">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grid.map((c, i) => {
              const evs = byDay.get(c.day) ?? [];
              const isToday = c.day === today;
              return (
                <div
                  key={c.day}
                  onClick={() => setDayOpen(c.day)}
                  className={`group min-h-[112px] cursor-pointer border-t border-border p-1.5 ${i % 7 ? "border-l" : ""} ${c.inMonth ? "bg-panel hover:bg-muted/40" : "bg-muted/30 text-sub"}`}
                >
                  <div className="flex items-center justify-between px-1">
                    <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full text-xs tabular-nums ${isToday ? "bg-accent px-1.5 font-semibold text-white" : c.inMonth ? "text-ink" : "text-sub/70"}`}>{c.date}</span>
                    <span className="text-[11px] text-accent opacity-0 group-hover:opacity-100">+ planla</span>
                  </div>
                  <div className="mt-1 space-y-1">
                    {evs.slice(0, 3).map((e) => (
                      <button
                        key={e.key}
                        type="button"
                        title={`${KIND[e.kind].label}: ${e.title}`}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          if (e.draft) setOpen(e.draft);
                          else if (e.campaign) setRunOpen({ c: e.campaign, day: e.day });
                        }}
                        className={`block w-full truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium ${KIND[e.kind].cls} ${e.kind === "run" ? "border border-dashed border-[#D5D7DA] shadow-none" : ""}`}
                      >
                        {e.kind === "run" ? "⟳ " : ""}
                        {e.title}
                      </button>
                    ))}
                    {evs.length > 3 && <div className="px-1.5 text-[11px] text-sub">+{evs.length - 3} daha</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 1 && (
        <div className={`${CARD} overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={chip(qf === "pending")} onClick={() => setQf("pending")}>
                Bekleyen <span className="text-sub">{pending.length}</span>
              </button>
              <button type="button" className={chip(qf === "approved")} onClick={() => setQf("approved")}>
                Onaylanan <span className="text-sub">{approved.length}</span>
              </button>
              <button type="button" className={chip(qf === "all")} onClick={() => setQf("all")}>
                Tümü
              </button>
            </div>
            <div className="flex items-center gap-2">
              {sel.size > 0 && (
                <>
                  <span className="text-xs text-sub">{sel.size} seçili</span>
                  <button type="button" disabled={!!busy} onClick={() => approveMany([...sel])} className={BTN1}>
                    Onayla
                  </button>
                  <button type="button" disabled={!!busy} onClick={() => setConfirmReject(all.filter((d) => sel.has(d.id)))} className={BTNDANGER}>
                    Reddet
                  </button>
                </>
              )}
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Yazı ara…" className={`${INPUT} h-8 w-56`} />
            </div>
          </div>
          {drafts === null ? (
            <div className="h-40 animate-pulse border-t border-border bg-muted/40" />
          ) : queueRows.length === 0 ? (
            <div className="border-t border-border px-5 py-10 text-center">
              <div className="text-sm font-semibold">{qf === "pending" ? "Onay bekleyen taslak yok" : "Liste boş"}</div>
              <p className="mx-auto mt-1 max-w-md text-[13px] text-sub">
                Autoblog'un ürettiği her taslak önce buraya düşer. Sen onaylamadan hiçbir şey &quot;onaylı&quot; sayılmaz; editörden yazdıkların doğrudan Tüm Yazılar&apos;a gider.
              </p>
              <Link href="/campaigns" className={`${BTN2} mt-4`}>
                Autoblog&apos;a git
              </Link>
            </div>
          ) : (
            <table className="w-full border-t border-border text-sm">
              <thead className="bg-muted/40 text-left text-[11px] font-medium uppercase tracking-wide text-sub">
                <tr>
                  <th className="w-10 px-5 py-2">
                    <input
                      type="checkbox"
                      aria-label="Tümünü seç"
                      checked={queueRows.length > 0 && queueRows.every((d) => sel.has(d.id))}
                      onChange={(e) => setSel(e.target.checked ? new Set(queueRows.map((d) => d.id)) : new Set())}
                    />
                  </th>
                  <th className="py-2 pr-3">Yazı</th>
                  <th className="hidden py-2 pr-3 md:table-cell">Autoblog</th>
                  <th className="py-2 pr-3 text-right">Kelime</th>
                  <th className="hidden py-2 pr-3 lg:table-cell">Üretildi</th>
                  <th className="py-2 pr-3">Durum</th>
                  <th className="py-2 pr-5 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {queueRows.map((d) => {
                  const k = draftKind(d);
                  const st = isPending(d) ? { label: "Onay bekliyor", cls: "bg-warn/10 text-warn" } : isApproved(d) ? { label: d.plannedFor ? `Onaylı · ${fmtDay(d.plannedFor)}` : "Onaylı", cls: "bg-seo/10 text-seo" } : { label: KIND[k.kind].label, cls: KIND[k.kind].cls };
                  const holes = d.article.openPlaceholders?.length ?? 0;
                  return (
                    <tr key={d.id} onClick={() => setOpen(d)} className="cursor-pointer border-t border-border hover:bg-muted/40">
                      <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label="Seç"
                          checked={sel.has(d.id)}
                          onChange={(e) => {
                            const n = new Set(sel);
                            if (e.target.checked) n.add(d.id);
                            else n.delete(d.id);
                            setSel(n);
                          }}
                        />
                      </td>
                      <td className="max-w-[360px] py-3 pr-3">
                        <div className="truncate font-medium">{d.article.title || "(başlıksız)"}</div>
                        <div className="truncate text-xs text-sub">
                          {sourceLabel(d.sourceUrl)}
                          {holes ? <span className="ml-2 text-warn">· {holes} eksik bilgi</span> : null}
                        </div>
                      </td>
                      <td className="hidden max-w-[200px] truncate py-3 pr-3 text-[13px] text-sub md:table-cell">{campaignName(d.campaignId) ?? "—"}</td>
                      <td className="py-3 pr-3 text-right tabular-nums text-[13px]">{words(d.article.bodyMarkdown).toLocaleString("tr-TR")}</td>
                      <td className="hidden py-3 pr-3 text-[13px] text-sub lg:table-cell">{fmtDate(d.createdAt)}</td>
                      <td className="py-3 pr-3">
                        <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="py-3 pr-5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1.5">
                          {isPending(d) && (
                            <button type="button" disabled={!!busy} onClick={() => patch(d, { approved: true })} className={BTN1}>
                              Onayla
                            </button>
                          )}
                          <Link href={`/editor?draftId=${d.id}`} className={BTN2}>
                            Düzenle
                          </Link>
                          {!d.publishedPostUrl && (
                            <button type="button" disabled={!!busy} onClick={() => setConfirmReject([d])} className={BTNDANGER} aria-label="Reddet">
                              Reddet
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Yazı çekmecesi */}
      <Drawer
        isOpen={!!open}
        onClose={() => setOpen(null)}
        size="xl"
        eyebrow={open ? (isPending(open) ? "Onay bekliyor" : isApproved(open) ? "Onaylı taslak" : KIND[draftKind(open).kind].label) : ""}
        title={open?.article.title || "(başlıksız)"}
        subtitle={open ? `${sourceLabel(open.sourceUrl)}${campaignName(open.campaignId) ? ` · ${campaignName(open.campaignId)}` : ""}` : ""}
        footer={
          open && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {!open.publishedPostUrl ? (
                <button type="button" onClick={() => setConfirmReject([open])} className={BTNDANGER}>
                  Reddet ve sil
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                {isApproved(open) && (
                  <button type="button" disabled={!!busy} onClick={() => patch(open, { approved: false })} className={BTN2}>
                    Onayı geri al
                  </button>
                )}
                <Link href={`/editor?draftId=${open.id}`} className={BTN2}>
                  Editörde aç
                </Link>
                {isPending(open) && (
                  <button type="button" disabled={!!busy} onClick={() => patch(open, { approved: true })} className={BTN1}>
                    {busy === `p${open.id}` ? "Kaydediliyor…" : "Onayla"}
                  </button>
                )}
                {open.publishedPostUrl && (
                  <a href={open.publishedPostUrl} target="_blank" rel="noreferrer" className={BTN1}>
                    Sitede gör ↗
                  </a>
                )}
              </div>
            </div>
          )
        }
      >
        {open && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-2">
              {([
                ["Kelime", words(open.article.bodyMarkdown).toLocaleString("tr-TR")],
                ["Eksik bilgi", String(open.article.openPlaceholders?.length ?? 0)],
                ["Üretildi", fmtDate(open.createdAt)],
              ] as const).map(([l, v]) => (
                <div key={l} className="rounded-xl bg-muted/50 px-3 py-2.5">
                  <div className="text-[11px] text-sub">{l}</div>
                  <div className="text-sm font-semibold tabular-nums">{v}</div>
                </div>
              ))}
            </div>
            {!open.publishedPostUrl && (
              <div>
                <label className="text-xs font-medium text-sub" htmlFor="planned">
                  Takvimde planlanan gün
                </label>
                <div className="mt-1 flex gap-2">
                  <input id="planned" type="date" value={open.plannedFor ?? ""} onChange={(e) => patch(open, { plannedFor: e.target.value || null })} className={`${INPUT} max-w-[200px]`} />
                  {open.plannedFor && (
                    <button type="button" onClick={() => patch(open, { plannedFor: null })} className={BTN2}>
                      Kaldır
                    </button>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-sub">Bu yalnızca Epicsem takvimindeki plandır. Sitede zamanlamak için editörde Yayınla → tarih seç.</p>
              </div>
            )}
            {open.publishState === "scheduled" && open.scheduledAt && <div className="rounded-xl bg-accent/5 px-3 py-2 text-[13px]">Sitede {fmtDate(open.scheduledAt)} için zamanlandı.</div>}
            {open.publishError && <div className="rounded-xl bg-danger/5 px-3 py-2 text-[13px] text-danger">{open.publishError}</div>}
            {open.article.metaDescription && (
              <div>
                <div className="text-xs font-medium text-sub">Meta açıklama</div>
                <p className="mt-1 text-[13px]">{open.article.metaDescription}</p>
              </div>
            )}
            {(open.article.openPlaceholders?.length ?? 0) > 0 && (
              <div>
                <div className="text-xs font-medium text-sub">Onaylamadan önce doldurulacak bilgiler</div>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] text-warn">
                  {open.article.openPlaceholders!.slice(0, 8).map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <div className="text-xs font-medium text-sub">Önizleme</div>
              <div className="mt-1 max-h-[340px] overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-muted/30 p-3 text-[13px] leading-6 text-ink/80">
                {open.article.bodyMarkdown.slice(0, 2500)}
                {open.article.bodyMarkdown.length > 2500 ? "…" : ""}
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* Gün çekmecesi: o günün yazıları + yazı planla */}
      <Drawer isOpen={!!dayOpen} onClose={() => setDayOpen(null)} size="lg" eyebrow="İçerik takvimi" title={dayOpen ? fmtDay(dayOpen) : ""} subtitle={`${dayEvents.length} kayıt`}>
        {dayOpen && (
          <div className="space-y-5">
            {dayEvents.length > 0 && (
              <div className="space-y-1.5">
                {dayEvents.map((e) => (
                  <button
                    key={e.key}
                    type="button"
                    onClick={() => {
                      setDayOpen(null);
                      if (e.draft) setOpen(e.draft);
                      else if (e.campaign) setRunOpen({ c: e.campaign, day: e.day });
                    }}
                    className="flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2 text-left hover:bg-muted/40"
                  >
                    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${KIND[e.kind].cls}`}>{KIND[e.kind].label}</span>
                    <span className="truncate text-[13px]">{e.title}</span>
                  </button>
                ))}
              </div>
            )}
            <div>
              <h4 className="text-sm font-semibold">Bu güne yazı planla</h4>
              <p className="mt-0.5 text-[12px] text-sub">Onaylı ya da editörde yazılmış, henüz yayınlanmamış yazılar.</p>
              {assignable.length === 0 ? (
                <p className="mt-3 text-[13px] text-sub">Planlanacak yazı yok. Önce kuyruktan bir taslağı onayla ya da yeni yazı yaz.</p>
              ) : (
                <div className="mt-3 space-y-1.5">
                  {assignable.map((d) => (
                    <div key={d.id} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium">{d.article.title || "(başlıksız)"}</div>
                        <div className="truncate text-[11px] text-sub">{d.plannedFor ? `şu an: ${fmtDay(d.plannedFor)}` : "günü yok"}</div>
                      </div>
                      <button type="button" disabled={!!busy} onClick={() => patch(d, { plannedFor: dayOpen })} className={BTN2}>
                        Bu güne al
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* Autoblog çalışması */}
      <Drawer
        isOpen={!!runOpen}
        onClose={() => setRunOpen(null)}
        size="md"
        eyebrow="Autoblog · tahmini çalışma"
        title={runOpen ? runOpen.c.feed?.name ?? runOpen.c.brandName : ""}
        subtitle={runOpen ? fmtDay(runOpen.day) : ""}
        footer={
          <div className="flex justify-end">
            <Link href="/campaigns" className={BTN1}>
              Autoblog&apos;u aç
            </Link>
          </div>
        }
      >
        {runOpen && (
          <div className="space-y-2 text-[13px]">
            <p>
              {FREQ_LABEL[runOpen.c.frequency]} çalışır, her çalışmada <b>{runOpen.c.postsPerRun}</b> yazı üretir.
            </p>
            <p className="text-sub">
              {runOpen.c.mode === "review"
                ? "Üretilen yazılar bu Onay kuyruğuna düşer; sen onaylayana kadar yayınlanmaz."
                : runOpen.c.mode === "cms-draft"
                  ? "Yazılar sitene taslak olarak gönderilir; sitende yayınlarsın."
                  : "Tam otomasyon: yazılar sitende doğrudan yayınlanır."}
            </p>
            <p className="text-[11px] text-sub">Tarih tahminidir; rastgele saat ayarı ve sıradaki konu sayısı gerçek zamanı değiştirebilir. Her yazı 1 içerik üretimi kotası kullanır.</p>
          </div>
        )}
      </Drawer>

      {/* Reddet onayı */}
      <Drawer
        isOpen={!!confirmReject}
        onClose={() => setConfirmReject(null)}
        size="md"
        eyebrow="Reddet"
        title={confirmReject && confirmReject.length > 1 ? `${confirmReject.length} taslak silinsin mi?` : "Taslak silinsin mi?"}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmReject(null)} className={BTN2}>
              Vazgeç
            </button>
            <button type="button" disabled={busy === "reject"} onClick={() => confirmReject && reject(confirmReject)} className={`${BTN1} bg-danger`}>
              {busy === "reject" ? "Siliniyor…" : "Evet, sil"}
            </button>
          </div>
        }
      >
        {confirmReject && (
          <div className="space-y-3 text-[13px]">
            <p>Bu işlem geri alınamaz. Taslak Epicsem&apos;den kalıcı olarak silinir; kullandığı içerik üretimi kotası geri gelmez.</p>
            <ul className="list-disc space-y-0.5 pl-5 text-sub">
              {confirmReject.slice(0, 8).map((d) => (
                <li key={d.id} className="truncate">
                  {d.article.title || "(başlıksız)"}
                </li>
              ))}
              {confirmReject.length > 8 && <li>+{confirmReject.length - 8} daha</li>}
            </ul>
          </div>
        )}
      </Drawer>
    </div>
  );
}
