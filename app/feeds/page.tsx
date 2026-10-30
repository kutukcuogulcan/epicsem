"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ToolPageHeader from "@/components/ToolPageHeader";
import PageGuide from "@/components/PageGuide";

type Kind = "keyword" | "news" | "rss" | "youtube";

interface FeedRow {
  id: number;
  kind: Kind;
  name: string;
  config: Record<string, any>;
  total: number;
  done: number;
  lastError: string | null;
  refreshedAt: string | null;
  createdAt: string;
  usedBy: { id: number; name: string; status: string }[];
}

interface FeedDetail {
  id: number;
  kind: Kind;
  name: string;
  config: Record<string, any>;
  lastError: string | null;
  refreshedAt: string | null;
  items: { key: string; title: string; link?: string; summary?: string; publishedAt?: string | null; source?: string; addedAt?: string; used: boolean }[];
}

const KINDS: { id: Kind; title: string; body: string; color: string; icon: string }[] = [
  { id: "keyword", title: "Anahtar kelime beslemesi", body: "Başlangıç kelimelerin, Google önerileri ve rakiplerin yazılarından kendini haftalık yenileyen kelime listesi.", color: "bg-seo/10 text-seo", icon: "#" },
  { id: "news", title: "Haber beslemesi", body: "Seçtiğin konudaki güncel haberler (Google Haberler).", color: "bg-sky-500/10 text-sky-600", icon: "◫" },
  { id: "rss", title: "RSS beslemesi", body: "Takip ettiğin blog ya da sitelerin yeni yazıları.", color: "bg-orange-500/10 text-orange-600", icon: "◉" },
  { id: "youtube", title: "YouTube kanalı", body: "Bir kanalın yeni videolarını blog yazısına çevir.", color: "bg-danger/10 text-danger", icon: "▶" },
];
const KIND: Record<Kind, (typeof KINDS)[number]> = Object.fromEntries(KINDS.map((k) => [k.id, k])) as any;

const MARKETS = [
  { country: "TR", language: "tr", label: "Türkiye · Türkçe" },
  { country: "US", language: "en", label: "ABD · İngilizce" },
  { country: "GB", language: "en", label: "Birleşik Krallık · İngilizce" },
  { country: "DE", language: "de", label: "Almanya · Almanca" },
  { country: "FR", language: "fr", label: "Fransa · Fransızca" },
  { country: "ES", language: "es", label: "İspanya · İspanyolca" },
  { country: "NL", language: "nl", label: "Hollanda · Felemenkçe" },
];

const empty = { id: null as number | null, kind: "keyword" as Kind, name: "", siteUrl: "", seeds: "", competitors: "", market: "TR", query: "", url: "", filter: "" };

function ago(iso: string | null) {
  if (!iso) return "—";
  const m = (Date.now() - new Date(iso).getTime()) / 60000;
  if (m < 60) return `${Math.max(1, Math.round(m))} dk önce`;
  if (m < 1440) return `${Math.round(m / 60)} sa önce`;
  return `${Math.round(m / 1440)} gün önce`;
}

const splitList = (s: string) => s.split(/\n|,/).map((x) => x.trim()).filter(Boolean);

