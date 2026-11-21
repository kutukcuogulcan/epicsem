"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import UsageMeter from "@/components/UsageMeter";
import { Drawer, ErrorBlock, PageHeader, TableSkeleton, BTN1, BTN2, CARD } from "@/components/ui";
import { useProject } from "@/components/ProjectProvider";

type Source = "gap" | "rss" | "keywords" | "feed";
type Mode = "review" | "cms-draft" | "publish";
type Frequency = "daily" | "weekly" | "monthly";
type Format = "article" | "listicle";

interface Campaign {
  id: number;
  brandName: string;
  brandDomain: string;
  frequency: Frequency;
  status: "active" | "paused";
  source: Source;
  config: { rssUrl?: string; rssFilter?: string[]; keywords?: string[]; feedId?: number };
  postsPerRun: number;
  format: Format;
  mode: Mode;
  options: { connectionId?: number | null; randomMinutes?: number; language?: string; cover?: "none" | "branded" | "ai"; toc?: boolean; takeaways?: boolean; minCitability?: number; internalLinks?: boolean; media?: boolean; research?: boolean; quality?: boolean };
  nextRunAt: string | null;
  feed: { id: number; name: string; kind: string } | null;
  connection: { id: number; label: string; platform: string } | null;
  lastRunAt: string | null;
  lastRunNote: string | null;
  createdAt: string;
  drafts: number;
  lastDraft: { id: number; title: string; sourceUrl: string; createdAt: string; citability: number | null } | null;
  queue: { total: number; done: number } | null;
}

interface FeedPreview {
  feedUrl: string;
  title: string | null;
  total: number;
  items: { title: string; link: string; summary: string; publishedAt: string | null; used: boolean; matches: boolean }[];
}

const SOURCES: { id: Source; title: string; body: string; icon: string }[] = [
  { id: "feed", title: "Kayıtlı besleme", body: "Kendini yenileyen kelime, haber, RSS ya da YouTube beslemesi.", icon: "≋" },
  { id: "keywords", title: "Anahtar kelimeler", body: "Hedeflediğin kelimeleri yaz, sırayla makaleye dönüşsün.", icon: "#" },
  { id: "rss", title: "RSS beslemesi", body: "Sektör blogu ya da haber sitesi yeni yazı yayınladıkça kendi yorumunla yaz.", icon: "◉" },
  { id: "gap", title: "Rakip Boşluğu", body: "AI motorlarında kaybettiğin gerçek sorulardan içerik üret.", icon: "◎" },
];
const SOURCE_LABEL: Record<Source, string> = { gap: "Rakip Boşluğu", rss: "RSS", keywords: "Anahtar kelime", feed: "Besleme" };
const MODES: { id: Mode; title: string; body: string; steps: [string, boolean][] }[] = [
  { id: "review", title: "Onaylı otomasyon", body: "Yazılar Takvim ve Onay kuyruğunda onayını bekler. Sen yayınlarsın.", steps: [["Besleme", true], ["Üret", true], ["Yayınla", false]] },
  { id: "cms-draft", title: "Sitede taslak", body: "Yazılar sitene taslak olarak gider. Sitende tek tıkla yayınlarsın.", steps: [["Besleme", true], ["Üret", true], ["Sitede taslak", true]] },
  { id: "publish", title: "Tam otomasyon", body: "Yazılar sitende doğrudan yayınlanır. Kontrol etmeden yayına çıkar.", steps: [["Besleme", true], ["Üret", true], ["Yayınla", true]] },
];
const MODE_LABEL: Record<Mode, string> = { review: "Onaylı", "cms-draft": "Sitede taslak", publish: "Tam otomatik" };
const LANGS = [
  ["tr", "Türkçe"], ["en", "İngilizce"], ["de", "Almanca"], ["fr", "Fransızca"], ["es", "İspanyolca"], ["it", "İtalyanca"], ["nl", "Felemenkçe"], ["ar", "Arapça"], ["ru", "Rusça"],
];
const RANDOM_OPTS: [number, string][] = [[0, "Rastgele değil"], [60, "1 saate kadar"], [180, "3 saate kadar"], [360, "6 saate kadar"], [720, "12 saate kadar"]];
const FREQ_LABEL: Record<Frequency, string> = { daily: "Günlük", weekly: "Haftalık", monthly: "Aylık" };
const FREQ_DAYS: Record<Frequency, number> = { daily: 1, weekly: 7, monthly: 30 };
const FORMAT_LABEL: Record<Format, string> = { article: "Makale", listicle: "Liste yazısı" };

const emptyForm = {
  id: null as number | null,
  brandName: "",
  brandDomain: "",
  source: "keywords" as Source,
  frequency: "weekly" as Frequency,
  postsPerRun: 1,
  format: "article" as Format,
  rssUrl: "",
  rssFilter: "",
  keywords: "",
  feedId: 0,
  mode: "review" as Mode,
  connectionId: 0,
  randomMinutes: 0,
  language: "tr",
  cover: "branded" as "none" | "branded" | "ai",
  toc: true,
  takeaways: true,
  internalLinks: true,
  media: true,
  research: false,
  quality: true,
  minCitability: 50,
};

function ago(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 864e5;
  if (d < 1 / 24) return "az önce";
  if (d < 1) return `${Math.round(d * 24)} sa önce`;
  return `${Math.round(d)} gün önce`;
}

