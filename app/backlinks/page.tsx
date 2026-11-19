"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import CitationTab from "@/components/tool/CitationTab";
import LinkPlanTab from "@/components/tool/LinkPlanTab";
import { UnderlineTabs, ErrorBlock, TableSkeleton, EmptyBlock, PageHeader, Drawer } from "@/components/ui";
import { useProject } from "@/components/ProjectProvider";

interface RefDomain {
  domain: string;
  dr: number | null;
  links: number;
  dofollow: number | null;
  traffic: number | null;
  firstSeen: string | null;
  lostAt: string | null;
  spam: boolean;
  anchors: string[];
  sampleUrl: string | null;
  targets: string[];
  source: Src;
  from?: { url: string; title: string; date?: string | null; score?: number }[];
}
type Src = "bing" | "ahrefs" | "wikipedia" | "hn" | "reddit" | "news" | "csv";
interface Mention {
  url: string;
  title: string;
  domain: string;
  date: string | null;
  lang: string | null;
  linked: boolean | null;
}
interface Data {
  site?: string;
  sources: { bing: boolean; ahrefs: boolean; free?: boolean; imported?: number };
  mentions?: Mention[];
  notes?: string[];
  domains?: RefDomain[];
  pages?: { url: string; count: number }[];
  errors?: string[];
  cachedAt?: string | null;
  drLicense?: boolean;
}
interface Gap {
  domain: string;
  dr: number | null;
  traffic: number | null;
  linksTo: string[];
}

const drTone = (d: number | null) => (d === null ? "bg-muted text-ink/45" : d >= 60 ? "bg-seo/10 text-seo" : d >= 30 ? "bg-accent/10 text-accent" : d >= 10 ? "bg-warn/10 text-warn" : "bg-muted text-ink/55");
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "2-digit" }) : "—");
const SRC: Record<Src, { l: string; c: string }> = {
  bing: { l: "Bing", c: "#008373" },
  ahrefs: { l: "Ahrefs", c: "#ff8800" },
  wikipedia: { l: "Wikipedia", c: "#64748b" },
  hn: { l: "Hacker News", c: "#f97316" },
  reddit: { l: "Reddit", c: "#ef4444" },
  news: { l: "Haber", c: "#4f00ff" },
  csv: { l: "CSV", c: "#16a34a" },
};
const path = (u: string) => u.replace(/^https?:\/\/(www\.)?[^/]+/, "") || "/";

