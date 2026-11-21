"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { KeywordIdea, KeywordIntent } from "@/lib/keyword-research";
import { Drawer, ErrorBlock, PageHeader, BTN1, BTN2, CARD } from "@/components/ui";
import type { MapRow } from "@/app/api/keywords/map/route";
import { useProject } from "@/components/ProjectProvider";
import type { AiCluster, AiPrompt } from "@/app/api/keywords/ai/route";
import KeywordAgentPanel from "@/components/tool/KeywordAgentPanel";

const INTENT_LABEL: Record<KeywordIntent, string> = {
  question: "Soru",
  commercial: "Ticari",
  comparison: "Karşılaştırma",
  local: "Yerel",
  informational: "Uzun kuyruk",
};
const INTENT_TONE: Record<KeywordIntent, string> = {
  question: "bg-accent/10 text-accent",
  commercial: "bg-seo/10 text-seo-ink",
  comparison: "bg-warn/10 text-warn-ink",
  local: "bg-sky-500/10 text-sky-600",
  informational: "bg-muted text-ink/60",
};
const MARKETS = [
  { v: "TR|tr", l: "Türkiye · Türkçe" },
  { v: "US|en", l: "ABD · İngilizce" },
  { v: "GB|en", l: "Birleşik Krallık · İngilizce" },
  { v: "DE|de", l: "Almanya · Almanca" },
];

interface Research {
  seed: string;
  ideas: KeywordIdea[];
  queries: number;
  clusters: { name: string; count: number }[];
  serpAvailable: boolean;
  adsAvailable?: boolean;
  adsError?: string | null;
}

const COMP_LABEL: Record<string, string> = { LOW: "Düşük", MEDIUM: "Orta", HIGH: "Yüksek" };

interface SerpAnalysis {
  keyword: string;
  pages: { position: number; url: string; domain: string; title: string; words: number | null; h2: string[]; hasFaq: boolean; hasTable: boolean; citability: number | null }[];
  avgWords: number | null;
  commonTopics: { topic: string; count: number }[];
  peopleAlsoAsk: string[];
  relatedSearches: string[];
  aiOverview: boolean;
  faqShare: number;
  tableShare: number;
}