function nextRun(c: Campaign) {
  if (c.status !== "active") return "Duraklatıldı";
  if (!c.lastRunAt) return "İlk çalışma 6 saat içinde";
  const t = c.nextRunAt ? new Date(c.nextRunAt).getTime() : new Date(c.lastRunAt).getTime() + FREQ_DAYS[c.frequency] * 864e5;
  if (t <= Date.now()) return "6 saat içinde"; // cron ~6 saatte bir döner
  return new Date(t).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

function HowItWorks() {
  const steps = [
    ["Konuları verirsin", "Anahtar kelime listesi, besleme ya da Rakip Boşluğu."],
    ["Epicsem yazar", "Seçtiğin takvimde (ör. haftada 1) sıradaki konuyu SEO + GEO uyumlu yazıya çevirir."],
    ["Sen onaylarsın", "Yazı Takvim ve Onay'a düşer; onaylayınca yayınlanır ya da sitene gider."],
  ];
  return (
    <ol className="grid gap-3 rounded-2xl border border-border bg-panel p-4 md:grid-cols-3">
      {steps.map(([t, b], i) => (
        <li key={t} className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-semibold text-accent">{i + 1}</span>
          <span>
            <span className="block text-sm font-medium">{t}</span>
            <span className="block text-[13px] text-sub">{b}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Tablodaki "Ne oluyor?" cümlesi: kuyruk + takvim tek cümlede. */
function whatsHappening(c: Campaign, running: boolean): { text: string; tone: "ok" | "warn" | "muted" } {
  if (running) return { text: "Şu an yazı yazılıyor (1-2 dk)…", tone: "ok" };
  if (c.status !== "active") return { text: "Duraklatıldı, yazı üretmiyor.", tone: "muted" };
  const q = c.queue;
  if (q && q.total > 0 && q.done >= q.total) return { text: `${q.total} konunun hepsi yazıldı. Yazacak konu kalmadı, kelime ekle.`, tone: "warn" };
  const done = q ? `${q.done}/${q.total} konu yazıldı · ` : c.drafts ? `${c.drafts} yazı yazıldı · ` : "";
  if (!c.lastRunAt) return { text: `${done}İlk yazı en geç 6 saat içinde gelir (beklemek istemezsen tıkla → Şimdi çalıştır).`, tone: "muted" };
  return { text: `${done}Sıradaki yazı: ${nextRun(c)}`, tone: "ok" };
}

export default function CampaignsPage() {
  const { project } = useProject();

  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [sites, setSites] = useState<string[]>([]);
  const [feedList, setFeedList] = useState<{ id: number; name: string; kind: string; items: number }[]>([]);
  const [connections, setConnections] = useState<{ id: number; label: string; platform: string; siteUrl: string }[]>([]);
  const [rk, setRk] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedPreview | null>(null);
  const [feedBusy, setFeedBusy] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<string[] | null>(null);

  function redirectToLogin() {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }

  async function refresh() {
    setRk((k) => k + 1);
    const res = await fetch("/api/campaigns");
    if (res.status === 401) return redirectToLogin();
    const data = await res.json();
    setCampaigns(data.campaigns ?? []);
    setFeedList(data.feeds ?? []);
    setConnections(data.connections ?? []);
    return data;
  }

  useEffect(() => {
    refresh().then((data) => {
      const fid = Number(new URLSearchParams(window.location.search).get("feed"));
      if (fid && data?.feeds?.some((f: { id: number }) => f.id === fid)) openNew("feed", fid);
    });
  }, []);

  const set = <K extends keyof typeof emptyForm>(k: K, v: (typeof emptyForm)[K]) => setForm((f) => ({ ...f, [k]: v }));

  function openNew(source: Source = "keywords", feedId = 0) {
    const d = project?.domain ?? sites[0] ?? "";
    setForm({ ...emptyForm, source, feedId, brandDomain: d, brandName: project?.name ?? (d ? d.split(".")[0].replace(/^./, (c) => c.toUpperCase()) : "") });
    setFeed(null);
    setFeedError(null);
    setIdeas(null);
    setFormError(null);
    setOpen(true);
  }

  function openEdit(c: Campaign) {
    setForm({
      id: c.id,
      brandName: c.brandName,
      brandDomain: c.brandDomain,
      source: c.source,
      frequency: c.frequency,
      postsPerRun: c.postsPerRun,
      format: c.format,
      rssUrl: c.config.rssUrl ?? "",
      rssFilter: (c.config.rssFilter ?? []).join(", "),
      keywords: (c.config.keywords ?? []).join("\n"),
      feedId: c.config.feedId ?? 0,
      mode: c.mode ?? "review",
      connectionId: c.options.connectionId ?? 0,
      randomMinutes: c.options.randomMinutes ?? 0,
      language: c.options.language ?? "tr",
      cover: c.options.cover ?? "none",
      toc: !!c.options.toc,
      takeaways: !!c.options.takeaways,
      internalLinks: c.options.internalLinks !== false,
      media: c.options.media !== false,
      research: !!c.options.research,
      quality: c.options.quality !== false,
      minCitability: c.options.minCitability ?? 0,
    });
    setFeed(null);
    setFeedError(null);
    setIdeas(null);
    setFormError(null);
    setOpen(true);
  }

  const keywordList = useMemo(
    () => Array.from(new Set(form.keywords.split(/\n|;/).map((k) => k.trim()).filter(Boolean))),
    [form.keywords]
  );
  const filterList = form.rssFilter.split(",").map((w) => w.trim()).filter(Boolean);
  const perMonth = Math.round((30 / FREQ_DAYS[form.frequency]) * form.postsPerRun);
  const credits = perMonth * (form.cover === "ai" ? 2 : 1);

  async function previewFeed() {
    if (!form.rssUrl.trim()) return;
    setFeedBusy(true);
    setFeedError(null);
    setFeed(null);
    try {
      const r = await fetch("/api/campaigns/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rssUrl: form.rssUrl, rssFilter: filterList }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Besleme okunamadı");
      setFeed(d);
      set("rssUrl", d.feedUrl);
    } catch (e) {
      setFeedError(e instanceof Error ? e.message : "Besleme okunamadı");
    } finally {
      setFeedBusy(false);
    }
  }

  async function loadIdeas() {
    if (!form.brandDomain.trim()) return setIdeas([]);
    const r = await fetch(`/api/campaigns/preview?domain=${encodeURIComponent(form.brandDomain)}`);
    const d = await r.json().catch(() => ({ ideas: [] }));
    setIdeas(d.ideas ?? []);
  }

  function addIdea(q: string) {
    if (keywordList.some((k) => k.toLowerCase() === q.toLowerCase())) return;
    set("keywords", (form.keywords.trim() ? form.keywords.trim() + "\n" : "") + q);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setBusy("save");
    try {
      const payload = {
        id: form.id ?? undefined,
        brandName: form.brandName,
        brandDomain: form.brandDomain,
        frequency: form.frequency,
        source: form.source,
        postsPerRun: form.postsPerRun,
        format: form.format,
        mode: form.mode,
        options: {
          connectionId: form.mode === "review" ? null : form.connectionId || null,
          randomMinutes: form.randomMinutes,
          language: form.language,
          cover: form.cover,
          toc: form.toc,
          takeaways: form.takeaways,
          internalLinks: form.internalLinks,
          media: form.media,
          research: form.research,
          quality: form.quality,
          minCitability: form.mode === "review" ? 0 : form.minCitability,
        },
        config:
          form.source === "rss"
            ? { rssUrl: form.rssUrl.trim(), rssFilter: filterList }
            : form.source === "keywords"
              ? { keywords: keywordList }
              : form.source === "feed"
                ? { feedId: form.feedId || undefined }
                : {},
      };
      const res = await fetch("/api/campaigns", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 401) return redirectToLogin();
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Kaydedilemedi");
      setOpen(false);
      await refresh();
      if (form.id) setNotice("Autoblog güncellendi.");
      else if (data.campaign?.id) await runNow(data.campaign.id); // ilk yazıyı beklemeden yaz
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Bir şeyler ters gitti");
    } finally {
      setBusy(null);
    }
  }

  async function toggleStatus(c: Campaign) {
    setBusy(`toggle-${c.id}`);
    try {
      const res = await fetch("/api/campaigns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, status: c.status === "active" ? "paused" : "active" }),
      });
      if (res.status === 401) return redirectToLogin();
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function runNow(id: number) {
    setBusy(`run-${id}`);
    setError(null);
    setNotice("Yazı yazılıyor — 1-2 dakika sürer. Bitince Takvim ve Onay'a düşer.");
    try {
      const res = await fetch("/api/campaigns/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: id }),
      });
      if (res.status === 401) return redirectToLogin();
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Çalıştırılamadı");
      const r = data.results?.[0];
      if (r) (r.status === "generated" ? setNotice : setError)(r.message);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti");
    } finally {
      setBusy(null);
    }
  }

  async function removeCampaign(c: Campaign) {
    if (!window.confirm(`"${c.brandName}" autoblog'u silinsin mi? Üretilmiş taslaklar Tüm Yazılar'da kalır.`)) return;
    setBusy(`remove-${c.id}`);
    try {
      const res = await fetch("/api/campaigns", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id }),
      });
      if (res.status === 401) return redirectToLogin();
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  const input = "w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm outline-none focus:border-accent";
  const seg = (on: boolean) =>
    `rounded-lg px-3 py-2 text-xs font-medium transition ${on ? "bg-accent text-white shadow-sm" : "bg-muted text-ink/60 hover:text-ink"}`;

  const list = campaigns ?? [];
  const active = list.filter((c) => c.status === "active");
  const totalDrafts = list.reduce((a, c) => a + c.drafts, 0);
  const left = list.reduce((a, c) => a + (c.queue ? Math.max(0, c.queue.total - c.queue.done) : 0), 0);
  const soon = active
    .map((c) => ({ c, t: c.nextRunAt ? new Date(c.nextRunAt).getTime() : c.lastRunAt ? new Date(c.lastRunAt).getTime() + FREQ_DAYS[c.frequency] * 864e5 : Date.now() }))
    .sort((a, b) => a.t - b.t)[0];
  const weekly = active.reduce((a, c) => a + c.postsPerRun * (7 / FREQ_DAYS[c.frequency]), 0);
  const [sel, setSel] = useState<number | null>(null);
  const selC = list.find((c) => c.id === sel) ?? null;

  const actions: { kind: string; color: string; title: string; body: string; cta: React.ReactNode }[] = [];
  const paused = list.filter((c) => c.status !== "active");
  const empty = list.filter((c) => c.queue && c.queue.total > 0 && c.queue.done >= c.queue.total);
  const weak = list.filter((c) => c.lastDraft?.citability != null && c.lastDraft.citability < 50);
  const auto = list.filter((c) => c.mode === "publish");
  if (empty.length)
    actions.push({
      kind: "Kuyruk bitti",
      color: "text-danger-ink",
      title: `${empty[0].brandName} için yazılacak konu kalmadı`,
      body: "Kuyruktaki tüm kelimeler yazıldı; yeni kelime eklemezsen bir sonraki çalışmada yazı çıkmaz.",
      cta: <button type="button" onClick={() => openEdit(empty[0])} className={BTN2}>Kelime ekle</button>,
    });
  if (weak.length)
    actions.push({
      kind: "Kalite",
      color: "text-warn-ink",
      title: `Son taslağın AI alıntı puanı ${weak[0].lastDraft!.citability}`,
      body: `"${weak[0].lastDraft!.title}" yayından önce editörde güçlendirilmeli: kısa cevap, soru başlıklar, somut sayı.`,
      cta: <Link href={`/editor?draftId=${weak[0].lastDraft!.id}`} className={BTN2}>Editörde aç</Link>,
    });
  if (paused.length)
    actions.push({
      kind: "Duraklatıldı",
      color: "text-sub",
      title: `${paused.length} autoblog duraklatılmış`,
      body: `${paused[0].brandName} şu an yazı üretmiyor. Hazırsan devam ettir.`,
      cta: <button type="button" onClick={() => toggleStatus(paused[0])} className={BTN2}>Devam ettir</button>,
    });
  if (auto.length && actions.length < 3)
    actions.push({
      kind: "Dikkat",
      color: "text-danger-ink",
      title: `${auto.length} autoblog kontrol etmeden yayınlıyor`,
      body: "Tam otomasyonda yazılar sitene doğrudan çıkar. İlk haftalarda \"Sitede taslak\" modu daha güvenli.",
      cta: <button type="button" onClick={() => openEdit(auto[0])} className={BTN2}>Modu değiştir</button>,
    });
  if (actions.length < 3)
    actions.push({
      kind: "Büyüt",
      color: "text-accent",
      title: "Rakip Boşluğu'ndan otomatik yazı",
      body: "AI motorlarında kaybettiğin gerçek sorular, en hızlı görünürlük kazandıran konulardır.",
      cta: <button type="button" onClick={() => openNew("gap")} className={BTN2}>Autoblog kur</button>,
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title={list.length ? "Autoblog'ların bu hafta ne yazacak?" : "Autoblog"}
        description={
          list.length
            ? `${active.length} aktif autoblog · haftada ~${Math.round(weekly)} yazı · toplam ${totalDrafts} taslak`
            : "Anahtar kelime listesi, besleme ya da Rakip Boşluğu'ndan düzenli SEO + GEO uyumlu yazı üretir. Onayını bekler, sitene taslak gönderir ya da yayınlar."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/calendar?tab=queue" className={BTN2}>
              Takvim ve onay
            </Link>
            <button type="button" onClick={() => openNew()} className={BTN1}>
              + Yeni autoblog
            </button>
          </div>
        }
      />

      {notice && <div className="rounded-xl bg-seo/10 px-4 py-2.5 text-sm text-seo-ink">{notice}</div>}
      <ErrorBlock message={error} />

      {campaigns !== null && <HowItWorks />}
      {campaigns === null && <TableSkeleton rows={4} cols={4} />}
      {campaigns && list.length === 0 && (
        <div className={`${CARD} p-6`}>
          <div className="text-base font-semibold">İlk autoblog&apos;unu kur</div>
          <p className="mt-0.5 text-sm text-sub">Konular nereden gelsin?</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {SOURCES.map((s) => (
              <button key={s.id} type="button" onClick={() => openNew(s.id)} className="group rounded-xl border border-border p-4 text-left transition hover:border-[#BDB4FF] hover:bg-accent/[0.02]">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-base font-medium text-accent">{s.icon}</div>
                <div className="text-sm font-semibold group-hover:text-accent">{s.title}</div>
                <p className="mt-1 text-[13px] text-sub">{s.body}</p>
              </button>
            ))}
          </div>
          <div className="mt-4">
            <UsageMeter metric="contentGenerations" />
          </div>
        </div>
      )}

      {list.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {([
              ["Aktif autoblog", String(active.length), `/${list.length}`, paused.length ? `${paused.length} duraklatıldı` : "hepsi çalışıyor"],
              ["Haftalık hedef", `~${Math.round(weekly)}`, "yazı", "aktif takvimlere göre"],
              ["Üretilen taslak", String(totalDrafts), "", "tüm autobloglar"],
              ["Kuyrukta konu", String(left), "", "yazılmayı bekleyen"],
              ["Sıradaki çalışma", soon ? (soon.t <= Date.now() ? "6 saat içinde" : new Date(soon.t).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })) : "—", "", soon ? soon.c.brandName : "aktif autoblog yok"],
            ] as const).map(([l, v, suf, hint]) => (
              <div key={l} className={`${CARD} px-4 py-4`}>
                <div className="text-xs font-medium text-sub">{l}</div>
                <div className="mt-1.5 flex items-baseline gap-1">
                  <span className="text-[26px] font-semibold leading-8 tabular-nums">{v}</span>
                  {suf && <span className="text-sm text-sub">{suf}</span>}
                </div>
                <div className="mt-1 h-4 truncate text-[11px] text-sub">{hint}</div>
              </div>
            ))}
          </div>

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

          <div className={`${CARD} overflow-hidden`}>
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-sm font-semibold">Autoblog&apos;ların</span>
              <UsageMeter metric="contentGenerations" />
            </div>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-y border-border bg-[#fafafa] text-left text-xs text-sub">
                  <th className="py-2 pl-5 font-medium">Autoblog</th>
                  <th className="hidden py-2 pr-3 font-medium md:table-cell">Kaynak</th>
                  <th className="py-2 pr-3 font-medium">Takvim</th>
                  <th className="hidden py-2 pr-3 font-medium lg:table-cell">Yayın</th>
                  <th className="py-2 pr-3 font-medium">Ne oluyor?</th>
                  <th className="py-2 pr-3 text-right font-medium">Taslak</th>
                  <th className="py-2 pr-5 font-medium">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.map((c) => (
                  <tr key={c.id} onClick={() => setSel(c.id)} className="cursor-pointer hover:bg-[#fafafa]">
                    <td className="py-2.5 pl-5">
                      <div className="font-medium">{c.brandName}</div>
                      <div className="text-[11px] text-sub">{c.brandDomain}</div>
                    </td>
                    <td className="hidden py-2.5 pr-3 md:table-cell">
                      <span className="rounded-md bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">{c.feed ? c.feed.name : SOURCE_LABEL[c.source]}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-xs">
                      {FREQ_LABEL[c.frequency]} · {c.postsPerRun} {FORMAT_LABEL[c.format].toLocaleLowerCase("tr")}
                    </td>
                    <td className="hidden py-2.5 pr-3 lg:table-cell">
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${c.mode === "publish" ? "bg-danger/10 text-danger-ink" : c.mode === "cms-draft" ? "bg-sky-500/10 text-sky-600" : "bg-muted text-sub"}`}>{MODE_LABEL[c.mode ?? "review"]}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-xs">
                      {(() => {
                        const w = whatsHappening(c, busy === `run-${c.id}`);
                        return <span className={w.tone === "warn" ? "font-medium text-danger-ink" : w.tone === "muted" ? "text-sub" : "text-ink"}>{w.text}</span>;
                      })()}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{c.drafts}</td>
                    <td className="py-2.5 pr-5">
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${c.status === "active" ? "bg-seo/10 text-seo-ink" : "bg-muted text-sub"}`}>{c.status === "active" ? "Aktif" : "Duraklatıldı"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Autoblog detayı */}
      <Drawer isOpen={!!selC} onClose={() => setSel(null)} eyebrow={selC ? `${selC.feed ? selC.feed.name : SOURCE_LABEL[selC.source]} · ${MODE_LABEL[selC.mode ?? "review"]}` : ""} title={selC?.brandName ?? ""} subtitle={selC?.brandDomain} size="lg">
        {selC && (
          <div className="space-y-5 text-[13px]">
            <div className="grid grid-cols-3 gap-2">
              {([
                ["Takvim", FREQ_LABEL[selC.frequency], `${selC.postsPerRun} ${FORMAT_LABEL[selC.format].toLocaleLowerCase("tr")}`],
                ["Üretilen", String(selC.drafts), "taslak"],
                ["Sonraki", nextRun(selC), selC.lastRunAt ? `son: ${ago(selC.lastRunAt)}` : "henüz çalışmadı"],
              ] as const).map(([l, v, h]) => (
                <div key={l} className="rounded-xl border border-border px-3 py-2">
                  <div className="text-[11px] text-sub">{l}</div>
                  <div className="text-base font-semibold">{v}</div>
                  <div className="text-[11px] text-sub">{h}</div>
                </div>
              ))}
            </div>
            {selC.queue && (
              <div>
                <div className="mb-1 flex justify-between text-xs text-sub">
                  <span>{selC.source === "feed" ? "Besleme konuları" : "Anahtar kelime kuyruğu"}</span>
                  <span className="tabular-nums">
                    {selC.queue.done}/{selC.queue.total} yazıldı
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${selC.queue.total ? (selC.queue.done / selC.queue.total) * 100 : 0}%` }} />
                </div>
              </div>
            )}
            {selC.source === "rss" && selC.config.rssUrl && (
              <p className="break-all text-xs text-sub">
                Besleme: {selC.config.rssUrl}
                {selC.config.rssFilter?.length ? ` · filtre: ${selC.config.rssFilter.join(", ")}` : ""}
              </p>
            )}
            {selC.connection && <p className="text-xs text-sub">Hedef site: {selC.connection.label} ({selC.connection.platform})</p>}
            {selC.lastDraft && (
              <div className="rounded-xl border border-border p-3">
                <div className="flex items-center gap-2 text-[11px] text-sub">
                  Son taslak · {ago(selC.lastDraft.createdAt)}
                  {selC.lastDraft.citability !== null && (
                    <span className={`rounded px-1.5 py-px font-medium ${selC.lastDraft.citability >= 65 ? "bg-seo/10 text-seo-ink" : selC.lastDraft.citability >= 45 ? "bg-warn/10 text-warn-ink" : "bg-danger/10 text-danger-ink"}`}>AI alıntı {selC.lastDraft.citability}</span>
                  )}
                </div>
                <div className="mt-1 font-medium">{selC.lastDraft.title}</div>
                <Link href={`/editor?draftId=${selC.lastDraft.id}`} className="mt-2 inline-block text-xs font-medium text-accent hover:underline">
                  Editörde aç →
                </Link>
              </div>
            )}
            {selC.lastRunNote && <p className="rounded-lg bg-[#fafafa] px-3 py-2 text-xs text-sub">{selC.lastRunNote}</p>}
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <button type="button" onClick={() => runNow(selC.id)} disabled={!!busy} className={BTN1}>
                {busy === `run-${selC.id}` ? "Yazılıyor…" : "Şimdi çalıştır"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSel(null);
                  openEdit(selC);
                }}
                className={BTN2}
              >
                Düzenle
              </button>
              <button type="button" onClick={() => toggleStatus(selC)} disabled={busy === `toggle-${selC.id}`} className={BTN2}>
                {selC.status === "active" ? "Duraklat" : "Devam ettir"}
              </button>
              <button
                type="button"
                onClick={() => {
                  removeCampaign(selC);
                  setSel(null);
                }}
                disabled={busy === `remove-${selC.id}`}
                className="ml-auto text-xs font-medium text-danger-ink hover:text-danger-ink"
              >
                Sil
              </button>
            </div>
            <p className="text-[11px] text-sub">&quot;Şimdi çalıştır&quot; her yazı için 1 içerik kotası kullanır.</p>
          </div>
        )}
      </Drawer>

      {open && (
        <Drawer isOpen onClose={() => setOpen(false)} panelClassName="flex h-full w-screen max-w-xl flex-col border-l border-border bg-panel shadow-2xl animate-[pop-in_0.25s_ease-out]" raw as="form" onSubmit={save} header={<div className="min-w-0">
              <div>
                <div className="font-medium">{form.id ? "Autoblog'u düzenle" : "Yeni autoblog"}</div>
                <div className="text-xs text-ink/60">Konuları ver, takvimi seç, gerisini Epicsem yazar.</div>
              </div>
</div>}>

            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-ink/60">Site</label>
                <div className="grid grid-cols-2 gap-2">
                  <input value={form.brandName} onChange={(e) => set("brandName", e.target.value)} placeholder="Marka adı" required className={input} />
                  <input value={form.brandDomain} onChange={(e) => { set("brandDomain", e.target.value); setIdeas(null); }} placeholder="siteniz.com" required list="autoblog-sites" className={input} />
                  <datalist id="autoblog-sites">{sites.map((s) => <option key={s} value={s} />)}</datalist>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-ink/60">Konular nereden gelsin?</label>
                <div className="grid grid-cols-2 gap-2">
                  {SOURCES.map((s) => (
                    <button key={s.id} type="button" onClick={() => set("source", s.id)} className={`rounded-xl border p-3 text-left transition ${form.source === s.id ? "border-accent bg-accent/5 ring-1 ring-accent" : "border-border hover:border-accent/50"}`}>
                      <div className="text-sm font-medium">{s.title}</div>
                      <div className="mt-0.5 text-[11px] leading-4 text-ink/60">{s.body}</div>
                    </button>
                  ))}
                </div>
              </div>

              {form.source === "feed" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium uppercase tracking-wide text-ink/60">Besleme</label>
                    <Link href="/feeds" className="text-xs font-medium text-accent hover:underline">+ Yeni besleme</Link>
                  </div>
                  {feedList.length === 0 ? (
                    <p className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-ink/60">
                      Henüz beslemen yok. <Link href="/feeds" className="font-medium text-accent">Beslemeler</Link> sayfasından anahtar kelime, haber, RSS ya da YouTube beslemesi kur.
                    </p>
                  ) : (
                    <select value={form.feedId || ""} onChange={(e) => set("feedId", Number(e.target.value))} className={input}>
                      <option value="">Besleme seç…</option>
                      {feedList.map((f) => (
                        <option key={f.id} value={f.id}>{f.name} · {f.kind === "keyword" ? "Anahtar kelime" : f.kind === "news" ? "Haber" : f.kind === "youtube" ? "YouTube" : "RSS"} · {f.items} konu</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {form.source === "keywords" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium uppercase tracking-wide text-ink/60">Anahtar kelimeler · {keywordList.length}</label>
                    <button type="button" onClick={loadIdeas} className="text-xs font-medium text-accent hover:underline">Verilerimden öner (ücretsiz)</button>
                  </div>
                  <textarea value={form.keywords} onChange={(e) => set("keywords", e.target.value)} rows={7} placeholder="Her satıra bir anahtar kelime ya da soru" className={`${input} font-mono text-[13px] leading-6`} />
                  <p className="text-[11px] text-ink/60">Sırayla yazılır, daha önce yazılanlar atlanır. Kuyruğa istediğin zaman ekleyebilirsin.</p>
                  {ideas && (
                    <div className="rounded-xl border border-border p-3">
                      {ideas.length === 0 ? (
                        <p className="text-xs text-ink/60">Bu domain için öneri çıkacak veri yok — önce <Link href="/gap" className="font-medium text-accent">Rakip Boşluğu</Link> ya da <Link href="/geo" className="font-medium text-accent">GEO testi</Link> çalıştır.</p>
                      ) : (
                        <>
                          <div className="mb-2 text-[11px] text-ink/60">Rakip Boşluğu ve GEO promptlarından — eklemek için tıkla:</div>
                          <div className="flex flex-wrap gap-1.5">
                            {ideas.map((q) => {
                              const added = keywordList.some((k) => k.toLowerCase() === q.toLowerCase());
                              return (
                                <button key={q} type="button" disabled={added} onClick={() => addIdea(q)} className={`rounded-full border px-2.5 py-1 text-[11px] ${added ? "border-seo/30 bg-seo/5 text-seo-ink" : "border-border hover:border-accent hover:text-accent"}`}>
                                  {added ? "✓ " : "+ "}{q}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {form.source === "rss" && (
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-wide text-ink/60">Besleme</label>
                  <div className="flex gap-2">
                    <input value={form.rssUrl} onChange={(e) => { set("rssUrl", e.target.value); setFeed(null); }} placeholder="site.com/feed ya da sadece site.com" className={input} />
                    <button type="button" onClick={previewFeed} disabled={feedBusy || !form.rssUrl.trim()} className="shrink-0 rounded-xl border border-border px-3 text-xs font-medium hover:bg-muted disabled:opacity-50">
                      {feedBusy ? "Okunuyor…" : "Önizle"}
                    </button>
                  </div>
                  <input value={form.rssFilter} onChange={(e) => set("rssFilter", e.target.value)} placeholder="Filtre (opsiyonel): virgülle ayrılmış kelimeler" className={input} />
                  <ErrorBlock message={feedError} />
                  {feed && (
                    <div className="rounded-xl border border-border">
                      <div className="flex items-center justify-between border-b border-border px-3 py-2 text-[11px] text-ink/60">
                        <span className="truncate font-medium text-ink/70">{feed.title ?? feed.feedUrl}</span>
                        <span>{feed.total} öğe · {feed.items.filter((i) => !i.used && i.matches).length} yeni</span>
                      </div>
                      <ul className="max-h-60 divide-y divide-border overflow-y-auto">
                        {feed.items.map((it) => (
                          <li key={it.link} className={`px-3 py-2 ${!it.matches || it.used ? "opacity-45" : ""}`}>
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-xs font-medium leading-5">{it.title}</span>
                              <span className="shrink-0 text-[11px] text-ink/60">{it.used ? "yazıldı" : !it.matches ? "filtre dışı" : it.publishedAt ? new Date(it.publishedAt).toLocaleDateString("tr-TR") : ""}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="text-[11px] text-ink/60">Her çalışmada en yeni, henüz yazılmamış öğeler alınır. Kaynak yazı kopyalanmaz; bilgi kaynağı olarak okunur.</p>
                </div>
              )}

              {form.source === "gap" && (
                <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs leading-5 text-ink/60">
                  Bu domainin <strong>son Rakip Boşluğu</strong> sonucundaki içerik brief&apos;leri sırayla yazılır: AI motorlarının sorduğu ama markanın kaybettiği sorular, eksik başlıklar ve içerik boşlukları.
                  Henüz çalıştırmadıysan önce <Link href="/gap" className="font-medium text-accent">Rakip Boşluğu</Link>&apos;na git.
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-ink/60">Takvim</label>
                <div className="flex flex-wrap gap-2">
                  {(["daily", "weekly", "monthly"] as Frequency[]).map((f) => (
                    <button key={f} type="button" onClick={() => set("frequency", f)} className={seg(form.frequency === f)}>{FREQ_LABEL[f]}</button>
                  ))}
                  <span className="mx-1 w-px bg-border" />
                  {[1, 2, 3].map((n) => (
                    <button key={n} type="button" onClick={() => set("postsPerRun", n)} className={seg(form.postsPerRun === n)}>{n} yazı</button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-ink/60">Yazı hazır olunca ne olsun?</label>
                <div className="space-y-2">
                  {MODES.map((m) => (
                    <button key={m.id} type="button" onClick={() => set("mode", m.id)} className={`w-full rounded-xl border p-3 text-left transition ${form.mode === m.id ? "border-accent bg-accent/5 ring-1 ring-accent" : "border-border hover:border-accent/50"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${form.mode === m.id ? "border-accent" : "border-ink/25"}`}>
                            {form.mode === m.id && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                          </span>
                          <div>
                            <div className="text-sm font-medium">{m.title}</div>
                            <div className="text-[11px] leading-4 text-ink/60">{m.body}</div>
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 flex gap-1.5 pl-6">
                        {m.steps.map(([label, on]) => (
                          <span key={label} className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${on ? "border-border bg-panel text-ink/70" : "border-dashed border-border text-ink/45"}`}>{label}</span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
                {form.mode !== "review" && (
                  <div className="space-y-1.5 pt-1">
                    {connections.length === 0 ? (
                      <p className="rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn-ink">
                        Henüz site bağlantın yok — <Link href="/content" className="font-medium underline">Yayın Hedefleri</Link>&apos;nden WordPress, Shopify ya da webhook bağla.
                      </p>
                    ) : (
                      <select value={form.connectionId || ""} onChange={(e) => set("connectionId", Number(e.target.value))} className={input}>
                        <option value="">Entegrasyon seç…</option>
                        {connections.map((c) => (
                          <option key={c.id} value={c.id}>{c.label} · {c.platform === "wordpress" ? "WordPress" : c.platform === "shopify" ? "Shopify" : "Webhook"}</option>
                        ))}
                      </select>
                    )}
                    {form.mode === "publish" && <p className="text-[11px] text-danger-ink">Yazılar kontrol edilmeden yayına çıkar. [NEEDS: …] alanları açık kalabilir.</p>}
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
                      <span>
                        <span className="block text-sm font-medium">Kalite kapısı</span>
                        <span className="block text-[11px] text-ink/60">Alıntılanabilirlik puanı bunun altındaysa siteye gönderme, onay kuyruğunda beklet (AI&apos;sız, ücretsiz)</span>
                      </span>
                      <select value={form.minCitability} onChange={(e) => set("minCitability", Number(e.target.value))} className="rounded-lg border border-border bg-muted px-2 py-1.5 text-sm">
                        {[0, 40, 50, 60, 70].map((v) => <option key={v} value={v}>{v === 0 ? "Kapalı" : `${v}/100`}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <details className="group rounded-xl border border-border">
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">Gelişmiş ayarlar <span className="font-normal text-sub">· yazı tipi, dil, kapak, içindekiler… varsayılanlar çoğu site için uygun</span></summary>
                <div className="space-y-6 border-t border-border px-4 py-4">
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-ink/60">Yazı tipi</label>
                <div className="flex gap-2">
                  {(["article", "listicle"] as Format[]).map((f) => (
                    <button key={f} type="button" onClick={() => set("format", f)} className={seg(form.format === f)}>{FORMAT_LABEL[f]}</button>
                  ))}
                </div>
                <p className="text-[11px] text-ink/60">
                  Makaleler doğrudan cevapla başlar, SSS bölümü içerir ve <Link href="/content" className="text-accent">marka bilgi bankanı</Link> kullanır.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wide text-ink/60">Dil</label>
                  <select value={form.language} onChange={(e) => set("language", e.target.value)} className={input}>
                    {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wide text-ink/60">Rastgele saat</label>
                  <select value={form.randomMinutes} onChange={(e) => set("randomMinutes", Number(e.target.value))} className={input}>
                    {RANDOM_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-ink/60">Kapak görseli</label>
                <div className="flex flex-wrap gap-2">
                  {([["none", "Yok"], ["branded", "Markalı kapak (ücretsiz)"], ["ai", "AI görseli (+1 kredi)"]] as const).map(([v, l]) => (
                    <button key={v} type="button" onClick={() => set("cover", v)} className={seg(form.cover === v)}>{l}</button>
                  ))}
                </div>
                {form.cover === "ai" && <p className="text-[11px] text-ink/60">AI görseli için OpenAI anahtarı gerekir; yoksa markalı kapak kullanılır.</p>}
              </div>

              <div className="space-y-2">
                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-border px-3 py-2.5">
                  <span>
                    <span className="block text-sm font-medium">İçindekiler</span>
                    <span className="block text-[11px] text-ink/60">Başlıklardan otomatik liste (ücretsiz)</span>
                  </span>
                  <input type="checkbox" checked={form.toc} onChange={(e) => set("toc", e.target.checked)} className="h-4 w-4 accent-[#4f00ff]" />
                </label>
                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-border px-3 py-2.5">
                  <span>
                    <span className="block text-sm font-medium">Öne çıkanlar</span>
                    <span className="block text-[11px] text-ink/60">Girişten sonra 3–5 maddelik özet</span>
                  </span>
                  <input type="checkbox" checked={form.takeaways} onChange={(e) => set("takeaways", e.target.checked)} className="h-4 w-4 accent-[#4f00ff]" />
                </label>
                {([
                  ["internalLinks", "İç linkler", "Sitenin sayfalarına 2–5 bağlam uygun link (ücretsiz)"],
                  ["media", "Görsel ve video", "Lisanslı 2 görsel (ücretsiz) + kaynak açıksa YouTube videosu"],
                  ["research", "Kaynaklı bilgiler", "Web aramasıyla rakiplerin işlediği konular, gerçek sorular ve doğrulanmış istatistikler · yazı başına +1 AI sorgusu"],
                  ["quality", "Kalite kontrolü", "Dolgu cümleleri temizlenir; puan 75'in altındaysa ya da kelime tekrarı, kısa metin, fazla [NEEDS] varsa yazı bir kez iyileştirilir · yalnızca gerekirse +1 AI sorgusu"],
                ] as const).map(([k, l, d]) => (
                  <label key={k} className="flex cursor-pointer items-center justify-between rounded-xl border border-border px-3 py-2.5">
                    <span>
                      <span className="block text-sm font-medium">{l}</span>
                      <span className="block text-[11px] text-ink/60">{d}</span>
                    </span>
                    <input type="checkbox" checked={form[k]} onChange={(e) => set(k, e.target.checked)} className="h-4 w-4 accent-[#4f00ff]" />
                  </label>
                ))}
              </div>

                </div>
              </details>

              <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 text-xs leading-5 text-ink/70">
                <strong>Özet:</strong> {FREQ_LABEL[form.frequency].toLocaleLowerCase("tr")} {form.postsPerRun} yazı yazılır{form.id ? "" : ", ilki hemen"}. {form.mode === "review" ? "Yazılar Takvim ve Onay'da onayını bekler; sen onaylamadan hiçbir şey yayınlanmaz." : form.mode === "cms-draft" ? "Yazılar sitene taslak olarak gider; yayına sen alırsın." : "Yazılar sitende kontrol edilmeden yayınlanır."} Ayda ~{perMonth} yazı → {credits} içerik kredisi.
              </div>
              <ErrorBlock message={formError} />
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2 text-sm font-medium text-ink/60 hover:bg-muted">Vazgeç</button>
              <button type="submit" disabled={busy === "save"} className="rounded-xl bg-accent px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                {busy === "save" ? "Kaydediliyor…" : form.id ? "Kaydet" : "Autoblog'u başlat"}
              </button>
            </div>
          </Drawer>
      )}

    </div>
  );
}