export default function FeedsPage() {
  const [feeds, setFeeds] = useState<FeedRow[] | null>(null);
  const [picker, setPicker] = useState(false);
  const [form, setForm] = useState<typeof empty | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [detail, setDetail] = useState<FeedDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const r = await fetch("/api/feeds");
    if (r.status === 401) return (window.location.href = "/login?next=/feeds");
    setFeeds((await r.json()).feeds ?? []);
  }
  useEffect(() => {
    refresh();
  }, []);

  function startNew(kind: Kind) {
    setPicker(false);
    setFormError(null);
    setForm({ ...empty, kind });
  }

  function startEdit(f: FeedRow | FeedDetail) {
    const c = f.config;
    const market = MARKETS.find((m) => m.country === c.country && m.language === c.language)?.country ?? "TR";
    setDetail(null);
    setFormError(null);
    setForm({
      id: f.id,
      kind: f.kind,
      name: f.name,
      siteUrl: c.siteUrl ?? "",
      seeds: (c.seeds ?? []).join("\n"),
      competitors: (c.competitors ?? []).join("\n"),
      market,
      query: c.query ?? "",
      url: c.url ?? "",
      filter: (c.filter ?? []).join(", "),
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setFormError(null);
    const m = MARKETS.find((x) => x.country === form.market) ?? MARKETS[0];
    const config =
      form.kind === "keyword"
        ? { siteUrl: form.siteUrl, seeds: splitList(form.seeds), competitors: splitList(form.competitors).slice(0, 5), country: m.country, language: m.language }
        : form.kind === "news"
          ? { query: form.query, country: m.country, language: m.language }
          : { url: form.url, filter: form.filter.split(",").map((x) => x.trim()).filter(Boolean) };
    try {
      const r = await fetch("/api/feeds", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: form.id ?? undefined, kind: form.kind, name: form.name || KIND[form.kind].title, config }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Kaydedilemedi");
      setForm(null);
      await refresh();
      openDetail(d.feed.id);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  }

  async function openDetail(id: number) {
    const r = await fetch(`/api/feeds/${id}`);
    if (r.ok) setDetail((await r.json()).feed);
  }

  async function refreshNow(id: number) {
    setBusy(`refresh-${id}`);
    try {
      const r = await fetch(`/api/feeds/${id}`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Yenilenemedi");
      setDetail(d.feed);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yenilenemedi");
    } finally {
      setBusy(null);
    }
  }

  async function remove(f: FeedRow | FeedDetail) {
    if (!window.confirm(`"${f.name}" beslemesi silinsin mi?`)) return;
    const r = await fetch("/api/feeds", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: f.id }) });
    const d = await r.json();
    if (!r.ok) return setError(d.error ?? "Silinemedi");
    setDetail(null);
    await refresh();
  }

  const input = "w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm outline-none focus:border-accent";
  const label = "text-xs font-bold uppercase tracking-wide text-ink/45";

  return (
    <div className="space-y-8">
      <ToolPageHeader
        breadcrumbLabel="Beslemeler"
        title="Beslemeler"
        body="Autoblog'un konu kaynakları. Bir besleme kur, istediğin kadar autoblog'da kullan. Beslemeler kendini yeniler, AI kullanmaz ve kredi harcamaz."
      >
        <button type="button" onClick={() => setPicker(true)} className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white shadow-sm hover:opacity-90">
          + Yeni besleme
        </button>
      </ToolPageHeader>

      {error && <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}

      {feeds && feeds.length === 0 && (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {KINDS.map((k) => (
            <button key={k.id} type="button" onClick={() => startNew(k.id)} className="group rounded-xl border border-border bg-panel shadow-sm p-5 text-left transition hover:border-accent hover:shadow-md">
              <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl text-lg font-bold ${k.color}`}>{k.icon}</div>
              <div className="font-bold group-hover:text-accent">{k.title}</div>
              <p className="mt-1 text-sm text-ink/55">{k.body}</p>
            </button>
          ))}
        </section>
      )}

      {feeds && feeds.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-border bg-panel shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-xs font-semibold uppercase text-slate-500">
                <th className="px-5 py-3 font-semibold">Besleme</th>
                <th className="px-3 py-3 font-semibold">Tür</th>
                <th className="px-3 py-3 font-semibold">Konular</th>
                <th className="hidden px-3 py-3 font-semibold md:table-cell">Kullanan autoblog</th>
                <th className="hidden px-3 py-3 font-semibold sm:table-cell">Son yenileme</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {feeds.map((f) => (
                <tr key={f.id} onClick={() => openDetail(f.id)} className="cursor-pointer hover:bg-muted/40">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${KIND[f.kind].color}`}>{KIND[f.kind].icon}</span>
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{f.name}</div>
                        <div className="truncate text-[11px] text-ink/45">{f.config.siteUrl || f.config.query || f.config.url || ""}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs text-ink/60">{KIND[f.kind].title.replace(" beslemesi", "")}</td>
                  <td className="px-3 py-3">
                    <div className="text-xs font-semibold tabular-nums">{f.total - f.done} yeni <span className="font-normal text-ink/45">/ {f.total}</span></div>
                    <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-accent" style={{ width: `${f.total ? (f.done / f.total) * 100 : 0}%` }} />
                    </div>
                  </td>
                  <td className="hidden px-3 py-3 text-xs md:table-cell">
                    {f.usedBy.length ? f.usedBy.map((c) => c.name).join(", ") : <span className="rounded-md bg-warn/10 px-2 py-0.5 font-semibold text-warn">Kullanılmıyor</span>}
                  </td>
                  <td className="hidden px-3 py-3 text-xs text-ink/55 sm:table-cell">
                    {f.lastError ? <span className="text-danger" title={f.lastError}>Hata</span> : ago(f.refreshedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {picker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" aria-label="Kapat" onClick={() => setPicker(false)} className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg rounded-2xl bg-panel p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="font-bold">Besleme oluştur</div>
                <div className="text-xs text-ink/50">Autoblog içerik için nereden bilgi alsın?</div>
              </div>
              <button type="button" onClick={() => setPicker(false)} className="flex h-8 w-8 items-center justify-center rounded-full text-ink/50 hover:bg-muted">✕</button>
            </div>
            <div className="space-y-2">
              {KINDS.map((k) => (
                <button key={k.id} type="button" onClick={() => startNew(k.id)} className="flex w-full items-start gap-3 rounded-xl border border-border p-3 text-left transition hover:border-accent hover:bg-accent/5">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-bold ${k.color}`}>{k.icon}</span>
                  <span>
                    <span className="block text-sm font-bold">{k.title}</span>
                    <span className="block text-xs text-ink/55">{k.body}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button type="button" aria-label="Kapat" onClick={() => setForm(null)} className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" />
          <form onSubmit={save} className="relative flex h-full w-full max-w-xl flex-col border-l border-border bg-panel shadow-2xl animate-[pop-in_0.25s_ease-out]">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="flex items-center gap-3">
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg font-bold ${KIND[form.kind].color}`}>{KIND[form.kind].icon}</span>
                <div>
                  <div className="font-bold">{form.id ? "Beslemeyi düzenle" : KIND[form.kind].title}</div>
                  <div className="text-xs text-ink/50">{KIND[form.kind].body}</div>
                </div>
              </div>
              <button type="button" onClick={() => setForm(null)} className="flex h-8 w-8 items-center justify-center rounded-full text-ink/50 hover:bg-muted">✕</button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              {form.kind === "keyword" && (
                <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 text-xs leading-5 text-ink/70">
                  Kelime beslemeleri haftada bir kendiliğinden yenilenir ve listeye yeni kelimeler eklenir. <strong>Ücretsizdir</strong>; AI kullanmaz.
                </div>
              )}
              <div className="space-y-1.5">
                <label className={label}>Besleme adı</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ör. Abiye anahtar kelimeleri" className={input} />
              </div>

              {form.kind === "keyword" && (
                <>
                  <div className="space-y-1.5">
                    <label className={label}>Site adresi</label>
                    <input value={form.siteUrl} onChange={(e) => setForm({ ...form, siteUrl: e.target.value })} placeholder="siteniz.com" className={input} />
                    <p className="text-[11px] text-ink/45">Bu site için Gap Analysis ya da GEO testin varsa oradaki sorular da eklenir.</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className={label}>Başlangıç kelimeleri</label>
                    <textarea value={form.seeds} onChange={(e) => setForm({ ...form, seeds: e.target.value })} rows={4} placeholder={"Her satıra bir kelime\nabiye elbise\nnişan elbisesi"} className={input} />
                    <p className="text-[11px] text-ink/45">Ne kadar çok başlangıç kelimesi, o kadar çok ilgili kelime.</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className={label}>Rakipler (en fazla 5)</label>
                    <textarea value={form.competitors} onChange={(e) => setForm({ ...form, competitors: e.target.value })} rows={3} placeholder={"rakip1.com\nrakip2.com"} className={input} />
                    <p className="text-[11px] text-ink/45">Rakiplerin site haritasındaki yazı başlıkları konu olarak eklenir.</p>
                  </div>
                </>
              )}

              {form.kind === "news" && (
                <div className="space-y-1.5">
                  <label className={label}>Haber konusu</label>
                  <input value={form.query} onChange={(e) => setForm({ ...form, query: e.target.value })} placeholder="ör. yapay zeka arama motoru" className={input} />
                </div>
              )}

              {(form.kind === "keyword" || form.kind === "news") && (
                <div className="space-y-1.5">
                  <label className={label}>Ülke ve dil</label>
                  <select value={form.market} onChange={(e) => setForm({ ...form, market: e.target.value })} className={input}>
                    {MARKETS.map((m) => (
                      <option key={m.country} value={m.country}>{m.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {(form.kind === "rss" || form.kind === "youtube") && (
                <>
                  <div className="space-y-1.5">
                    <label className={label}>{form.kind === "youtube" ? "Kanal adresi" : "Besleme ya da site adresi"}</label>
                    <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder={form.kind === "youtube" ? "youtube.com/@kanaladi" : "site.com/feed ya da sadece site.com"} className={input} />
                    {form.kind === "youtube" && <p className="text-[11px] text-ink/45">Videonun başlığı ve açıklaması kullanılır; açıklaması detaylı kanallar daha iyi sonuç verir.</p>}
                  </div>
                  <div className="space-y-1.5">
                    <label className={label}>Filtre (opsiyonel)</label>
                    <input value={form.filter} onChange={(e) => setForm({ ...form, filter: e.target.value })} placeholder="virgülle kelimeler — sadece bunları içerenler" className={input} />
                  </div>
                </>
              )}
              {formError && <p className="text-sm text-danger">{formError}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
              <button type="button" onClick={() => setForm(null)} className="rounded-xl px-4 py-2 text-sm font-semibold text-ink/60 hover:bg-muted">Vazgeç</button>
              <button type="submit" disabled={saving} className="rounded-xl bg-accent px-5 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
                {saving ? "Besleme okunuyor…" : form.id ? "Kaydet ve yenile" : "Oluştur"}
              </button>
            </div>
          </form>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button type="button" aria-label="Kapat" onClick={() => setDetail(null)} className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" />
          <div className="relative flex h-full w-full max-w-2xl flex-col border-l border-border bg-panel shadow-2xl animate-[pop-in_0.25s_ease-out]">
            <div className="border-b border-border px-6 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl font-bold ${KIND[detail.kind].color}`}>{KIND[detail.kind].icon}</span>
                  <div>
                    <div className="font-bold">{detail.name}</div>
                    <div className="text-xs text-ink/50">{KIND[detail.kind].title} · son yenileme {ago(detail.refreshedAt)}</div>
                  </div>
                </div>
                <button type="button" onClick={() => setDetail(null)} className="flex h-8 w-8 items-center justify-center rounded-full text-ink/50 hover:bg-muted">✕</button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <button onClick={() => refreshNow(detail.id)} disabled={!!busy} className="rounded-lg bg-accent px-3 py-1.5 font-bold text-white disabled:opacity-50">{busy ? "Yenileniyor…" : "Şimdi yenile"}</button>
                <button onClick={() => startEdit(detail)} className="rounded-lg border border-border px-3 py-1.5 font-semibold hover:bg-muted">Düzenle</button>
                <Link href={`/campaigns?feed=${detail.id}`} className="rounded-lg border border-border px-3 py-1.5 font-semibold hover:bg-muted">Bu beslemeyle autoblog kur</Link>
                <button onClick={() => remove(detail)} className="ml-auto px-1 text-danger/70 hover:text-danger">Sil</button>
              </div>
              {detail.lastError && <p className="mt-3 rounded-lg bg-danger/5 px-3 py-2 text-xs text-danger">{detail.lastError}</p>}
              {detail.kind === "keyword" && (
                <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-[11px] text-ink/55">Haftada bir kendiliğinden yenilenir, yeni kelimeler eklenir. Arama hacmi ve zorluk için ücretli veri kaynağı gerekir; şimdilik kaynağı gösteriyoruz.</p>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {detail.items.length === 0 ? (
                <p className="p-6 text-sm text-ink/50">Henüz öğe yok.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-panel">
                    <tr className="border-b border-border bg-muted text-left text-xs font-semibold uppercase text-slate-500">
                      <th className="px-6 py-2 font-semibold">{detail.kind === "keyword" ? "Anahtar kelime" : "Başlık"}</th>
                      <th className="px-3 py-2 font-semibold">Kaynak</th>
                      <th className="px-3 py-2 font-semibold">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {detail.items.map((it) => (
                      <tr key={it.key} className={it.used ? "opacity-50" : ""}>
                        <td className="px-6 py-2">
                          {it.link ? (
                            <a href={it.link} target="_blank" rel="noreferrer" className="font-medium hover:text-accent">{it.title}</a>
                          ) : (
                            <span className="font-medium">{it.title}</span>
                          )}
                          {it.publishedAt && <div className="text-[10px] text-ink/40">{new Date(it.publishedAt).toLocaleDateString("tr-TR")}</div>}
                        </td>
                        <td className="px-3 py-2 text-[11px] text-ink/55">{it.source ?? "—"}</td>
                        <td className="px-3 py-2 text-[11px]">{it.used ? <span className="text-seo">✓ yazıldı</span> : <span className="text-ink/45">sırada</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      <PageGuide id="feeds" />
    </div>
  );
}