export default function KeywordsPage() {
  const { project } = useProject();
  useEffect(() => {
    if (project) setDomain(project.domain);
  }, [project?.domain]);

  const [seed, setSeed] = useState("");
  const [market, setMarket] = useState("TR|tr");
  const [data, setData] = useState<Research | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intent, setIntent] = useState<KeywordIntent | "all">("all");
  const [cluster, setCluster] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [domain, setDomain] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string; href?: string; hrefLabel?: string } | null>(null);
  const [serp, setSerp] = useState<{ keyword: string; data: SerpAnalysis | null; error: string | null; loading: boolean } | null>(null);
  const [serpAvailable, setSerpAvailable] = useState(false);
  const [ai, setAi] = useState<{ busy: boolean; err: string | null; clusters: AiCluster[]; prompts: AiPrompt[]; demo?: boolean } | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [pSel, setPSel] = useState<Set<string>>(new Set());
  const [pMsg, setPMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [cmap, setCmap] = useState<{ busy: boolean; err: string | null; rows: MapRow[]; scanned: number } | null>(null);
  const [mf, setMf] = useState<"all" | MapRow["status"]>("all");

  async function runAi() {
    if (!data) return;
    setAiOpen(true);
    if (ai && !ai.err && ai.clusters.length) return;
    setAi({ busy: true, err: null, clusters: [], prompts: [] });
    setPMsg(null);
    try {
      const r = await fetch("/api/keywords/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed: data.seed, lang: market.split("|")[1], keywords: data.ideas.map((i) => i.keyword).slice(0, 200) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "AI analizi başarısız");
      setAi({ busy: false, err: null, clusters: d.clusters ?? [], prompts: d.prompts ?? [], demo: !!d.demo });
      setPSel(new Set((d.prompts ?? []).map((p: AiPrompt) => p.prompt)));
      window.dispatchEvent(new Event("epicsem:usage-changed"));
    } catch (e) {
      setAi({ busy: false, err: e instanceof Error ? e.message : "AI analizi başarısız", clusters: [], prompts: [] });
    }
  }

  async function addPrompts() {
    if (!project) return setPMsg({ ok: false, text: "GEO takibine eklemek için soldan bir proje seç." });
    const list = (ai?.prompts ?? []).filter((p) => pSel.has(p.prompt)).slice(0, 20);
    if (!list.length) return;
    setPMsg(null);
    const r = await fetch("/api/saved-prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand: { name: project.name, domain: project.domain }, competitors: project.competitors ?? [], prompts: list.map((p) => ({ text: p.prompt, topic: (data?.seed ?? "Genel").slice(0, 60) })) }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setPMsg({ ok: false, text: d.error ?? "Eklenemedi" });
    setPMsg({ ok: true, text: `${list.length} soru ${project.domain} için GEO takibine eklendi.` });
  }

  useEffect(() => {
    fetch("/api/keywords/research")
      .then((r) => (r.ok ? r.json() : { serpAvailable: false }))
      .then((d: { serpAvailable?: boolean }) => setSerpAvailable(!!d.serpAvailable))
      .catch(() => {});
    const s = new URLSearchParams(window.location.search).get("q");
    if (s) {
      setSeed(s);
      run(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(value = seed) {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    setSel(new Set());
    setCluster(null);
    setIntent("all");
    setAi(null);
    const [country, lang] = market.split("|");
    try {
      const r = await fetch("/api/keywords/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed: value, country, lang }),
      });
      if (r.status === 401) return (window.location.href = "/login?next=/keywords");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Arama başarısız");
      setData(d);
      setSerpAvailable(!!d.serpAvailable);
      if (!d.ideas.length) setError("Google bu kelime için öneri döndürmedi — daha genel bir kelime dene.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Arama başarısız");
    } finally {
      setBusy(false);
    }
  }

  const ideas = data?.ideas ?? [];
  const shown = useMemo(
    () =>
      ideas.filter(
        (i) => (intent === "all" || i.intent === intent) && (!cluster || i.cluster === cluster) && (!q || i.keyword.includes(q.toLocaleLowerCase("tr")))
      ),
    [ideas, intent, cluster, q]
  );
  const counts = (k: KeywordIntent) => ideas.filter((i) => i.intent === k).length;
  const maxHits = Math.max(1, ...ideas.map((i) => i.hits));
  const hasVolume = ideas.some((i) => i.volume != null);

  // İçerik haritası (AI'sız): her küme için sitede sayfa var mı?
  const clusterStats = useMemo(() => {
    const m = new Map<string, { keywords: string[]; volume: number; hits: number; intents: Set<string> }>();
    for (const i of ideas) {
      const e = m.get(i.cluster) ?? { keywords: [], volume: 0, hits: 0, intents: new Set<string>() };
      e.keywords.push(i.keyword);
      e.volume += i.volume ?? 0;
      e.hits += i.hits;
      e.intents.add(i.intent);
      m.set(i.cluster, e);
    }
    return m;
  }, [ideas]);
  useEffect(() => {
    if (!data?.clusters?.length || !domain) return;
    let off = false;
    setCmap({ busy: true, err: null, rows: [], scanned: 0 });
    fetch("/api/keywords/map", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain, clusters: data.clusters.slice(0, 40).map((c) => ({ name: c.name, keywords: (clusterStats.get(c.name)?.keywords ?? []).slice(0, 30) })) }),
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Harita çıkarılamadı");
        if (!off) setCmap({ busy: false, err: null, rows: j.rows, scanned: j.pagesScanned });
      })
      .catch((e) => !off && setCmap({ busy: false, err: e instanceof Error ? e.message : "Harita çıkarılamadı", rows: [], scanned: 0 }));
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, domain]);
  const mapRows = useMemo(() => {
    const prio = { missing: 0, cannibal: 1, draft: 2, covered: 3 } as const;
    const weight = (n: string) => {
      const c = clusterStats.get(n);
      return c ? (c.volume || c.hits * 10) * (c.intents.has("commercial") ? 1.5 : 1) : 0;
    };
    return (cmap?.rows ?? []).slice().sort((a, b) => prio[a.status] - prio[b.status] || weight(b.cluster) - weight(a.cluster));
  }, [cmap, clusterStats]);
  const mapCount = (st: MapRow["status"]) => (cmap?.rows ?? []).filter((r) => r.status === st).length;
  const selected = [...sel];

  function toggle(k: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }

  async function toAutoblog() {
    const r = await fetch("/api/feeds/append", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keywords: selected.slice(0, 50), siteUrl: domain }) });
    const d = await r.json();
    if (!r.ok) return setMsg({ ok: false, text: d.error ?? "Eklenemedi" });
    setMsg({ ok: true, text: `${d.added} kelime "${d.feedName}" beslemesine eklendi.`, href: `/campaigns?feed=${d.feedId}`, hrefLabel: "Bu beslemeyle autoblog kur" });
    setSel(new Set());
  }

  async function toRankings() {
    if (!domain.trim()) return setMsg({ ok: false, text: "Sıralama takibi için önce sitenin alan adını yaz." });
    const r = await fetch("/api/rankings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain, keywords: selected.slice(0, 100) }) });
    const d = await r.json();
    if (!r.ok) return setMsg({ ok: false, text: d.error ?? "Eklenemedi" });
    setMsg({ ok: true, text: `${d.added} kelime ${domain} için sıralama takibine eklendi.`, href: "/rankings", hrefLabel: "Sıralama Takibi'ne git" });
    setSel(new Set());
  }

  function copyCsv() {
    const rows = (selected.length ? ideas.filter((i) => sel.has(i.keyword)) : shown).map((i) => `"${i.keyword}",${INTENT_LABEL[i.intent]},${i.hits},${i.volume ?? ""},${i.competition ?? ""},${i.cluster}`);
    navigator.clipboard?.writeText(["anahtar kelime,niyet,öneri sıklığı,küme", ...rows].join("\n"));
    setMsg({ ok: true, text: `${rows.length} satır panoya kopyalandı (Excel'e yapıştırabilirsin).` });
  }

  async function openSerp(keyword: string) {
    setSerp({ keyword, data: null, error: null, loading: true });
    const [gl, hl] = market.split("|");
    try {
      const r = await fetch("/api/keywords/serp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keyword, gl: gl.toLowerCase(), hl }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Analiz başarısız");
      setSerp({ keyword, data: d, error: null, loading: false });
    } catch (e) {
      setSerp({ keyword, data: null, error: e instanceof Error ? e.message : "Analiz başarısız", loading: false });
    }
  }

  function editorLink(keyword: string, s?: SerpAnalysis | null) {
    const params = new URLSearchParams({ new: keyword });
    if (s) {
      if (s.commonTopics.length) params.set("h", s.commonTopics.slice(0, 6).map((t) => t.topic).join("|"));
      if (s.peopleAlsoAsk.length) params.set("faq", s.peopleAlsoAsk.slice(0, 5).join("|"));
      if (s.avgWords) params.set("words", String(s.avgWords));
    }
    return `/editor?${params}`;
  }

  const chip = (on: boolean) =>
    `inline-flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-[13px] font-medium whitespace-nowrap ${on ? "bg-accent/5 text-ink shadow-[inset_0_0_0_1px_#BDB4FF]" : "bg-panel text-sub shadow-[inset_0_0_0_1px_#E4E5E8] hover:text-ink"}`;

  const topCluster = data?.clusters?.[0] ?? null;
  const totalVolume = ideas.reduce((a, i) => a + (i.volume ?? 0), 0);
  const actions: { kind: string; color: string; title: string; body: string; cta: React.ReactNode }[] = [];
  if (data && ideas.length) {
    if (mapCount("missing") || mapCount("cannibal"))
      actions.push({
        kind: "İçerik haritası",
        color: "text-danger-ink",
        title: mapCount("missing") ? `${mapCount("missing")} konu için sitende sayfa yok` : `${mapCount("cannibal")} konuda birden fazla sayfa yarışıyor`,
        body: mapCount("missing")
          ? "Bu kümelerde Google ve AI motorlarına gösterecek bir sayfan yok; en büyük kümeden başla."
          : "Aynı konuyu hedefleyen sayfalar birbirinin sıralamasını düşürür (yamyamlık). Birini ana sayfa yap, diğerlerini birleştir ya da ona link ver.",
        cta: (
          <button type="button" onClick={() => document.getElementById("icerik-haritasi")?.scrollIntoView({ behavior: "smooth" })} className={BTN2}>
            Haritayı gör
          </button>
        ),
      });
    if (counts("question"))
      actions.push({
        kind: "GEO",
        color: "text-accent",
        title: `${counts("question")} gerçek soru bulundu`,
        body: "AI motorları ve Google'ın öne çıkan cevapları bu sorulardan beslenir. Her biri bir SSS maddesi ya da kısa bir cevap yazısı olabilir.",
        cta: (
          <button type="button" onClick={() => { setIntent("question"); setCluster(null); }} className={BTN2}>
            Soruları göster
          </button>
        ),
      });
    if (topCluster)
      actions.push({
        kind: "İçerik",
        color: "text-seo-ink",
        title: `En büyük konu: "${topCluster.name}"`,
        body: `${topCluster.count} kelime bu kümede. Hepsini kapsayan tek kapsamlı yazı, ayrı ayrı küçük yazılardan daha iyi sıralanır.`,
        cta: (
          <Link href={editorLink(topCluster.name)} className={BTN2}>
            Bu konuda yaz
          </Link>
        ),
      });
    if (!hasVolume)
      actions.push({
        kind: "Eksik veri",
        color: "text-warn-ink",
        title: "Aylık arama hacmini gör",
        body: "Şu an popülerliği öneri sıklığıyla tahmin ediyoruz. Google Keyword Planner'ı bağlarsan gerçek aylık arama ve rekabet gelir.",
        cta: (
          <Link href="/integrations" className={BTN2}>
            Keyword Planner&apos;ı bağla
          </Link>
        ),
      });
    else if (counts("commercial"))
      actions.push({
        kind: "Satış",
        color: "text-warn-ink",
        title: `${counts("commercial")} satın almaya yakın kelime`,
        body: "Fiyat, en iyi, yorum gibi aramalar. Bunları sıralama takibine ekle, hangi sırada olduğunu her gün izle.",
        cta: (
          <button type="button" onClick={() => { setIntent("commercial"); setCluster(null); }} className={BTN2}>
            Ticarileri göster
          </button>
        ),
      });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={data ? `"${data.seed}" için insanlar ne arıyor?` : "Hangi konularda yazmalısın?"}
        description={
          data
            ? `${ideas.length} kelime fikri · ${data.clusters.length} konu kümesi${hasVolume ? ` · toplam ${totalVolume.toLocaleString("tr-TR")} aylık arama` : ""} · Google önerilerinden, ücretsiz`
            : "Bir kelime yaz; Google'ın gerçek arama önerilerinden yüzlerce uzun kuyruklu kelime ve soru çıkaralım. Ücretsiz, yapay zekâ kullanmaz."
        }
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
        className={`${CARD} flex flex-wrap items-center gap-2 p-2 pl-4`}
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-sub" fill="none" stroke="currentColor" strokeWidth="1.7">
          <circle cx="9" cy="9" r="5.5" />
          <path d="M13 13l3.5 3.5" />
        </svg>
        <input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="Bir kelime yaz, ör. abiye elbise" className="min-w-0 flex-1 bg-transparent py-2 text-[15px] outline-none" />
        <select value={market} onChange={(e) => setMarket(e.target.value)} className="h-9 rounded-[10px] border border-border bg-panel px-2 text-[13px] outline-none">
          {MARKETS.map((m) => (
            <option key={m.v} value={m.v}>
              {m.l}
            </option>
          ))}
        </select>
        <button disabled={busy || !seed.trim()} className={`${BTN1} h-9 px-4`}>
          {busy ? "Aranıyor…" : "Kelime bul"}
        </button>
      </form>
      {busy && <p className="text-xs text-sub">Google önerileri soru kalıpları ve a–z harfleriyle taranıyor (yaklaşık 60 sorgu, 10–20 saniye)…</p>}
      <ErrorBlock message={error} />

      {!data && !busy && (
        <div className={`${CARD} px-6 py-8`}>
          <div className="mx-auto max-w-2xl text-center">
            <div className="text-base font-semibold">Neler çıkar?</div>
            <p className="mt-1 text-sm text-sub">Kelimeleri niyete göre ayırır, benzerlerini konu kümelerinde toplarız. Her küme bir yazı, her soru bir SSS maddesi olabilir.</p>
          </div>
          <div className="mx-auto mt-5 grid max-w-3xl gap-3 md:grid-cols-3">
            {[
              ["Soru", "nasıl, nedir, hangisi… GEO ve SSS için birebir.", INTENT_TONE.question],
              ["Ticari", "fiyat, en iyi, yorum… satın almaya yakın aramalar.", INTENT_TONE.commercial],
              ["Karşılaştırma", "X mi Y mi, fark, alternatif… karar aşaması.", INTENT_TONE.comparison],
            ].map(([t, b, tone]) => (
              <div key={t} className="rounded-xl border border-border p-4">
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${tone}`}>{t}</span>
                <p className="mt-2 text-[13px] text-sub">{b}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && ideas.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {([
              ["all", "Toplam fikir", ideas.length, `${data.queries} Google sorgusundan`],
              ["question", "Soru", counts("question"), "SSS ve GEO için"],
              ["commercial", "Ticari", counts("commercial"), "satın almaya yakın"],
              ["comparison", "Karşılaştırma", counts("comparison"), "karar aşaması"],
              ["local", "Yerel", counts("local"), "şehir / yakınımda"],
            ] as const).map(([k, l, n, hint]) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setIntent(k);
                  setCluster(null);
                }}
                className={`${CARD} px-4 py-4 text-left transition ${intent === k ? "!border-[#BDB4FF] ring-1 ring-[#BDB4FF]" : "hover:border-[#D5D7DA]"}`}
              >
                <div className="text-xs font-medium text-sub">{l}</div>
                <div className="mt-1.5 text-[26px] font-semibold leading-8 tabular-nums">{n}</div>
                <div className="mt-1 h-4 text-[11px] text-sub">{hint}</div>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#BDB4FF] bg-accent/[0.04] px-5 py-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-base text-white">✦</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Yapay zekâ ile konu planı ve GEO soruları çıkar</div>
              <p className="text-[13px] text-sub">Kelimeleri anlama göre yazı konularına ayırır, her konuya başlık önerir; kelimeleri insanların ChatGPT&apos;ye soracağı sorulara çevirir.</p>
            </div>
            <span className="text-[11px] text-sub">1 AI sorgusu</span>
            <button type="button" onClick={runAi} disabled={ai?.busy} className={BTN1}>
              {ai?.busy ? "Çalışıyor…" : ai && !ai.err ? "Sonuçları aç" : "AI ile analiz et"}
            </button>
          </div>

          <KeywordAgentPanel seed={data.seed} ideas={data.ideas.map((i) => ({ keyword: i.keyword, intent: i.intent, hits: i.hits }))} />

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

          <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
            <div className={`${CARD} overflow-hidden`}>
              <div className="flex flex-wrap items-center gap-2 px-5 py-3">
                {sel.size > 0 ? (
                  <>
                    <span className="text-[13px] font-medium">{sel.size} seçili</span>
                    {!project && <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="siten.com" className="h-8 w-40 rounded-[9px] border border-border bg-panel px-3 text-[13px] outline-none focus:border-[#BDB4FF]" />}
                    <button type="button" onClick={toRankings} className={BTN2}>
                      Sıralama takibine ekle
                    </button>
                    <button type="button" onClick={toAutoblog} className={BTN2}>
                      Autoblog&apos;a ekle
                    </button>
                    <button type="button" onClick={copyCsv} className={BTN2}>
                      Kopyala
                    </button>
                    <button type="button" onClick={() => setSel(new Set())} className="ml-auto text-xs font-medium text-sub hover:text-ink">
                      Seçimi kaldır
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-semibold">
                      {cluster ? `"${cluster}" kümesi` : intent === "all" ? "Tüm kelimeler" : INTENT_LABEL[intent as KeywordIntent]} <span className="font-normal text-sub">· {shown.length}</span>
                    </span>
                    {(cluster || intent !== "all") && (
                      <button type="button" onClick={() => { setCluster(null); setIntent("all"); }} className="text-xs font-medium text-accent hover:underline">
                        Filtreyi temizle
                      </button>
                    )}
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Listede ara…" className="ml-auto h-8 w-48 rounded-[9px] border border-border bg-panel px-3 text-[13px] outline-none focus:border-[#BDB4FF]" />
                    <button type="button" onClick={copyCsv} className={BTN2}>
                      CSV kopyala
                    </button>
                  </>
                )}
              </div>
              {msg && (
                <div className={`mx-5 mb-3 rounded-lg px-3 py-2 text-xs ${msg.ok ? "bg-seo/10 text-seo-ink" : "bg-danger/5 text-danger-ink"}`}>
                  {msg.text}{" "}
                  {msg.href && (
                    <Link href={msg.href} className="font-medium underline">
                      {msg.hrefLabel}
                    </Link>
                  )}
                </div>
              )}
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-y border-border bg-[#fafafa] text-left text-xs text-sub">
                    <th className="w-10 py-2 pl-5">
                      <input
                        type="checkbox"
                        checked={shown.length > 0 && shown.every((i) => sel.has(i.keyword))}
                        onChange={(e) => setSel(e.target.checked ? new Set([...sel, ...shown.map((i) => i.keyword)]) : new Set([...sel].filter((k) => !shown.some((i) => i.keyword === k))))}
                        className="accent-[#4f00ff]"
                      />
                    </th>
                    <th className="py-2 pr-3 font-medium">Anahtar kelime</th>
                    <th className="hidden py-2 pr-3 font-medium md:table-cell">Niyet</th>
                    {hasVolume && <th className="py-2 pr-3 text-right font-medium" title="Google Keyword Planner, aylık ortalama arama">Aylık arama</th>}
                    {hasVolume && <th className="hidden py-2 pr-3 font-medium lg:table-cell">Rekabet</th>}
                    {!hasVolume && <th className="hidden py-2 pr-3 font-medium sm:table-cell" title="Kaç farklı sorguda önerildi; popülerlik için kaba sinyal (arama hacmi değil)">Popülerlik</th>}
                    <th className="py-2 pr-5 text-right font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {shown.slice(0, 300).map((i) => (
                    <tr key={i.keyword} className={`group ${sel.has(i.keyword) ? "bg-accent/[0.03]" : "hover:bg-[#fafafa]"}`}>
                      <td className="py-2.5 pl-5">
                        <input type="checkbox" checked={sel.has(i.keyword)} onChange={() => toggle(i.keyword)} className="accent-[#4f00ff]" />
                      </td>
                      <td className="py-2.5 pr-3">
                        <button type="button" onClick={() => openSerp(i.keyword)} className="text-left font-medium hover:text-accent">
                          {i.keyword}
                        </button>
                        {i.source === "planner" && <span className="ml-2 text-[11px] text-sub">Planner</span>}
                      </td>
                      <td className="hidden py-2.5 pr-3 md:table-cell">
                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${INTENT_TONE[i.intent]}`}>{INTENT_LABEL[i.intent]}</span>
                      </td>
                      {hasVolume && <td className="py-2.5 pr-3 text-right font-medium tabular-nums">{i.volume != null ? i.volume.toLocaleString("tr-TR") : <span className="text-sub">—</span>}</td>}
                      {hasVolume && (
                        <td className="hidden py-2.5 pr-3 text-[11px] text-sub lg:table-cell">
                          {i.competition ? COMP_LABEL[i.competition] : "—"}
                          {i.cpcHigh ? <span className="ml-1">· TBM ≤ {i.cpcHigh.toLocaleString("tr-TR")}</span> : null}
                        </td>
                      )}
                      {!hasVolume && (
                        <td className="hidden py-2.5 pr-3 sm:table-cell">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-accent" style={{ width: `${(i.hits / maxHits) * 100}%` }} />
                          </div>
                        </td>
                      )}
                      <td className="whitespace-nowrap py-2.5 pr-5 text-right text-xs">
                        <button type="button" onClick={() => openSerp(i.keyword)} className="font-medium text-sub hover:text-accent">
                          Google analizi
                        </button>
                        <span className="mx-1.5 text-border">|</span>
                        <Link href={editorLink(i.keyword)} className="font-medium text-accent hover:underline">
                          Yazı yaz
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shown.length > 300 && <div className="border-t border-border px-5 py-2.5 text-xs text-sub">İlk 300 gösteriliyor; aramayla daralt.</div>}
            </div>

            <div className="space-y-3">
              {data.clusters.length > 0 && (
                <div className={CARD}>
                  <div className="px-5 pt-4">
                    <h3 className="text-sm font-semibold">Konu kümeleri</h3>
                    <p className="text-xs text-sub">Her küme bir yazı olabilir · tıkla, filtrele</p>
                  </div>
                  <ul className="max-h-[420px] space-y-1 overflow-y-auto px-3 pb-3 pt-2">
                    {data.clusters.map((c) => {
                      const max = data.clusters[0].count || 1;
                      const on = cluster === c.name;
                      return (
                        <li key={c.name}>
                          <button
                            type="button"
                            onClick={() => {
                              setCluster(on ? null : c.name);
                              setIntent("all");
                            }}
                            className={`w-full rounded-lg px-2 py-1.5 text-left text-[13px] ${on ? "bg-accent/5 shadow-[inset_0_0_0_1px_#BDB4FF]" : "hover:bg-[#fafafa]"}`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="min-w-0 flex-1 truncate">{c.name}</span>
                              <span className="text-xs tabular-nums text-sub">{c.count}</span>
                            </div>
                            <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-accent/70" style={{ width: `${(c.count / max) * 100}%` }} />
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              <div className={`${CARD} p-4 text-[12px] leading-5 text-sub`}>
                {hasVolume ? (
                  "Aylık arama ve rekabet Google Keyword Planner'dan gelir. \"Planner\" işaretli kelimeler doğrudan Keyword Planner önerisidir."
                ) : (
                  <>
                    &quot;Popülerlik&quot;, kelimenin kaç farklı sorguda Google tarafından önerildiğidir; arama hacmi değildir.{" "}
                    <Link href="/integrations" className="font-medium text-accent">
                      Keyword Planner&apos;ı bağla
                    </Link>
                    , gerçek aylık aramayı gör.
                  </>
                )}
                {data?.adsError && <p className="mt-2 text-danger-ink">Keyword Planner: {data.adsError}</p>}
              </div>
            </div>
          </div>

          {/* İçerik haritası */}
          <div id="icerik-haritasi" className={`${CARD} overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold">İçerik haritası — bu konular sitende var mı?</h3>
                <p className="text-xs text-sub">
                  {domain ? `${domain} sayfalarıyla eşleştirildi${cmap?.scanned ? ` (${cmap.scanned} sayfa)` : ""} · AI kullanmaz, ücretsiz` : "Sitenle eşleştirmek için bir proje seç ya da yukarıya alan adını yaz."}
                </p>
              </div>
              {cmap && !cmap.busy && cmap.rows.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {([
                    ["all", "Tümü", cmap.rows.length],
                    ["missing", "Sayfa yok", mapCount("missing")],
                    ["cannibal", "Yamyamlık", mapCount("cannibal")],
                    ["draft", "Taslakta", mapCount("draft")],
                    ["covered", "Sayfa var", mapCount("covered")],
                  ] as const).map(([k, l, n]) => (
                    <button key={k} type="button" onClick={() => setMf(k)} className={chip(mf === k)}>
                      {l} <span className="text-sub">{n}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!domain ? null : cmap?.busy ? (
              <div className="h-32 animate-pulse border-t border-border bg-muted/40" />
            ) : cmap?.err ? (
              <div className="border-t border-border px-5 py-4 text-[13px] text-danger-ink">{cmap.err}</div>
            ) : cmap && cmap.scanned === 0 ? (
              <div className="border-t border-border px-5 py-6 text-[13px] text-sub">
                Sitenin sayfaları okunamadı (sitemap.xml yok ya da erişilemiyor).{" "}
                <Link href="/import" className="font-medium text-accent">
                  Site Taraması
                </Link>{" "}
                çalıştırırsan harita çıkar.
              </div>
            ) : (
              <table className="w-full border-t border-border text-[13px]">
                <thead className="bg-[#fafafa] text-left text-xs text-sub">
                  <tr>
                    <th className="py-2 pl-5 font-medium">Konu</th>
                    <th className="py-2 pr-3 font-medium">Durum</th>
                    <th className="hidden py-2 pr-3 font-medium md:table-cell">Sitedeki sayfa</th>
                    <th className="hidden py-2 pr-3 text-right font-medium lg:table-cell">Sıra</th>
                    <th className="py-2 pr-5 text-right font-medium">Ne yapmalı</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {mapRows
                    .filter((r) => mf === "all" || r.status === mf)
                    .slice(0, 40)
                    .map((r) => {
                      const cs = clusterStats.get(r.cluster);
                      const st = {
                        missing: ["Sayfa yok", "bg-danger/10 text-danger-ink"],
                        cannibal: ["Yamyamlık riski", "bg-warn/10 text-warn-ink"],
                        draft: ["Taslakta", "bg-sky-50 text-sky-700"],
                        covered: ["Sayfa var", "bg-seo/10 text-seo-ink"],
                      }[r.status];
                      return (
                        <tr key={r.cluster} className="align-top">
                          <td className="py-3 pl-5 pr-3">
                            <div className="font-medium">{r.cluster}</div>
                            <div className="text-[11px] text-sub">
                              {cs?.keywords.length ?? 0} kelime{cs?.volume ? ` · ${cs.volume.toLocaleString("tr-TR")} aylık arama` : ""}
                            </div>
                          </td>
                          <td className="py-3 pr-3">
                            <span className={`whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ${st[1]}`}>{st[0]}</span>
                          </td>
                          <td className="hidden max-w-[320px] py-3 pr-3 md:table-cell">
                            {r.pages.length ? (
                              r.pages.slice(0, r.status === "cannibal" ? 3 : 1).map((p) => (
                                <a key={p.url} href={p.url} target="_blank" rel="noreferrer" className="block truncate text-ink/80 hover:text-accent">
                                  {p.title || p.url.replace(/^https?:\/\/[^/]+/, "")}
                                  <span className="ml-1 text-[11px] text-sub">{p.url.replace(/^https?:\/\/[^/]+/, "") || "/"}</span>
                                </a>
                              ))
                            ) : r.drafts.length ? (
                              <span className="text-sub">Taslak: {r.drafts[0].title}</span>
                            ) : (
                              <span className="text-sub">—</span>
                            )}
                          </td>
                          <td className="hidden py-3 pr-3 text-right tabular-nums lg:table-cell">{r.ranking ? (r.ranking.position ? `${r.ranking.position}.` : "100+") : <span className="text-sub">—</span>}</td>
                          <td className="py-3 pr-5 text-right">
                            {r.status === "missing" && (
                              <Link href={editorLink(r.cluster)} className="text-xs font-medium text-accent hover:underline">
                                Yazı yaz
                              </Link>
                            )}
                            {r.status === "draft" && (
                              <Link href={`/editor?draftId=${r.drafts[0].id}`} className="text-xs font-medium text-accent hover:underline">
                                Taslağı bitir
                              </Link>
                            )}
                            {r.status === "cannibal" && <span className="text-xs text-sub">Birini ana sayfa yap, diğerlerini birleştir</span>}
                            {r.status === "covered" &&
                              (r.ranking && (r.ranking.position == null || r.ranking.position > 10) ? (
                                <Link href="/calendar?tab=refresh" className="text-xs font-medium text-accent hover:underline">
                                  Sayfayı yenile
                                </Link>
                              ) : !r.ranking ? (
                                <span className="text-xs text-sub">Sıralama takibine ekle</span>
                              ) : (
                                <span className="text-xs text-seo-ink">İyi durumda</span>
                              ))}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      <Drawer isOpen={aiOpen} onClose={() => setAiOpen(false)} eyebrow="Yapay zekâ analizi" title={data ? `"${data.seed}" konu planı` : "Konu planı"} subtitle="Kelimeler yalnızca Google önerilerinden; yapay zekâ yeni kelime uydurmaz, sadece gruplar ve soruya çevirir." size="2xl">
        <div className="space-y-6 text-[13px]">
          {ai?.busy && (
            <div className="flex items-center gap-3 text-sub">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              Kelimeler gruplanıyor ve sorulara çevriliyor (10–20 sn)…
            </div>
          )}
          {ai?.err && <ErrorBlock message={ai.err} />}
          {ai?.demo && <p className="rounded-lg bg-warn/5 px-3 py-2 text-xs text-ink/70">Demo mod: yapay zekâ çalışmadı, örnek çıktı gösteriliyor.</p>}
          {ai && ai.clusters.length > 0 && (
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-sm font-semibold">Yazı konuları ({ai.clusters.length})</h3>
                <span className="text-xs text-sub">her biri tek bir yazı</span>
              </div>
              <div className="space-y-2">
                {ai.clusters.map((c) => (
                  <div key={c.name} className="rounded-xl border border-border p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${INTENT_TONE[c.intent]}`}>{INTENT_LABEL[c.intent]}</span>
                          <span className="text-xs text-sub">{c.name} · {c.keywords.length} kelime</span>
                        </div>
                        <div className="mt-1 font-semibold">{c.title}</div>
                      </div>
                      <Link href={`/editor?${new URLSearchParams({ new: c.title || c.name, h: c.keywords.slice(0, 6).join("|") })}`} className={`${BTN2} shrink-0`}>
                        Bu konuda yaz
                      </Link>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {c.keywords.map((k) => (
                        <span key={k} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-sub">
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {ai && ai.prompts.length > 0 && (
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-sm font-semibold">GEO soruları ({ai.prompts.length})</h3>
                <span className="text-xs text-sub">insanlar AI&apos;a böyle soruyor</span>
              </div>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {ai.prompts.map((p) => (
                  <li key={p.prompt} className="flex items-start gap-3 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={pSel.has(p.prompt)}
                      onChange={() =>
                        setPSel((s) => {
                          const n = new Set(s);
                          if (n.has(p.prompt)) n.delete(p.prompt);
                          else n.add(p.prompt);
                          return n;
                        })
                      }
                      className="mt-0.5 accent-[#4f00ff]"
                    />
                    <div className="min-w-0 flex-1">
                      <div>{p.prompt}</div>
                      {p.keyword && <div className="text-[11px] text-sub">kelime: {p.keyword}</div>}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" onClick={addPrompts} disabled={!pSel.size} className={BTN1}>
                  {pSel.size} soruyu GEO takibine ekle
                </button>
                <span className="text-[11px] text-sub">{project ? `${project.domain} projesine eklenir; çalıştırınca AI motoru kotası kullanır.` : "Önce soldan bir proje seç."}</span>
              </div>
              {pMsg && (
                <p className={`mt-2 rounded-lg px-3 py-2 text-xs ${pMsg.ok ? "bg-seo/10 text-seo-ink" : "bg-danger/5 text-danger-ink"}`}>
                  {pMsg.text}{" "}
                  {pMsg.ok && (
                    <Link href="/geo" className="font-medium underline">
                      GEO Görünürlük&apos;e git
                    </Link>
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      </Drawer>

      <Drawer isOpen={!!serp} onClose={() => setSerp(null)} eyebrow="Google ilk sayfa analizi" title={serp?.keyword ?? ""} subtitle="İlk 10 sonuç ne yazıyor, ne kadar uzun, hangi alt konuları işliyor." size="2xl">
        {serp && (
          <div className="space-y-5 text-[13px]">
            {serp.loading && <p className="text-sub">İlk 10 sonuç ve sayfaları okunuyor (15–30 sn)…</p>}
            {serp.error && (
              <div className="rounded-xl border border-warn/30 bg-warn/5 p-4 text-ink/70">
                {serp.error}
                {!serpAvailable && (
                  <p className="mt-2 text-xs text-sub">
                    Bu özellik Google sonuçlarını okumak için SerpApi kullanır (her analiz 1 arama).{" "}
                    <Link href="/integrations" className="font-medium text-accent">
                      Entegrasyonlar
                    </Link>
                    &apos;dan ücretsiz SerpApi anahtarını bağlayabilir ya da kelimeyi doğrudan Editörde yazabilirsin.
                  </p>
                )}
                <Link href={editorLink(serp.keyword)} className={`${BTN1} mt-3`}>
                  Editörde yaz
                </Link>
              </div>
            )}
            {serp.data && (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {([
                    ["Ort. kelime", serp.data.avgWords ?? "—"],
                    ["SSS olan", `%${Math.round(serp.data.faqShare * 100)}`],
                    ["Tablo olan", `%${Math.round(serp.data.tableShare * 100)}`],
                    ["AI Overview", serp.data.aiOverview ? "Var" : "Yok"],
                  ] as const).map(([l, v]) => (
                    <div key={l} className="rounded-xl border border-border px-3 py-2">
                      <div className="text-[11px] text-sub">{l}</div>
                      <div className="text-lg font-semibold tabular-nums">{v}</div>
                    </div>
                  ))}
                </div>
                <Link href={editorLink(serp.keyword, serp.data)} className={`${BTN1} w-full justify-center`}>
                  Bu yapıyla Editörde yaz (ortak başlıklar + &quot;Şunu da soruyor&quot; SSS olarak)
                </Link>
                {serp.data.commonTopics.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-xs font-medium text-sub">Rakiplerin ortak alt konuları</div>
                    <div className="flex flex-wrap gap-1.5">
                      {serp.data.commonTopics.map((t) => (
                        <span key={t.topic} className="rounded-md bg-muted px-2 py-0.5 text-xs">
                          {t.topic} <span className="text-sub">{t.count}/{serp.data!.pages.length}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {serp.data.peopleAlsoAsk.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-xs font-medium text-sub">Kullanıcılar şunu da soruyor</div>
                    <ul className="space-y-1">
                      {serp.data.peopleAlsoAsk.map((x) => (
                        <li key={x} className="rounded-lg bg-accent/5 px-3 py-1.5">
                          {x}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <div className="mb-1.5 text-xs font-medium text-sub">İlk sonuçlar</div>
                  <div className="divide-y divide-border rounded-xl border border-border">
                    {serp.data.pages.map((p) => (
                      <div key={p.url} className="flex items-start gap-3 px-3 py-2.5 text-xs">
                        <span className="w-5 shrink-0 font-medium text-sub">{p.position}</span>
                        <div className="min-w-0 flex-1">
                          <a href={p.url} target="_blank" rel="noreferrer" className="block truncate font-medium hover:text-accent">
                            {p.title}
                          </a>
                          <div className="truncate text-sub">
                            {p.domain} · {p.words ?? "?"} kelime · {p.h2.length} H2{p.hasFaq ? " · SSS" : ""}
                            {p.hasTable ? " · tablo" : ""}
                          </div>
                        </div>
                        {p.citability !== null && (
                          <span title="AI alıntılanabilirlik" className={`shrink-0 rounded px-1.5 py-0.5 font-medium ${p.citability >= 65 ? "bg-seo/10 text-seo-ink" : p.citability >= 45 ? "bg-warn/10 text-warn-ink" : "bg-danger/10 text-danger-ink"}`}>
                            {p.citability}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                {serp.data.relatedSearches.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-xs font-medium text-sub">İlgili aramalar</div>
                    <div className="flex flex-wrap gap-1.5">
                      {serp.data.relatedSearches.map((x) => (
                        <button
                          key={x}
                          type="button"
                          onClick={() => {
                            setSerp(null);
                            setSeed(x);
                            run(x);
                          }}
                          className={chip(false)}
                        >
                          {x}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