export default function BacklinksPage() {
  const { project } = useProject();
  useEffect(() => {
    if (!project) return;
    setSite(project.domain);
    load(project.domain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.domain]);

  const [site, setSite] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"domains" | "mentions" | "pages" | "gap">("domains");
  const [mf, setMf] = useState<"all" | "unlinked" | "linked">("all");
  const [imp, setImp] = useState<{ busy: boolean; msg: string | null; err: boolean }>({ busy: false, msg: null, err: false });
  const modeParam = useSearchParams().get("mode");
  const [mode, setMode] = useState<"analysis" | "citations" | "plan">(modeParam === "citations" ? "citations" : modeParam === "plan" ? "plan" : "analysis");
  useEffect(() => {
    setMode(modeParam === "citations" ? "citations" : modeParam === "plan" ? "plan" : "analysis");
  }, [modeParam]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "live" | "lost" | "high">("all");
  const [open, setOpen] = useState<string | null>(null);
  const [srcOpen, setSrcOpen] = useState(false);
  const [mail, setMail] = useState<{ busy: boolean; err: string | null; to: string; subject: string; body: string; demo?: boolean } | null>(null);
  const [mailCopied, setMailCopied] = useState(false);
  async function draftMail(kind: "unlinked" | "lost" | "gap", target: { domain: string; url?: string; title?: string }, extra?: { offer?: { title: string; why?: string }; competitors?: string[] }) {
    setMail({ busy: true, err: null, to: target.domain, subject: "", body: "" });
    setMailCopied(false);
    try {
      const r = await fetch("/api/backlinks/outreach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ site: data?.site ?? site, kind, target, ...extra }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Taslak yazılamadı");
      setMail({ busy: false, err: null, to: target.domain, subject: d.result.subject, body: d.result.body, demo: !!d.demo });
      window.dispatchEvent(new Event("epicsem:usage-changed"));
    } catch (e) {
      setMail({ busy: false, err: e instanceof Error ? e.message : "Taslak yazılamadı", to: target.domain, subject: "", body: "" });
    }
  }
  const [comps, setComps] = useState<string[]>(["", "", ""]);
  const [gap, setGap] = useState<{ gaps: Gap[]; checked: string[]; cachedAt?: string } | null>(null);
  const [gapBusy, setGapBusy] = useState(false);
  const [gapErr, setGapErr] = useState<string | null>(null);

  async function load(s: string, refresh = false) {
    if (!s.trim()) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/backlinks?site=${encodeURIComponent(s)}${refresh ? "&refresh=1" : ""}`);
      if (r.status === 401) {
        window.location.href = "/login?next=/backlinks";
        return;
      }
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Backlink verisi alınamadı");
      setData(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Backlink verisi alınamadı");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch("/api/backlinks")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const domains = useMemo(() => data?.domains ?? [], [data]);
  const live = domains.filter((d) => !d.lostAt);
  const withDr = live.filter((d) => d.dr !== null);
  const kpi = {
    refs: live.length,
    links: live.reduce((a, d) => a + d.links, 0),
    avgDr: withDr.length ? Math.round(withDr.reduce((a, d) => a + (d.dr ?? 0), 0) / withDr.length) : null,
    high: live.filter((d) => (d.dr ?? 0) >= 50).length,
    lost: domains.filter((d) => d.lostAt).length,
  };
  const dist = useMemo(() => {
    const b = [
      { k: "0–9", n: 0, c: "#cbd5e1" },
      { k: "10–29", n: 0, c: "#f59e0b" },
      { k: "30–49", n: 0, c: "#8b5cf6" },
      { k: "50–69", n: 0, c: "#4f00ff" },
      { k: "70+", n: 0, c: "#16a34a" },
    ];
    for (const d of withDr) b[(d.dr ?? 0) >= 70 ? 4 : (d.dr ?? 0) >= 50 ? 3 : (d.dr ?? 0) >= 30 ? 2 : (d.dr ?? 0) >= 10 ? 1 : 0].n++;
    return b;
  }, [withDr]);
  const anchors = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of domains) for (const a of d.anchors) m.set(a, (m.get(a) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [domains]);

  const shown = domains
    .filter((d) => (status === "live" ? !d.lostAt : status === "lost" ? !!d.lostAt : status === "high" ? (d.dr ?? 0) >= 50 && !d.lostAt : true))
    .filter((d) => !q || d.domain.includes(q.toLowerCase()) || d.anchors.some((a) => a.toLocaleLowerCase("tr").includes(q.toLocaleLowerCase("tr"))));

  async function runGap() {
    setGapBusy(true);
    setGapErr(null);
    try {
      const r = await fetch("/api/backlinks/gap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ site, competitors: comps.filter((c) => c.trim()) }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Karşılaştırma başarısız");
      setGap(d);
    } catch (e) {
      setGapErr(e instanceof Error ? e.message : "Karşılaştırma başarısız");
    } finally {
      setGapBusy(false);
    }
  }

  const mentions = data?.mentions ?? [];
  const srcDist = useMemo(() => {
    const m = new Map<Src, number>();
    for (const d of domains) m.set(d.source, (m.get(d.source) ?? 0) + 1);
    return [...m.entries()].map(([k, n]) => ({ k: SRC[k].l, n, c: SRC[k].c }));
  }, [domains]);
  const shownMentions = mentions.filter((m) => (mf === "linked" ? m.linked === true : mf === "unlinked" ? m.linked === false : true));

  async function importCsv(file: File) {
    if (!site.trim()) return setImp({ busy: false, msg: "Önce siteni yaz.", err: true });
    if (file.size > 5_000_000) return setImp({ busy: false, msg: "Dosya çok büyük (en fazla 5 MB).", err: true });
    setImp({ busy: true, msg: null, err: false });
    try {
      const csv = await file.text();
      const r = await fetch("/api/backlinks/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ site, csv, fileName: file.name }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "CSV okunamadı");
      setImp({ busy: false, msg: `${d.tool}: ${d.domains} alan adı içe aktarıldı.`, err: false });
      await load(site, true);
    } catch (e) {
      setImp({ busy: false, msg: e instanceof Error ? e.message : "CSV okunamadı", err: true });
    }
  }

  const openDomain = domains.find((d) => d.domain === open) ?? null;
  const unlinked = mentions.filter((m) => m.linked === false);
  const lostList = domains.filter((d) => d.lostAt);
  const BTN1 = "inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-accent px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60";
  const BTN2 = "inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-panel px-3 text-sm font-medium text-ink shadow-[inset_0_0_0_1px_#D5D7DA,0_1px_2px_rgba(13,18,28,0.05)] hover:bg-muted";
  const chip = (on: boolean) =>
    `inline-flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-[13px] font-medium whitespace-nowrap ${on ? "bg-accent/5 text-ink shadow-[inset_0_0_0_1px_#BDB4FF]" : "bg-panel text-sub shadow-[inset_0_0_0_1px_#E4E5E8] hover:text-ink"}`;
  const card = "rounded-2xl border border-border bg-panel shadow-[0_1px_2px_rgba(13,18,28,0.05)]";
  const srcNames = [
    ...(["wikipedia", "hn", "reddit", "news"] as const).map((k) => SRC[k].l),
    ...(data?.sources.imported ? ["CSV"] : []),
    ...(data?.sources.bing ? ["Bing"] : []),
    ...(data?.sources.ahrefs ? ["Ahrefs"] : []),
  ];

  // Ne yapmalı? — eldeki veriden somut işler
  const actions: { kind: string; color: string; title: string; body: string; cta: React.ReactNode }[] = [];
  if (unlinked.length)
    actions.push({
      kind: "Kolay link",
      color: "text-seo",
      title: `${unlinked.length} haberde linksiz anılıyorsun`,
      body: "Bu haberler markanı anıyor ama sitene link vermiyor. Her haberin yanındaki \"Link iste\" ile yapay zekâ kısa bir rica e-postası yazar.",
      cta: (
        <button type="button" onClick={() => setTab("mentions")} className={BTN2}>
          Haberleri gör
        </button>
      ),
    });
  if (lostList.length)
    actions.push({
      kind: "Kayıp",
      color: "text-danger",
      title: `${lostList.length} site artık link vermiyor`,
      body: `En önemlisi ${lostList.sort((a, b) => (b.dr ?? 0) - (a.dr ?? 0))[0].domain}. Sayfa kaldırılmış ya da link silinmiş olabilir; site sahibine ulaş.`,
      cta: (
        <button type="button" onClick={() => setStatus("lost")} className={BTN2}>
          Kayıpları göster
        </button>
      ),
    });
  if (!data?.sources.imported)
    actions.push({
      kind: "Eksik veri",
      color: "text-accent",
      title: "Google'ın bildiği tüm linkleri ekle",
      body: "Search Console → Bağlantılar → Dışa aktar → \"En çok bağlantı veren siteler\" CSV'sini yükle. Ücretsiz ve en eksiksiz liste.",
      cta: (
        <button type="button" onClick={() => setSrcOpen(true)} className={BTN2}>
          CSV yükle
        </button>
      ),
    });
  if (!data?.sources.ahrefs && kpi.avgDr === null)
    actions.push({
      kind: "Eksik veri",
      color: "text-accent",
      title: "Hangi linkler güçlü, öğren",
      body: "Domain Rating olmadan güçlü ve zayıf linki ayıramazsın. Ahrefs'i bağla; DR ve rakip karşılaştırması açılır.",
      cta: (
        <Link href="/integrations" className={BTN2}>
          Ahrefs&apos;i bağla
        </Link>
      ),
    });
  if (actions.length < 3)
    actions.push({
      kind: "Fırsat",
      color: "text-warn",
      title: "Rakiplerine link veren siteleri bul",
      body: data?.sources.ahrefs ? "Rakiplerine link verip sana vermeyen siteler en kolay ikna edilecek olanlar." : "Bu karşılaştırma için Ahrefs bağlantısı gerekiyor.",
      cta: (
        <button type="button" onClick={() => setTab("gap")} className={BTN2}>
          Fırsatları bul
        </button>
      ),
    });

  const TABS = [
    ["plan", "Link planı", null],
    ["domains", "Link veren siteler", domains.length],
    ["mentions", "Bahsetmeler", mentions.length],
    ["pages", "En çok link alan sayfalar", data?.pages?.length ?? 0],
    ["gap", "Rakip fırsatları", null],
    ["citations", "Kayıt listesi", null],
  ] as const;
  const activeTab = mode === "citations" ? "citations" : mode === "plan" ? "plan" : tab;

  return (
    <div className="space-y-6">
      <PageHeader
        title={data?.site ? `${data.site} sitesine kaç site link veriyor?` : "Backlinkler"}
        description={
          data?.site
            ? `${kpi.refs} link veren site · ${kpi.links.toLocaleString("tr-TR")} link · kaynaklar: ${srcNames.join(", ")}${data.cachedAt ? ` · güncellendi ${new Date(data.cachedAt).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}`
            : "Sitene link veren siteler ve markanın geçtiği haberler. Bağlantı gerekmez; ücretsiz kaynaklar taranır."
        }
        actions={
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSrcOpen(true)} className={BTN2}>
              Kaynaklar &amp; CSV
            </button>
            <button type="button" onClick={() => load(site, true)} disabled={loading || !site.trim()} className={BTN1}>
              {loading ? "Yükleniyor…" : "↻ Yenile"}
            </button>
          </div>
        }
      />

      <ErrorBlock message={err} />
      {data?.errors?.map((e) => (
        <div key={e} className="rounded-xl border border-warn/30 bg-warn/5 px-4 py-2.5 text-sm text-ink/70">
          {e}
        </div>
      ))}

      {data?.site && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {[
            ["Link veren site", String(kpi.refs), "", ""],
            ["Toplam link", kpi.links.toLocaleString("tr-TR"), "", ""],
            ["Ortalama DR", kpi.avgDr !== null ? String(kpi.avgDr) : "—", "/100", kpi.avgDr === null ? "DR için Ahrefs gerekir" : ""],
            ["Güçlü kaynak", String(kpi.high), "", "DR 50 ve üstü"],
            ["Linksiz bahsetme", String(unlinked.length), "", "link isteme fırsatı"],
          ].map(([l, v, suf, hint]) => (
            <div key={l} className={`${card} px-4 py-4`}>
              <div className="text-xs font-medium text-sub">{l}</div>
              <div className="mt-1.5 flex items-baseline gap-1">
                <span className="text-[26px] font-semibold leading-8 tabular-nums">{loading ? "…" : v}</span>
                {suf && <span className="text-sm text-sub">{suf}</span>}
              </div>
              <div className="mt-1 h-4 text-[11px] text-sub">{hint}</div>
            </div>
          ))}
        </div>
      )}

      {data?.site && actions.length > 0 && (
        <div>
        <h3 className="mb-2 text-sm font-semibold">Ne yapmalı?</h3>
        <div className={`grid gap-3 ${["", "md:grid-cols-1", "md:grid-cols-2", "md:grid-cols-3"][Math.min(actions.length, 3)]}`}>
          {actions.slice(0, 3).map((a) => (
            <div key={a.title} className={`${card} flex flex-col p-4`}>
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
        value={TABS.findIndex(([k]) => k === activeTab)}
        onChange={(i) => {
          const k = TABS[i][0];
          if (k === "citations") setMode("citations");
          else if (k === "plan") setMode("plan");
          else {
            setMode("analysis");
            setTab(k);
          }
        }}
        tabs={TABS.map(([, l, n]) => ({ label: l, count: n ?? null }))}
      />

      {activeTab === "citations" && <CitationTab site={site.trim()} />}
      {activeTab === "plan" && <LinkPlanTab site={(data?.site ?? site).trim()} ownLinkers={data?.site ? live.map((d) => d.domain) : null} onPitch={(d, o) => draftMail("gap", { domain: d, url: o?.url }, { offer: o?.offer, competitors: o?.competitors })} />}

      {mode === "analysis" && !data?.site && !loading && (
        <div className={`${card} px-6 py-10 text-center`}>
          <div className="text-base font-semibold">Henüz backlink verisi yok</div>
          <p className="mx-auto mt-1 max-w-md text-sm text-sub">Sol alttan bir proje seç ya da &quot;Kaynaklar &amp; CSV&quot; ile bir site gir.</p>
        </div>
      )}

      {mode === "analysis" && data?.site && tab === "domains" && (
        <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
          <div className={`${card} overflow-hidden`}>
            <div className="flex flex-wrap items-center gap-2 px-5 py-3">
              {([
                ["all", "Tümü"],
                ["live", "Canlı"],
                ["high", "DR 50+"],
                ["lost", "Kaybedilen"],
              ] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setStatus(k)} className={chip(status === k)}>
                  {l}
                </button>
              ))}
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Site ya da anchor ara…" className="ml-auto h-8 w-52 rounded-[9px] border border-border bg-panel px-3 text-[13px] outline-none focus:border-[#BDB4FF]" />
            </div>
            {shown.length === 0 ? (
              loading ? (
                <TableSkeleton bare rows={5} cols={5} />
              ) : (
                <div className="border-t border-border">
                  <EmptyBlock
                    compact
                    title={domains.length ? "Bu filtrede site yok" : "Henüz link veren site bulunamadı"}
                    description={domains.length ? "Filtreyi ya da aramayı değiştir." : "Ücretsiz kaynaklarda sitene link yok. Search Console CSV'sini yüklersen Google'ın bildiği tüm linkler gelir."}
                    action={
                      !domains.length && (
                        <button type="button" onClick={() => setSrcOpen(true)} className={BTN1}>
                          CSV yükle
                        </button>
                      )
                    }
                  />
                </div>
              )
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-y border-border bg-[#fafafa] text-left text-xs text-sub">
                    <th className="py-2 pl-5 font-medium">Site</th>
                    <th className="py-2 pr-3 font-medium">DR</th>
                    <th className="py-2 pr-3 text-right font-medium">Link</th>
                    <th className="hidden py-2 pr-3 font-medium lg:table-cell">İlk görülme</th>
                    <th className="py-2 pr-5 font-medium">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {shown.slice(0, 300).map((d) => (
                    <tr key={d.domain} onClick={() => setOpen(d.domain)} className="cursor-pointer hover:bg-[#fafafa]">
                      <td className="py-2.5 pl-5">
                        <div className="flex items-center gap-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`https://www.google.com/s2/favicons?domain=${d.domain}&sz=32`} alt="" className="h-4 w-4 rounded" />
                          <span className="font-medium">{d.domain}</span>
                          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-sub">{SRC[d.source]?.l ?? d.source}</span>
                          {d.spam && <span className="rounded-md bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger">spam</span>}
                        </div>
                        {d.anchors[0] && <div className="truncate pl-6 text-[11px] text-sub">“{d.anchors[0]}”</div>}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className={`rounded-md px-2 py-0.5 text-xs font-medium tabular-nums ${drTone(d.dr)}`}>{d.dr !== null ? Math.round(d.dr) : "—"}</span>
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{d.links}</td>
                      <td className="hidden py-2.5 pr-3 text-xs text-sub lg:table-cell">{fmtDate(d.firstSeen)}</td>
                      <td className="py-2.5 pr-5">
                        {d.lostAt ? (
                          <span className="whitespace-nowrap rounded-md bg-danger/10 px-2 py-0.5 text-[11px] font-medium text-danger">Kaybedildi</span>
                        ) : (
                          <span className="rounded-md bg-seo/10 px-2 py-0.5 text-[11px] font-medium text-seo">Canlı</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="space-y-3">
            {(withDr.length > 0 || srcDist.length > 1) && <div className={card}>
              <div className="px-5 pt-4">
                <h3 className="text-sm font-semibold">{withDr.length ? "Otorite dağılımı (DR)" : "Kaynağa göre"}</h3>
                <p className="text-xs text-sub">{withDr.length ? "Link veren sitelerin Domain Rating aralıkları" : "DR için Ahrefs bağlantısı gerekir"}</p>
              </div>
              <div className="h-40 px-2 pb-2 pt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={withDr.length ? dist : srcDist}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f2" vertical={false} />
                    <XAxis dataKey="k" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={24} />
                    <Tooltip cursor={{ fill: "rgba(79,0,255,0.04)" }} contentStyle={{ background: "#fff", border: "1px solid #e9eaeb", borderRadius: 12, fontSize: 12 }} />
                    <Bar dataKey="n" name="Site" radius={[6, 6, 0, 0]}>
                      {(withDr.length ? dist : srcDist).map((d) => (
                        <Cell key={d.k} fill={d.c} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>}
            <div className={card}>
              <div className="px-5 pt-4">
                <h3 className="text-sm font-semibold">En sık bağlantı metinleri</h3>
                <p className="text-xs text-sub">Sitene hangi kelimelerle link veriliyor</p>
              </div>
              <ul className="space-y-2 px-5 pb-4 pt-3">
                {anchors.length ? (
                  anchors.map(([a, n]) => (
                    <li key={a} className="flex items-center gap-3 text-[13px]">
                      <span className="min-w-0 flex-1 truncate">{a}</span>
                      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full bg-accent" style={{ width: `${(n / anchors[0][1]) * 100}%` }} />
                      </span>
                      <span className="w-6 text-right text-xs tabular-nums text-sub">{n}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-[13px] text-sub">Bağlantı metni verisi Bing ya da CSV ile gelir.</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {mode === "analysis" && data?.site && tab === "mentions" && (
        <div className={`${card} overflow-hidden`}>
          <div className="flex flex-wrap items-center gap-2 px-5 py-3">
            {([
              ["all", "Tümü"],
              ["unlinked", "Linksiz (fırsat)"],
              ["linked", "Linkli"],
            ] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setMf(k)} className={chip(mf === k)}>
                {l}
              </button>
            ))}
            <span className="ml-auto text-xs text-sub">Son 3 ay · link kontrolü ilk 20 haberde</span>
          </div>
          {shownMentions.length === 0 ? (
            loading ? (
              <TableSkeleton bare rows={4} cols={3} />
            ) : (
              <div className="border-t border-border">
                <EmptyBlock compact title="Bu filtrede haber yok" description="Son 3 ayda markanın geçtiği haber bulunamadı." />
              </div>
            )
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {shownMentions.slice(0, 100).map((m) => (
                <li key={m.url} className="flex items-center gap-3 px-5 py-2.5 text-[13px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`https://www.google.com/s2/favicons?domain=${m.domain}&sz=32`} alt="" className="h-4 w-4 shrink-0 rounded" />
                  <div className="min-w-0 flex-1">
                    <a href={m.url} target="_blank" rel="noreferrer" className="block truncate font-medium hover:text-accent">
                      {m.title}
                    </a>
                    <div className="text-[11px] text-sub">
                      {m.domain} · {fmtDate(m.date)}
                    </div>
                  </div>
                  {m.linked === true ? (
                    <span className="shrink-0 rounded-md bg-seo/10 px-2 py-0.5 text-[11px] font-medium text-seo">Linkli</span>
                  ) : m.linked === false ? (
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="rounded-md bg-warn/10 px-2 py-0.5 text-[11px] font-medium text-warn">Link yok</span>
                      <button type="button" onClick={() => draftMail("unlinked", { domain: m.domain, url: m.url, title: m.title })} className="text-[11px] font-medium text-accent hover:underline" title="1 AI sorgusu">
                        ✦ Link iste
                      </button>
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-sub">Kontrol edilmedi</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {mode === "analysis" && data?.site && tab === "pages" && (
        <div className={`${card} overflow-hidden`}>
          {data.pages?.length ? (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-[#fafafa] text-left text-xs text-sub">
                  <th className="px-5 py-2 font-medium">Sayfa</th>
                  <th className="py-2 pr-5 text-right font-medium">Gelen link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.pages.map((p) => (
                  <tr key={p.url}>
                    <td className="max-w-[40rem] truncate px-5 py-2.5">
                      <a href={p.url} target="_blank" rel="noreferrer" className="hover:text-accent">
                        {path(p.url)}
                      </a>
                    </td>
                    <td className="py-2.5 pr-5 text-right font-medium tabular-nums">{p.count.toLocaleString("tr-TR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyBlock compact title="Sayfa bazlı veri yok" description="Hangi sayfanın kaç link aldığı Bing Webmaster bağlantısıyla gelir." action={<Link href="/integrations" className={BTN2}>Bing'i bağla</Link>} />
          )}
        </div>
      )}

      {mode === "analysis" && data?.site && tab === "gap" && (
        <div className="space-y-3">
          <div className={`${card} p-5`}>
            <h3 className="text-sm font-semibold">Rakiplerine link verip sana vermeyen siteler</h3>
            <p className="mt-1 text-xs text-sub">En fazla 4 rakip gir. Birden çok rakibe link veren siteler en üstte; bunlar sana da link vermeye en yatkın olanlar. Ahrefs gerekir, sonuç 24 saat saklanır.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {comps.map((c, i) => (
                <input key={i} value={c} onChange={(e) => setComps((a) => a.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`rakip${i + 1}.com`} className="h-8 w-44 rounded-[9px] border border-border bg-panel px-3 text-[13px] outline-none focus:border-[#BDB4FF]" />
              ))}
              {comps.length < 4 && (
                <button type="button" onClick={() => setComps((a) => [...a, ""])} className="h-8 rounded-[9px] border border-dashed border-border px-3 text-[13px] text-sub hover:text-ink">
                  + rakip
                </button>
              )}
              <button type="button" onClick={runGap} disabled={gapBusy || !comps.some((c) => c.trim()) || !data.sources.ahrefs} className={BTN1}>
                {gapBusy ? "Karşılaştırılıyor…" : "Fırsatları bul"}
              </button>
            </div>
            {!data.sources.ahrefs && (
              <p className="mt-3 text-xs text-sub">
                Bu karşılaştırma için{" "}
                <Link href="/integrations" className="font-medium text-accent">
                  Ahrefs&apos;i bağla
                </Link>
                .
              </p>
            )}
            <ErrorBlock message={gapErr} />
          </div>
          {gap && (
            <div className={`${card} overflow-hidden`}>
              <div className="px-5 py-3 text-sm font-semibold">
                {gap.gaps.length} fırsat <span className="font-normal text-sub">· {gap.checked.join(", ")}</span>
              </div>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-y border-border bg-[#fafafa] text-left text-xs text-sub">
                    <th className="px-5 py-2 font-medium">Site</th>
                    <th className="py-2 pr-3 font-medium">DR</th>
                    <th className="py-2 pr-3 font-medium">Link verdiği rakipler</th>
                    <th className="py-2 pr-5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {gap.gaps.slice(0, 200).map((g) => (
                    <tr key={g.domain}>
                      <td className="px-5 py-2.5 font-medium">{g.domain}</td>
                      <td className="py-2.5 pr-3">
                        <span className={`rounded-md px-2 py-0.5 text-xs font-medium tabular-nums ${drTone(g.dr)}`}>{g.dr !== null ? Math.round(g.dr) : "—"}</span>
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="flex flex-wrap gap-1">
                          {g.linksTo.map((c) => (
                            <span key={c} className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-sub">
                              {c}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-5 text-right text-xs">
                        <button type="button" onClick={() => draftMail("gap", { domain: g.domain })} className="mr-3 font-medium text-accent hover:underline" title="1 AI sorgusu">
                          ✦ Tanışma e-postası
                        </button>
                        <a href={`https://${g.domain}`} target="_blank" rel="noreferrer" className="font-medium text-sub hover:text-accent">
                          Siteye git ↗
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {mode === "analysis" && data?.notes && data.notes.length > 0 && (
        <div className="space-y-1">
          {data.notes.map((n) => (
            <p key={n} className="text-[11px] text-sub">
              {n}
            </p>
          ))}
        </div>
      )}
      {data?.drLicense && (
        <p className="text-[11px] text-sub">
          Domain Rating:{" "}
          <a href="https://ahrefs.com/" target="_blank" rel="noreferrer" className="underline">
            Ahrefs
          </a>
        </p>
      )}

      {/* Site detayı */}
      <Drawer isOpen={!!openDomain} onClose={() => setOpen(null)} eyebrow="Link veren site" title={openDomain?.domain ?? ""} size="md">
        {openDomain && (
          <div className="space-y-5 text-[13px]">
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${drTone(openDomain.dr)}`}>DR {openDomain.dr !== null ? Math.round(openDomain.dr) : "—"}</span>
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-sub">{openDomain.links} link</span>
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-sub">Kaynak: {SRC[openDomain.source]?.l ?? openDomain.source}</span>
              {openDomain.dofollow === 0 && <span className="rounded-md bg-warn/10 px-2 py-0.5 text-xs font-medium text-warn">nofollow</span>}
              {openDomain.lostAt ? (
                <span className="rounded-md bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">Kaybedildi · {fmtDate(openDomain.lostAt)}</span>
              ) : (
                <span className="rounded-md bg-seo/10 px-2 py-0.5 text-xs font-medium text-seo">Canlı</span>
              )}
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium text-sub">{openDomain.from?.length ? "Link veren sayfalar" : "Bağlantı metinleri"}</div>
              {openDomain.from?.length ? (
                <ul className="space-y-1">
                  {openDomain.from.slice(0, 10).map((f) => (
                    <li key={f.url}>
                      <a href={f.url} target="_blank" rel="noreferrer" className="block truncate hover:text-accent">
                        {f.title}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : openDomain.anchors.length ? (
                openDomain.anchors.map((a) => <div key={a}>“{a}”</div>)
              ) : (
                <div className="text-sub">—</div>
              )}
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium text-sub">Link verilen sayfaların</div>
              {openDomain.targets.length ? openDomain.targets.map((t) => <div key={t} className="truncate">{/^\d+$/.test(t) ? `${t} sayfa` : path(t)}</div>) : <div className="text-sub">—</div>}
            </div>
            <div className="flex flex-wrap gap-2">
              {openDomain.sampleUrl && (
                <a href={openDomain.sampleUrl} target="_blank" rel="noreferrer" className={BTN2}>
                  Link veren sayfayı aç ↗
                </a>
              )}
              {openDomain.lostAt && (
                <button type="button" onClick={() => draftMail("lost", { domain: openDomain.domain, url: openDomain.sampleUrl ?? undefined })} className={BTN1}>
                  ✦ Linki geri iste (e-posta taslağı)
                </button>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* Link isteme e-postası */}
      <Drawer isOpen={!!mail} onClose={() => setMail(null)} eyebrow="E-posta taslağı · gönderilmez" title={mail?.to ?? ""} subtitle="Yapay zekâ yazdı (1 AI sorgusu). Kontrol et, adını ekle, kendi e-postandan gönder." size="lg">
        {mail && (
          <div className="space-y-4 text-[13px]">
            {mail.busy && (
              <div className="flex items-center gap-3 text-sub">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                Taslak yazılıyor…
              </div>
            )}
            <ErrorBlock message={mail.err} />
            {mail.demo && <p className="rounded-lg bg-warn/5 px-3 py-2 text-xs text-ink/70">Demo mod: yapay zekâ çalışmadı, örnek çıktı gösteriliyor.</p>}
            {mail.subject && (
              <>
                <div>
                  <div className="mb-1 text-xs font-medium text-sub">Konu</div>
                  <input value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} className="h-9 w-full rounded-[10px] border border-border bg-panel px-3 outline-none focus:border-[#BDB4FF]" />
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-sub">Metin</div>
                  <textarea value={mail.body} onChange={(e) => setMail({ ...mail, body: e.target.value })} rows={12} className="w-full rounded-[10px] border border-border bg-panel px-3 py-2 leading-6 outline-none focus:border-[#BDB4FF]" />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    navigator.clipboard.writeText(`${mail.subject}\n\n${mail.body}`).then(() => {
                      setMailCopied(true);
                      setTimeout(() => setMailCopied(false), 1800);
                    })
                  }
                  className={BTN1}
                >
                  {mailCopied ? "Kopyalandı ✓" : "Konu + metni kopyala"}
                </button>
              </>
            )}
          </div>
        )}
      </Drawer>

      {/* Kaynaklar & CSV */}
      <Drawer isOpen={srcOpen} onClose={() => setSrcOpen(false)} eyebrow="Backlinkler" title="Kaynaklar ve CSV" subtitle="Hangi kaynaklardan veri geldiğini gör, başka bir site analiz et ya da CSV yükle." size="md">
        <div className="space-y-6 text-[13px]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSrcOpen(false);
              load(site, true);
            }}
            className="space-y-2"
          >
            <div className="text-xs font-medium text-sub">Site</div>
            <div className="flex gap-2">
              <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="siten.com" className="h-9 min-w-0 flex-1 rounded-[10px] border border-border bg-panel px-3 outline-none focus:border-[#BDB4FF]" />
              <button disabled={loading || !site.trim()} className={BTN1}>
                Getir
              </button>
            </div>
          </form>
          <div>
            <div className="mb-2 text-xs font-medium text-sub">Veri kaynakları</div>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {(["wikipedia", "hn", "reddit", "news"] as const).map((k) => (
                <li key={k} className="flex items-center justify-between px-3 py-2">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: SRC[k].c }} />
                    {SRC[k].l}
                  </span>
                  <span className="rounded-md bg-seo/10 px-2 py-0.5 text-[11px] font-medium text-seo">Ücretsiz · açık</span>
                </li>
              ))}
              {(["bing", "ahrefs"] as const).map((k) => (
                <li key={k} className="flex items-center justify-between px-3 py-2">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: SRC[k].c }} />
                    {SRC[k].l}
                  </span>
                  {data?.sources[k] ? (
                    <span className="rounded-md bg-seo/10 px-2 py-0.5 text-[11px] font-medium text-seo">Bağlı</span>
                  ) : (
                    <Link href="/integrations" className="text-[12px] font-medium text-accent hover:underline">
                      Bağla →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-2 text-xs font-medium text-sub">CSV yükle {data?.sources.imported ? <span className="text-seo">· {data.sources.imported} site yüklü</span> : null}</div>
            <p className="mb-3 text-[12px] leading-5 text-sub">
              En eksiksiz ücretsiz liste Google&apos;da: Search Console → Bağlantılar → Dışa aktar → &quot;En çok bağlantı veren siteler&quot;. Bing Webmaster ve Ahrefs Webmaster Tools dışa aktarmaları da okunur.
            </p>
            <label className={`${BTN2} cursor-pointer ${imp.busy ? "opacity-50" : ""}`}>
              {imp.busy ? "Yükleniyor…" : "Dosya seç"}
              <input
                type="file"
                accept=".csv,.tsv,.txt,text/csv"
                className="hidden"
                disabled={imp.busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) importCsv(f);
                }}
              />
            </label>
            {imp.msg && <p className={`mt-2 rounded-lg px-3 py-2 text-xs ${imp.err ? "bg-danger/5 text-danger" : "bg-seo/10 text-seo"}`}>{imp.msg}</p>}
          </div>
        </div>
      </Drawer>
    </div>
  );
}
