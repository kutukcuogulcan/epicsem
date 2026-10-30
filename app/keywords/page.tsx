"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ToolPageHeader from "@/components/ToolPageHeader";
import type { KeywordIdea, KeywordIntent } from "@/lib/keyword-research";
import PageGuide from "@/components/PageGuide";
import { Drawer } from "@/components/ui";
import { useProject } from "@/components/ProjectProvider";

const INTENT_LABEL: Record<KeywordIntent, string> = {
  question: "Soru",
  commercial: "Ticari",
  comparison: "Karşılaştırma",
  local: "Yerel",
  informational: "Uzun kuyruk",
};
const INTENT_TONE: Record<KeywordIntent, string> = {
  question: "bg-accent/10 text-accent",
  commercial: "bg-seo/10 text-seo",
  comparison: "bg-warn/10 text-warn",
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

  return (
    <div className="space-y-6">
      <ToolPageHeader
        breadcrumbLabel="Anahtar Kelime Bulucu"
        title="Anahtar Kelime Bulucu"
        body="Bir kelime yaz; Google'ın gerçek arama önerilerinden yüzlerce uzun kuyruklu kelime ve soru çıkaralım. Ücretsiz, AI kullanmaz."
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
        className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-panel shadow-sm p-2 shadow-sm"
      >
        <input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="ör. abiye elbise" className="min-w-0 flex-1 bg-transparent px-3 py-2 text-base outline-none" />
        <select value={market} onChange={(e) => setMarket(e.target.value)} className="rounded-xl border border-border bg-muted px-3 py-2 text-sm">
          {MARKETS.map((m) => (
            <option key={m.v} value={m.v}>{m.l}</option>
          ))}
        </select>
        <button disabled={busy || !seed.trim()} className="rounded-xl bg-accent px-5 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? "Aranıyor…" : "Kelime bul →"}
        </button>
      </form>
      {busy && <p className="text-xs text-ink/50">Google önerileri soru kalıpları ve a–z harfleriyle taranıyor (yaklaşık 60 sorgu, 10–20 saniye)…</p>}
      {error && <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}

      {!data && !busy && (
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ["Sorular", "İnsanların gerçekten sorduğu 'nasıl, nedir, hangisi' soruları — SSS ve GEO için birebir."],
            ["Ticari kelimeler", "'fiyat, en iyi, ucuz, yorum' gibi satın almaya yakın aramalar."],
            ["Kümeler", "Benzer kelimeler gruplanır; her küme bir yazı ya da sayfa olabilir."],
          ].map(([t, b]) => (
            <div key={t} className="rounded-xl border border-border bg-panel shadow-sm p-5">
              <div className="font-bold">{t}</div>
              <p className="mt-1 text-sm text-ink/55">{b}</p>
            </div>
          ))}
        </div>
      )}

      {data && ideas.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <button type="button" onClick={() => setIntent("all")} className={`rounded-2xl border p-4 text-left ${intent === "all" ? "border-accent ring-1 ring-accent" : "border-border bg-panel"}`}>
              <div className="text-[11px] text-ink/50">Toplam fikir</div>
              <div className="text-2xl font-semibold tabular-nums">{ideas.length}</div>
              <div className="text-[10px] text-ink/45">{data.queries} sorgudan</div>
            </button>
            {(["question", "commercial", "comparison", "local"] as KeywordIntent[]).map((k) => (
              <button key={k} type="button" onClick={() => setIntent(k)} className={`rounded-2xl border p-4 text-left ${intent === k ? "border-accent ring-1 ring-accent" : "border-border bg-panel"}`}>
                <div className="text-[11px] text-ink/50">{INTENT_LABEL[k]}</div>
                <div className="text-2xl font-semibold tabular-nums">{counts(k)}</div>
              </button>
            ))}
          </div>

          {data.clusters.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-bold text-ink/45">Kümeler:</span>
              {data.clusters.map((c) => (
                <button key={c.name} type="button" onClick={() => setCluster(cluster === c.name ? null : c.name)} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${cluster === c.name ? "bg-ink text-white" : "bg-muted text-ink/65 hover:bg-ink/10"}`}>
                  {c.name} <span className="opacity-60">{c.count}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-panel shadow-sm p-3">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Listede ara…" className="min-w-0 flex-1 rounded-lg bg-muted px-3 py-1.5 text-sm outline-none" />
            <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="siten.com (takip / autoblog için)" className="w-52 rounded-lg bg-muted px-3 py-1.5 text-sm outline-none" />
            <span className="text-xs text-ink/50">{sel.size} seçili</span>
            <button type="button" disabled={!sel.size} onClick={toAutoblog} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">Autoblog&apos;a ekle</button>
            <button type="button" disabled={!sel.size} onClick={toRankings} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-40">Sıralama takibine ekle</button>
            <button type="button" onClick={copyCsv} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">Kopyala (CSV)</button>
          </div>
          {msg && (
            <div className={`rounded-xl px-4 py-2.5 text-xs ${msg.ok ? "bg-seo/5 text-seo" : "bg-danger/5 text-danger"}`}>
              {msg.text} {msg.href && <Link href={msg.href} className="font-semibold underline">{msg.hrefLabel}</Link>}
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-border bg-panel shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="w-10 px-4 py-2">
                    <input
                      type="checkbox"
                      checked={shown.length > 0 && shown.every((i) => sel.has(i.keyword))}
                      onChange={(e) => setSel(e.target.checked ? new Set([...sel, ...shown.map((i) => i.keyword)]) : new Set([...sel].filter((k) => !shown.some((i) => i.keyword === k))))}
                      className="accent-[#5d16ff]"
                    />
                  </th>
                  <th className="py-2 pr-3 font-semibold">Anahtar kelime ({shown.length})</th>
                  <th className="hidden py-2 pr-3 font-semibold md:table-cell">Niyet</th>
                  {hasVolume && <th className="py-2 pr-3 text-right font-semibold" title="Google Keyword Planner — aylık ortalama arama">Aylık arama</th>}
                  {hasVolume && <th className="hidden py-2 pr-3 font-semibold lg:table-cell">Rekabet</th>}
                  <th className="hidden py-2 pr-3 font-semibold sm:table-cell" title="Kaç farklı sorguda önerildi — popülerlik için kaba sinyal (arama hacmi değil)">Öneri sıklığı</th>
                  <th className="py-2 pr-4 text-right font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.slice(0, 300).map((i) => (
                  <tr key={i.keyword} className="hover:bg-muted/30">
                    <td className="px-4 py-2">
                      <input type="checkbox" checked={sel.has(i.keyword)} onChange={() => toggle(i.keyword)} className="accent-[#5d16ff]" />
                    </td>
                    <td className="py-2 pr-3">
                      <span className="font-medium">{i.keyword}</span>
                      <span className="ml-2 text-[10px] text-ink/35">{i.words} kelime{i.source === "planner" ? " · Planner" : ""}</span>
                    </td>
                    <td className="hidden py-2 pr-3 md:table-cell">
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${INTENT_TONE[i.intent]}`}>{INTENT_LABEL[i.intent]}</span>
                    </td>
                    {hasVolume && (
                      <td className="py-2 pr-3 text-right text-sm font-semibold tabular-nums">{i.volume != null ? i.volume.toLocaleString("tr-TR") : <span className="text-ink/30">—</span>}</td>
                    )}
                    {hasVolume && (
                      <td className="hidden py-2 pr-3 text-[11px] text-ink/55 lg:table-cell">
                        {i.competition ? COMP_LABEL[i.competition] : "—"}
                        {i.cpcHigh ? <span className="ml-1 text-ink/35">· TBM ≤ {i.cpcHigh.toLocaleString("tr-TR")}</span> : null}
                      </td>
                    )}
                    <td className="hidden py-2 pr-3 sm:table-cell">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${(i.hits / maxHits) * 100}%` }} />
                        </div>
                        <span className="text-[11px] tabular-nums text-ink/45">{i.hits}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-4 text-right text-xs">
                      <button type="button" onClick={() => openSerp(i.keyword)} className="font-semibold text-ink/60 hover:text-accent">Google analizi</button>
                      <span className="mx-1.5 text-ink/20">·</span>
                      <Link href={editorLink(i.keyword)} className="font-semibold text-accent hover:underline">Yazı yaz</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data?.adsError && <p className="rounded-lg bg-danger/5 px-3 py-2 text-xs text-danger">Keyword Planner: {data.adsError}</p>}
          <p className="text-[11px] text-ink/45">
            {hasVolume
              ? "Aylık arama ve rekabet Google Keyword Planner'dan gelir. \"Planner\" işaretli kelimeler doğrudan Keyword Planner önerisidir."
              : <>Arama hacmi için <Link href="/integrations" className="font-semibold text-accent">Google Keyword Planner&apos;ı bağla</Link>. &quot;Öneri sıklığı&quot;, kelimenin kaç farklı sorguda Google tarafından önerildiğidir — popülerlik için yön gösterir.</>}
          </p>
        </>
      )}

      {serp && (
        <Drawer isOpen onClose={() => setSerp(null)} panelClassName="flex h-full w-screen max-w-2xl flex-col border-l border-border bg-panel shadow-2xl animate-[pop-in_0.25s_ease-out]" raw header={<div className="min-w-0">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">Google ilk sayfa analizi</div>
                <div className="text-lg font-semibold">{serp.keyword}</div>
              </div>
</div>}>
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              {serp.loading && <p className="text-sm text-ink/55">İlk 10 sonuç ve sayfaları okunuyor (15–30 sn)…</p>}
              {serp.error && (
                <div className="rounded-xl border border-warn/30 bg-warn/5 p-4 text-sm text-ink/70">
                  {serp.error}
                  {!serpAvailable && <p className="mt-2 text-xs text-ink/55">Bu özellik Google sonuçlarını okumak için SerpApi kullanır (her analiz 1 arama). <Link href="/integrations" className="font-semibold text-accent">Entegrasyonlar</Link>&apos;dan ücretsiz SerpApi anahtarını bağlayabilir ya da kelimeyi doğrudan Editörde yazabilirsin.</p>}
                  <Link href={editorLink(serp.keyword)} className="mt-3 inline-block font-semibold text-accent">Editörde yaz →</Link>
                </div>
              )}
              {serp.data && (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl bg-muted/60 p-3"><div className="text-[10px] text-ink/45">Ort. kelime</div><div className="text-xl font-semibold tabular-nums">{serp.data.avgWords ?? "—"}</div></div>
                    <div className="rounded-xl bg-muted/60 p-3"><div className="text-[10px] text-ink/45">SSS olan</div><div className="text-xl font-semibold tabular-nums">%{Math.round(serp.data.faqShare * 100)}</div></div>
                    <div className="rounded-xl bg-muted/60 p-3"><div className="text-[10px] text-ink/45">Tablo olan</div><div className="text-xl font-semibold tabular-nums">%{Math.round(serp.data.tableShare * 100)}</div></div>
                    <div className="rounded-xl bg-muted/60 p-3"><div className="text-[10px] text-ink/45">AI Overview</div><div className="text-xl font-semibold">{serp.data.aiOverview ? "Var" : "Yok"}</div></div>
                  </div>
                  <Link href={editorLink(serp.keyword, serp.data)} className="block rounded-xl bg-accent px-4 py-3 text-center text-sm font-bold text-white hover:opacity-90">
                    Bu yapıyla Editörde yaz → (ortak başlıklar + &quot;Kullanıcılar şunu da soruyor&quot; SSS olarak)
                  </Link>
                  {serp.data.commonTopics.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink/45">Rakiplerin ortak alt konuları</div>
                      <div className="flex flex-wrap gap-1.5">
                        {serp.data.commonTopics.map((t) => (
                          <span key={t.topic} className="rounded-md bg-muted px-2 py-0.5 text-xs">{t.topic} <span className="text-ink/40">{t.count}/{serp.data!.pages.length}</span></span>
                        ))}
                      </div>
                    </div>
                  )}
                  {serp.data.peopleAlsoAsk.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink/45">Kullanıcılar şunu da soruyor</div>
                      <ul className="list-disc space-y-1 pl-5 text-sm text-ink/75">{serp.data.peopleAlsoAsk.map((x) => <li key={x}>{x}</li>)}</ul>
                    </div>
                  )}
                  <div>
                    <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink/45">İlk sonuçlar</div>
                    <div className="divide-y divide-border rounded-xl border border-border">
                      {serp.data.pages.map((p) => (
                        <div key={p.url} className="flex items-start gap-3 px-3 py-2.5 text-xs">
                          <span className="w-5 shrink-0 font-bold text-ink/40">{p.position}</span>
                          <div className="min-w-0 flex-1">
                            <a href={p.url} target="_blank" rel="noreferrer" className="block truncate font-semibold hover:text-accent">{p.title}</a>
                            <div className="truncate text-ink/45">{p.domain} · {p.words ?? "?"} kelime · {p.h2.length} H2{p.hasFaq ? " · SSS" : ""}{p.hasTable ? " · tablo" : ""}</div>
                          </div>
                          {p.citability !== null && (
                            <span title="AI alıntılanabilirlik" className={`shrink-0 rounded px-1.5 py-0.5 font-bold ${p.citability >= 65 ? "bg-seo/10 text-seo" : p.citability >= 45 ? "bg-warn/10 text-warn" : "bg-danger/10 text-danger"}`}>{p.citability}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  {serp.data.relatedSearches.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink/45">İlgili aramalar</div>
                      <div className="flex flex-wrap gap-1.5">
                        {serp.data.relatedSearches.map((x) => (
                          <button key={x} type="button" onClick={() => { setSerp(null); setSeed(x); run(x); }} className="rounded-full border border-border px-2.5 py-1 text-xs hover:border-accent hover:text-accent">{x}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </Drawer>
      )}

      <PageGuide id="keywords" />
    </div>
  );
}
