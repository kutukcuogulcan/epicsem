"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ToolPageHeader from "@/components/ToolPageHeader";
import { CampaignsOverview } from "@/components/tool/ToolOverviews";
import FAQSection from "@/components/FAQSection";
import ExampleScenario from "@/components/ExampleScenario";
import UsageMeter from "@/components/UsageMeter";

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
  options: { connectionId?: number | null; randomMinutes?: number; language?: string; cover?: "none" | "branded" | "ai"; toc?: boolean; takeaways?: boolean; minCitability?: number };
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
  { id: "gap", title: "Gap Analysis", body: "AI motorlarında kaybettiğin gerçek sorulardan içerik üret.", icon: "◎" },
];
const SOURCE_LABEL: Record<Source, string> = { gap: "Gap Analysis", rss: "RSS", keywords: "Anahtar kelime", feed: "Besleme" };
const MODES: { id: Mode; title: string; body: string; steps: [string, boolean][] }[] = [
  { id: "review", title: "Onaylı otomasyon", body: "Yazılar Content Studio'da onayını bekler. Sen yayınlarsın.", steps: [["Besleme", true], ["Üret", true], ["Yayınla", false]] },
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

const SCENARIO_STEPS = [
  { title: "Kaynak seçilir", body: "Anahtar kelime listesi, bir RSS beslemesi ya da domainin son Gap Analysis sonucu." },
  { title: "Takvim ayarlanır", body: "Günlük, haftalık ya da aylık; her çalışmada 1–3 yazı." },
  { title: "Arka planda çalışır", body: "Zamanı gelen autoblog sıradaki kullanılmamış konuyu alır ve marka bilgi bankanı kullanarak makale yazar." },
  { title: "Seçtiğin moda göre yayınlanır", body: "Onaylı: Content Studio'da bekler. Sitede taslak: WordPress, Shopify ya da webhook'a taslak gider. Tam otomasyon: doğrudan yayınlanır." },
];

const FAQ_ITEMS = [
  { q: "Autoblog API kredisi harcar mı?", a: "Yalnızca makale yazarken. Her makale 1 içerik üretim kredisi kullanır. Besleme okuma, konu seçimi, önizleme ve zamanlama AI kullanmaz." },
  { q: "Otomatik yayınlıyor mu?", a: "Sen seçersin. Onaylı modda yazılar Content Studio'da bekler; Sitede taslak modunda sitene taslak olarak gider; Tam otomasyon modunda doğrudan yayınlanır. Varsayılan Onaylı moddur." },
  { q: "Beslemeler nedir?", a: "Autoblog'un konu kaynaklarıdır: kendini haftalık yenileyen anahtar kelime listesi, Google Haberler, RSS ya da YouTube kanalı. Bir besleme birden fazla autoblog'da kullanılabilir ve AI kullanmaz." },
  { q: "Aynı konu iki kez yazılır mı?", a: "Hayır. Daha önce taslağı üretilmiş anahtar kelime, besleme öğesi ya da Gap konusu atlanır." },
  { q: "RSS'teki yazıyı kopyalıyor mu?", a: "Hayır. Kaynak yazı yalnızca bilgi kaynağı olarak okunur; makale kendi cümleleriyle, markanın bakış açısıyla yazılır ve kaynak adresi taslakta saklanır." },
  { q: "Ne sıklıkla kontrol ediliyor?", a: "Arka plandaki zamanlayıcı her 6 saatte bir zamanı gelen autoblog'ları çalıştırır. Beklemek istemezsen \"Şimdi çalıştır\"a bas." },
];

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
  if (t <= Date.now()) return "Sırada";
  return new Date(t).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

export default function CampaignsPage() {
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
    fetch("/api/assistant")
      .then((r) => (r.ok ? r.json() : { sites: [] }))
      .then((d) => setSites(d.sites ?? []))
      .catch(() => {});
  }, []);

  const set = <K extends keyof typeof emptyForm>(k: K, v: (typeof emptyForm)[K]) => setForm((f) => ({ ...f, [k]: v }));

  function openNew(source: Source = "keywords", feedId = 0) {
    setForm({ ...emptyForm, source, feedId, brandDomain: sites[0] ?? "", brandName: sites[0] ? sites[0].split(".")[0].replace(/^./, (c) => c.toUpperCase()) : "" });
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
      setNotice(form.id ? "Autoblog güncellendi." : "Autoblog kuruldu — ilk taslak 6 saat içinde gelir. Beklemek istemezsen \"Şimdi çalıştır\"a bas.");
      await refresh();
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
    setNotice(null);
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
    if (!window.confirm(`"${c.brandName}" autoblog'u silinsin mi? Üretilmiş taslaklar Content Studio'da kalır.`)) return;
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
    `rounded-lg px-3 py-2 text-xs font-semibold transition ${on ? "bg-accent text-white shadow-sm" : "bg-muted text-ink/60 hover:text-ink"}`;

  return (
    <div className="space-y-8">
      <ToolPageHeader
        breadcrumbLabel="Autoblog"
        title="Autoblog"
        body={
          <>
            Anahtar kelime listesi, bir RSS beslemesi ya da Gap Analysis sonuçlarından düzenli olarak SEO + GEO uyumlu makale
            taslağı üretir. İster Content Studio&apos;da onayını beklesin, ister sitene taslak olarak gitsin, ister doğrudan yayınlansın.
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => openNew()} className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white shadow-sm hover:opacity-90">
            + Yeni autoblog
          </button>
          <UsageMeter metric="contentGenerations" />
        </div>
      </ToolPageHeader>

      <CampaignsOverview refreshKey={rk} campaigns={campaigns ?? []} />

      {notice && <div className="rounded-xl border border-seo/30 bg-seo/5 px-4 py-3 text-sm text-seo">{notice}</div>}
      {error && <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}

      {campaigns && campaigns.length === 0 && (
        <section className="card space-y-4">
          <div>
            <h2 className="text-lg font-semibold">İlk autoblog&apos;unu kur</h2>
            <p className="text-sm text-ink/50">Konuların nereden gelsin?</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {SOURCES.map((s) => (
              <button key={s.id} type="button" onClick={() => openNew(s.id)} className="group rounded-2xl border border-border bg-paper p-5 text-left transition hover:border-accent hover:shadow-md">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-lg font-bold text-accent">{s.icon}</div>
                <div className="font-bold group-hover:text-accent">{s.title}</div>
                <p className="mt-1 text-sm text-ink/55">{s.body}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {campaigns && campaigns.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Autoblog&apos;ların</h2>
            <span className="text-xs text-ink/45">{campaigns.length} autoblog</span>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {campaigns.map((c) => (
              <article key={c.id} className="flex flex-col rounded-xl border border-border bg-panel shadow-sm p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-bold">{c.brandName}</span>
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${c.status === "active" ? "bg-seo/10 text-seo" : "bg-muted text-ink/50"}`}>
                        {c.status === "active" ? "Aktif" : "Duraklatıldı"}
                      </span>
                    </div>
                    <div className="truncate text-xs text-ink/45">{c.brandDomain}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="rounded-lg bg-accent/10 px-2.5 py-1 text-[11px] font-bold text-accent">{c.feed ? c.feed.name : SOURCE_LABEL[c.source]}</span>
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${c.mode === "publish" ? "bg-danger/10 text-danger" : c.mode === "cms-draft" ? "bg-sky-500/10 text-sky-600" : "bg-muted text-ink/55"}`}>
                      {MODE_LABEL[c.mode ?? "review"]}{c.connection ? ` → ${c.connection.label}` : ""}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-muted/60 px-2 py-2">
                    <div className="text-[10px] text-ink/45">Takvim</div>
                    <div className="text-sm font-bold">{FREQ_LABEL[c.frequency]}</div>
                    <div className="text-[10px] text-ink/45">{c.postsPerRun} yazı · {FORMAT_LABEL[c.format]}</div>
                  </div>
                  <div className="rounded-xl bg-muted/60 px-2 py-2">
                    <div className="text-[10px] text-ink/45">Üretilen</div>
                    <div className="text-sm font-bold tabular-nums">{c.drafts}</div>
                    <div className="text-[10px] text-ink/45">taslak</div>
                  </div>
                  <div className="rounded-xl bg-muted/60 px-2 py-2">
                    <div className="text-[10px] text-ink/45">Sonraki</div>
                    <div className="text-sm font-bold">{nextRun(c)}</div>
                    <div className="text-[10px] text-ink/45">{c.lastRunAt ? `son: ${ago(c.lastRunAt)}` : "henüz çalışmadı"}</div>
                  </div>
                </div>

                {(c.source === "keywords" || c.source === "feed") && c.queue && (
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-[11px] text-ink/50">
                      <span>{c.source === "feed" ? "Besleme konuları" : "Anahtar kelime kuyruğu"}</span>
                      <span className="tabular-nums">{c.queue.done}/{c.queue.total} yazıldı</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${c.queue.total ? (c.queue.done / c.queue.total) * 100 : 0}%` }} />
                    </div>
                  </div>
                )}
                {c.source === "rss" && c.config.rssUrl && <div className="mt-3 truncate text-[11px] text-ink/50">Besleme: {c.config.rssUrl}{c.config.rssFilter?.length ? ` · filtre: ${c.config.rssFilter.join(", ")}` : ""}</div>}

                {c.lastDraft && (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-[10px] text-ink/45">
                        Son taslak · {ago(c.lastDraft.createdAt)}
                        {c.lastDraft.citability !== null && (
                          <span title="AI alıntılanabilirlik puanı" className={`rounded px-1.5 py-px font-bold ${c.lastDraft.citability >= 65 ? "bg-seo/10 text-seo" : c.lastDraft.citability >= 45 ? "bg-warn/10 text-warn" : "bg-danger/10 text-danger"}`}>
                            AI alıntı {c.lastDraft.citability}
                          </span>
                        )}
                      </div>
                      <div className="truncate text-sm font-semibold">{c.lastDraft.title}</div>
                    </div>
                    <Link href={`/editor?draftId=${c.lastDraft.id}`} className="shrink-0 text-xs font-semibold text-accent hover:underline">Editörde aç →</Link>
                  </div>
                )}
                {c.lastRunNote && <p className="mt-3 line-clamp-2 text-xs text-ink/50">{c.lastRunNote}</p>}

                <div className="mt-auto flex flex-wrap items-center gap-2 pt-4 text-xs">
                  <button onClick={() => runNow(c.id)} disabled={!!busy} className="rounded-lg bg-accent px-3 py-1.5 font-bold text-white hover:opacity-90 disabled:opacity-50">
                    {busy === `run-${c.id}` ? "Yazılıyor…" : "Şimdi çalıştır"}
                  </button>
                  <button onClick={() => openEdit(c)} className="rounded-lg border border-border px-3 py-1.5 font-semibold hover:bg-muted">Düzenle</button>
                  <button onClick={() => toggleStatus(c)} disabled={busy === `toggle-${c.id}`} className="rounded-lg border border-border px-3 py-1.5 font-semibold hover:bg-muted disabled:opacity-50">
                    {c.status === "active" ? "Duraklat" : "Devam ettir"}
                  </button>
                  <Link href="/content" className="rounded-lg px-2 py-1.5 font-semibold text-ink/55 hover:text-ink">Taslaklar</Link>
                  <button onClick={() => removeCampaign(c)} disabled={busy === `remove-${c.id}`} className="ml-auto px-1 text-danger/70 hover:text-danger">Sil</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button type="button" aria-label="Kapat" onClick={() => setOpen(false)} className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" />
          <form onSubmit={save} className="relative flex h-full w-full max-w-xl flex-col border-l border-border bg-panel shadow-2xl animate-[pop-in_0.25s_ease-out]">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <div className="font-bold">{form.id ? "Autoblog'u düzenle" : "Yeni autoblog"}</div>
                <div className="text-xs text-ink/50">Kaynak, takvim ve yazı ayarları.</div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full text-ink/50 hover:bg-muted">✕</button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wide text-ink/45">Site</label>
                <div className="grid grid-cols-2 gap-2">
                  <input value={form.brandName} onChange={(e) => set("brandName", e.target.value)} placeholder="Marka adı" required className={input} />
                  <input value={form.brandDomain} onChange={(e) => { set("brandDomain", e.target.value); setIdeas(null); }} placeholder="siteniz.com" required list="autoblog-sites" className={input} />
                  <datalist id="autoblog-sites">{sites.map((s) => <option key={s} value={s} />)}</datalist>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wide text-ink/45">Otomasyon modu</label>
                <div className="space-y-2">
                  {MODES.map((m) => (
                    <button key={m.id} type="button" onClick={() => set("mode", m.id)} className={`w-full rounded-xl border p-3 text-left transition ${form.mode === m.id ? "border-accent bg-accent/5 ring-1 ring-accent" : "border-border hover:border-accent/50"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${form.mode === m.id ? "border-accent" : "border-ink/25"}`}>
                            {form.mode === m.id && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                          </span>
                          <div>
                            <div className="text-sm font-bold">{m.title}</div>
                            <div className="text-[11px] leading-4 text-ink/55">{m.body}</div>
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 flex gap-1.5 pl-6">
                        {m.steps.map(([label, on]) => (
                          <span key={label} className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${on ? "border-border bg-panel text-ink/70" : "border-dashed border-border text-ink/30"}`}>{label}</span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
                {form.mode !== "review" && (
                  <div className="space-y-1.5 pt-1">
                    {connections.length === 0 ? (
                      <p className="rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn">
                        Henüz site bağlantın yok — <Link href="/content" className="font-semibold underline">Content Studio</Link>&apos;dan WordPress, Shopify ya da webhook bağla.
                      </p>
                    ) : (
                      <select value={form.connectionId || ""} onChange={(e) => set("connectionId", Number(e.target.value))} className={input}>
                        <option value="">Entegrasyon seç…</option>
                        {connections.map((c) => (
                          <option key={c.id} value={c.id}>{c.label} · {c.platform === "wordpress" ? "WordPress" : c.platform === "shopify" ? "Shopify" : "Webhook"}</option>
                        ))}
                      </select>
                    )}
                    {form.mode === "publish" && <p className="text-[11px] text-danger/80">Yazılar kontrol edilmeden yayına çıkar. [NEEDS: …] alanları açık kalabilir.</p>}
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
                      <span>
                        <span className="block text-sm font-semibold">Kalite kapısı</span>
                        <span className="block text-[11px] text-ink/50">Alıntılanabilirlik puanı bunun altındaysa siteye gönderme, Content Studio&apos;da beklet (AI&apos;sız, ücretsiz)</span>
                      </span>
                      <select value={form.minCitability} onChange={(e) => set("minCitability", Number(e.target.value))} className="rounded-lg border border-border bg-muted px-2 py-1.5 text-sm">
                        {[0, 40, 50, 60, 70].map((v) => <option key={v} value={v}>{v === 0 ? "Kapalı" : `${v}/100`}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wide text-ink/45">Konular nereden gelsin?</label>
                <div className="grid grid-cols-2 gap-2">
                  {SOURCES.map((s) => (
                    <button key={s.id} type="button" onClick={() => set("source", s.id)} className={`rounded-xl border p-3 text-left transition ${form.source === s.id ? "border-accent bg-accent/5 ring-1 ring-accent" : "border-border hover:border-accent/50"}`}>
                      <div className="text-sm font-bold">{s.title}</div>
                      <div className="mt-0.5 text-[11px] leading-4 text-ink/50">{s.body}</div>
                    </button>
                  ))}
                </div>
              </div>

              {form.source === "feed" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wide text-ink/45">Besleme</label>
                    <Link href="/feeds" className="text-xs font-semibold text-accent hover:underline">+ Yeni besleme</Link>
                  </div>
                  {feedList.length === 0 ? (
                    <p className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-ink/60">
                      Henüz beslemen yok. <Link href="/feeds" className="font-semibold text-accent">Beslemeler</Link> sayfasından anahtar kelime, haber, RSS ya da YouTube beslemesi kur.
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
                    <label className="text-xs font-bold uppercase tracking-wide text-ink/45">Anahtar kelimeler · {keywordList.length}</label>
                    <button type="button" onClick={loadIdeas} className="text-xs font-semibold text-accent hover:underline">Verilerimden öner (ücretsiz)</button>
                  </div>
                  <textarea value={form.keywords} onChange={(e) => set("keywords", e.target.value)} rows={7} placeholder={"Her satıra bir anahtar kelime ya da soru\nör. abiye elbise nasıl seçilir\nkapalı abiye modelleri 2026"} className={`${input} font-mono text-[13px] leading-6`} />
                  <p className="text-[11px] text-ink/45">Sırayla yazılır, daha önce yazılanlar atlanır. Kuyruğa istediğin zaman ekleyebilirsin.</p>
                  {ideas && (
                    <div className="rounded-xl border border-border p-3">
                      {ideas.length === 0 ? (
                        <p className="text-xs text-ink/50">Bu domain için öneri çıkacak veri yok — önce <Link href="/gap" className="font-semibold text-accent">Gap Analysis</Link> ya da <Link href="/geo" className="font-semibold text-accent">GEO testi</Link> çalıştır.</p>
                      ) : (
                        <>
                          <div className="mb-2 text-[11px] text-ink/50">Gap Analysis ve GEO promptlarından — eklemek için tıkla:</div>
                          <div className="flex flex-wrap gap-1.5">
                            {ideas.map((q) => {
                              const added = keywordList.some((k) => k.toLowerCase() === q.toLowerCase());
                              return (
                                <button key={q} type="button" disabled={added} onClick={() => addIdea(q)} className={`rounded-full border px-2.5 py-1 text-[11px] ${added ? "border-seo/30 bg-seo/5 text-seo" : "border-border hover:border-accent hover:text-accent"}`}>
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
                  <label className="text-xs font-bold uppercase tracking-wide text-ink/45">Besleme</label>
                  <div className="flex gap-2">
                    <input value={form.rssUrl} onChange={(e) => { set("rssUrl", e.target.value); setFeed(null); }} placeholder="site.com/feed ya da sadece site.com" className={input} />
                    <button type="button" onClick={previewFeed} disabled={feedBusy || !form.rssUrl.trim()} className="shrink-0 rounded-xl border border-border px-3 text-xs font-semibold hover:bg-muted disabled:opacity-50">
                      {feedBusy ? "Okunuyor…" : "Önizle"}
                    </button>
                  </div>
                  <input value={form.rssFilter} onChange={(e) => set("rssFilter", e.target.value)} placeholder="Filtre (opsiyonel): virgülle kelimeler — ör. seo, google, yapay zeka" className={input} />
                  {feedError && <p className="text-xs text-danger">{feedError}</p>}
                  {feed && (
                    <div className="rounded-xl border border-border">
                      <div className="flex items-center justify-between border-b border-border px-3 py-2 text-[11px] text-ink/50">
                        <span className="truncate font-semibold text-ink/70">{feed.title ?? feed.feedUrl}</span>
                        <span>{feed.total} öğe · {feed.items.filter((i) => !i.used && i.matches).length} yeni</span>
                      </div>
                      <ul className="max-h-60 divide-y divide-border overflow-y-auto">
                        {feed.items.map((it) => (
                          <li key={it.link} className={`px-3 py-2 ${!it.matches || it.used ? "opacity-45" : ""}`}>
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-xs font-semibold leading-5">{it.title}</span>
                              <span className="shrink-0 text-[10px] text-ink/45">{it.used ? "yazıldı" : !it.matches ? "filtre dışı" : it.publishedAt ? new Date(it.publishedAt).toLocaleDateString("tr-TR") : ""}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="text-[11px] text-ink/45">Her çalışmada en yeni, henüz yazılmamış öğeler alınır. Kaynak yazı kopyalanmaz; bilgi kaynağı olarak okunur.</p>
                </div>
              )}

              {form.source === "gap" && (
                <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs leading-5 text-ink/60">
                  Bu domainin <strong>son Gap Analysis</strong> sonucundaki içerik brief&apos;leri sırayla yazılır: AI motorlarının sorduğu ama markanın kaybettiği sorular, eksik başlıklar ve içerik boşlukları.
                  Henüz çalıştırmadıysan önce <Link href="/gap" className="font-semibold text-accent">Gap Analysis</Link>&apos;e git.
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wide text-ink/45">Takvim</label>
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
                <label className="text-xs font-bold uppercase tracking-wide text-ink/45">Yazı tipi</label>
                <div className="flex gap-2">
                  {(["article", "listicle"] as Format[]).map((f) => (
                    <button key={f} type="button" onClick={() => set("format", f)} className={seg(form.format === f)}>{FORMAT_LABEL[f]}</button>
                  ))}
                </div>
                <p className="text-[11px] text-ink/45">
                  Makaleler doğrudan cevapla başlar, SSS bölümü içerir ve <Link href="/content" className="text-accent">marka bilgi bankanı</Link> kullanır.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wide text-ink/45">Dil</label>
                  <select value={form.language} onChange={(e) => set("language", e.target.value)} className={input}>
                    {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wide text-ink/45">Rastgele saat</label>
                  <select value={form.randomMinutes} onChange={(e) => set("randomMinutes", Number(e.target.value))} className={input}>
                    {RANDOM_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wide text-ink/45">Kapak görseli</label>
                <div className="flex flex-wrap gap-2">
                  {([["none", "Yok"], ["branded", "Markalı kapak (ücretsiz)"], ["ai", "AI görseli (+1 kredi)"]] as const).map(([v, l]) => (
                    <button key={v} type="button" onClick={() => set("cover", v)} className={seg(form.cover === v)}>{l}</button>
                  ))}
                </div>
                {form.cover === "ai" && <p className="text-[11px] text-ink/45">AI görseli için OpenAI anahtarı gerekir; yoksa markalı kapak kullanılır.</p>}
              </div>

              <div className="space-y-2">
                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-border px-3 py-2.5">
                  <span>
                    <span className="block text-sm font-semibold">İçindekiler</span>
                    <span className="block text-[11px] text-ink/50">Başlıklardan otomatik liste (ücretsiz)</span>
                  </span>
                  <input type="checkbox" checked={form.toc} onChange={(e) => set("toc", e.target.checked)} className="h-4 w-4 accent-[#5d16ff]" />
                </label>
                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-border px-3 py-2.5">
                  <span>
                    <span className="block text-sm font-semibold">Öne çıkanlar</span>
                    <span className="block text-[11px] text-ink/50">Girişten sonra 3–5 maddelik özet</span>
                  </span>
                  <input type="checkbox" checked={form.takeaways} onChange={(e) => set("takeaways", e.target.checked)} className="h-4 w-4 accent-[#5d16ff]" />
                </label>
              </div>

              <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 text-xs leading-5 text-ink/70">
                Ayda yaklaşık <strong>{perMonth} makale</strong> → {credits} içerik üretim kredisi (AI). Beslemeler, konu seçimi, kapak (markalı), içindekiler ve zamanlama ücretsizdir.
              </div>
              {formError && <p className="text-sm text-danger">{formError}</p>}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2 text-sm font-semibold text-ink/60 hover:bg-muted">Vazgeç</button>
              <button type="submit" disabled={busy === "save"} className="rounded-xl bg-accent px-5 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
                {busy === "save" ? "Kaydediliyor…" : form.id ? "Kaydet" : "Autoblog'u başlat"}
              </button>
            </div>
          </form>
        </div>
      )}

      <ExampleScenario heading="Autoblog nasıl çalışır" steps={SCENARIO_STEPS} />
      <FAQSection items={FAQ_ITEMS} />
    </div>
  );
}
