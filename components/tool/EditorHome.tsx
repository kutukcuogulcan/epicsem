"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ToolPageHeader from "@/components/ToolPageHeader";
import KnowledgeBase from "@/components/KnowledgeBase";
import { citabilityOfMarkdown } from "@/lib/citability";
import PageGuide from "@/components/PageGuide";

interface DraftItem {
  id: number;
  sourceUrl: string;
  article: { title: string; metaDescription: string; bodyMarkdown: string };
  status?: string;
  publishedPostUrl?: string | null;
  createdAt: string;
}

const tone = (n: number) => (n >= 65 ? "bg-seo/10 text-seo" : n >= 45 ? "bg-warn/10 text-warn" : "bg-danger/10 text-danger");
const STATUS: Record<string, [string, string]> = {
  draft: ["Taslak", "bg-muted text-ink/55"],
  approved: ["Onaylı", "bg-accent/10 text-accent"],
  "published-to-wp": ["Yayında", "bg-seo/10 text-seo"],
  published: ["Yayında", "bg-seo/10 text-seo"],
};
const source = (s: string) => (s.startsWith("keyword:") ? `Anahtar kelime · ${s.slice(8)}` : s === "editor" ? "Editörde yazıldı" : s.replace(/^https?:\/\/(www\.)?/, ""));

/**
 * AI SEO Editör giriş ekranı — diğer araç sayfalarıyla aynı düzen: üstte arama çubuğu,
 * KPI kartları, grafikler ve taslak tablosu. Bilgi bankası yan çekmecede.
 */
export default function EditorHome({
  msg,
  drafts,
  importUrl,
  setImportUrl,
  loading,
  onImport,
  onBlank,
  onOpen,
}: {
  msg: { t: string; bad?: boolean } | null;
  drafts: DraftItem[] | null;
  importUrl: string;
  setImportUrl: (v: string) => void;
  loading: boolean;
  onImport: () => void;
  onBlank: () => void;
  onOpen: (id: number) => void;
}) {
  const [kbOpen, setKbOpen] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "weak" | "published">("all");
  const [limit, setLimit] = useState(12);
  const [entry, setEntry] = useState<"write" | "open">("write");
  const [topic, setTopic] = useState("");
  const [wSite, setWSite] = useState("");
  const [wFormat, setWFormat] = useState<"article" | "listicle">("article");
  const [wLang, setWLang] = useState("tr");
  const [writing, setWriting] = useState(false);
  const [wErr, setWErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/assistant")
      .then((r) => (r.ok ? r.json() : { sites: [] }))
      .then((d) => d.sites?.[0] && setWSite((v) => v || d.sites[0]))
      .catch(() => {});
  }, []);

  async function write() {
    if (topic.trim().length < 3) return;
    setWriting(true);
    setWErr(null);
    try {
      const r = await fetch("/api/editor/write", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, site: wSite, format: wFormat, language: wLang }) });
      if (r.status === 401) return void (window.location.href = "/login?next=/editor");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Yazı yazılamadı");
      onOpen(d.id);
    } catch (e) {
      setWErr(e instanceof Error ? e.message : "Yazı yazılamadı");
    } finally {
      setWriting(false);
    }
  }

  const rows = useMemo(
    () =>
      (drafts ?? []).map((d) => {
        const md = d.article.bodyMarkdown ?? "";
        const words = md.replace(/[#*_>`|-]/g, " ").split(/\s+/).filter(Boolean).length;
        return { ...d, words, geo: words >= 20 ? citabilityOfMarkdown(md).score : null };
      }),
    [drafts]
  );

  const kpi = useMemo(() => {
    const n = rows.length;
    const scored = rows.filter((r) => r.geo !== null);
    const avg = scored.length ? Math.round(scored.reduce((a, r) => a + (r.geo ?? 0), 0) / scored.length) : null;
    const pub = rows.filter((r) => r.status?.startsWith("published")).length;
    const month = rows.filter((r) => Date.now() - new Date(r.createdAt).getTime() < 30 * 864e5).length;
    const words = rows.reduce((a, r) => a + r.words, 0);
    return { n, avg, pub, month, words };
  }, [rows]);

  // Son 8 haftada yazılan taslaklar
  const weekly = useMemo(() => {
    const out: { w: string; n: number }[] = [];
    const now = Date.now();
    for (let i = 7; i >= 0; i--) {
      const end = now - i * 7 * 864e5;
      const start = end - 7 * 864e5;
      const d = new Date(end);
      out.push({ w: d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" }), n: rows.filter((r) => { const t = new Date(r.createdAt).getTime(); return t > start && t <= end; }).length });
    }
    return out;
  }, [rows]);

  // GEO puan dağılımı
  const dist = useMemo(() => {
    const b = [
      { k: "0–44", c: "#ef4444", n: 0 },
      { k: "45–64", c: "#f59e0b", n: 0 },
      { k: "65–79", c: "#22c55e", n: 0 },
      { k: "80+", c: "#16a34a", n: 0 },
    ];
    for (const r of rows) if (r.geo !== null) b[r.geo >= 80 ? 3 : r.geo >= 65 ? 2 : r.geo >= 45 ? 1 : 0].n++;
    return b;
  }, [rows]);

  const shown = rows
    .filter((r) => (filter === "weak" ? r.geo !== null && r.geo < 45 : filter === "published" ? r.status?.startsWith("published") : true))
    .filter((r) => !q || (r.article.title + " " + r.sourceUrl).toLocaleLowerCase("tr").includes(q.toLocaleLowerCase("tr")));

  return (
    <div className="space-y-6">
      <ToolPageHeader
        breadcrumbLabel="AI SEO Editör"
        title="AI SEO Editör"
        body="Konuyu yaz, yapay zekâ SEO ve GEO'ya uygun tam makaleyi yazsın; ya da sitendeki bir yazıyı aç. Puanı canlı gör, paragrafları tek tıkla yeniden yazdır, iç link ve SSS ekle."
      >
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onBlank} className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white hover:opacity-90">
            + Yeni yazı
          </button>
          <button type="button" onClick={() => setKbOpen(true)} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">
            Marka bilgi bankası
          </button>
          <Link href="/keywords" className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">
            Konu bul
          </Link>
        </div>
      </ToolPageHeader>

      {msg && <div className={`rounded-xl px-4 py-2.5 text-sm ${msg.bad ? "bg-danger/10 text-danger" : "bg-seo/10 text-seo"}`}>{msg.t}</div>}

      <div className="flex w-fit rounded-xl border border-border bg-panel p-1 text-sm font-semibold">
        {([
          ["write", "Konudan yaz"],
          ["open", "Sitedeki yazıyı aç"],
        ] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setEntry(k)} className={`rounded-lg px-4 py-1.5 ${entry === k ? "bg-accent text-white" : "text-ink/55 hover:text-ink"}`}>
            {l}
          </button>
        ))}
      </div>

      {entry === "write" ? (
        <div className="space-y-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              write();
            }}
            className="flex items-center gap-2 rounded-2xl border border-border bg-panel p-2 pl-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-ink/35" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.5 4.5l3 3L8 15H5v-3l7.5-7.5zM11 6l3 3" />
            </svg>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} disabled={writing} placeholder="Konu ya da anahtar kelime — ör. abiye elbise nasıl seçilir" className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" />
            <button disabled={writing || topic.trim().length < 3} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
              {writing ? "Yazılıyor…" : "Yazıyı yaz →"}
            </button>
          </form>
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink/55">
            <input value={wSite} onChange={(e) => setWSite(e.target.value)} disabled={writing} placeholder="markan.com" className="w-40 rounded-lg border border-border bg-panel px-2.5 py-1.5 outline-none focus:border-accent" />
            <select value={wFormat} onChange={(e) => setWFormat(e.target.value as "article" | "listicle")} disabled={writing} className="rounded-lg border border-border bg-panel px-2 py-1.5 outline-none">
              <option value="article">Makale</option>
              <option value="listicle">Liste yazısı</option>
            </select>
            <select value={wLang} onChange={(e) => setWLang(e.target.value)} disabled={writing} className="rounded-lg border border-border bg-panel px-2 py-1.5 outline-none">
              <option value="tr">Türkçe</option>
              <option value="en">English</option>
              <option value="de">Deutsch</option>
            </select>
            <span>
              {writing
                ? "Makale yazılıyor, 30–60 saniye sürebilir. Bitince editörde açılacak."
                : "Marka bilgi bankasındaki bilgiler kullanılır; bilinmeyen rakam uydurulmaz, [NEEDS: …] olarak işaretlenir. 1 içerik kotası."}
            </span>
          </div>
          {wErr && <div className="rounded-xl bg-danger/10 px-4 py-2.5 text-sm text-danger">{wErr}</div>}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onImport();
          }}
          className="flex items-center gap-2 rounded-2xl border border-border bg-panel p-2 pl-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-ink/35" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M8.5 11.5l3-3M7 9.5l-1.5 1.5a2.5 2.5 0 0 0 3.5 3.5L10.5 13M13 10.5l1.5-1.5a2.5 2.5 0 0 0-3.5-3.5L9.5 7" />
          </svg>
          <input value={importUrl} onChange={(e) => setImportUrl(e.target.value)} placeholder="Sitedeki bir yazının adresi — https://siteniz.com/blog/yazi" className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" />
          <button disabled={loading || !importUrl.trim()} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
            {loading ? "Açılıyor…" : "Sayfayı aç →"}
          </button>
        </form>
      )}

      {/* KPI kartları */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Toplam yazı", String(kpi.n), "taslak ve yayındakiler"],
          ["Ort. GEO puanı", kpi.avg !== null ? String(kpi.avg) : "—", "AI alıntılanabilirlik"],
          ["Yayında", String(kpi.pub), kpi.n ? `%${Math.round((kpi.pub / kpi.n) * 100)} yayınlandı` : ""],
          ["Son 30 gün", String(kpi.month), "yeni yazı"],
          ["Toplam kelime", kpi.words.toLocaleString("tr-TR"), ""],
        ].map(([l, v, sub], i) => (
          <div key={l} className="rounded-2xl border border-border bg-panel p-4">
            <div className="text-[11px] text-ink/50">{l}</div>
            <div className={`text-2xl font-extrabold tabular-nums ${i === 1 && kpi.avg !== null ? (kpi.avg >= 65 ? "text-seo" : kpi.avg >= 45 ? "text-warn" : "text-danger") : ""}`}>{drafts === null ? "…" : v}</div>
            {sub && <div className="text-[11px] text-ink/40">{sub}</div>}
          </div>
        ))}
      </div>

      {/* Grafikler */}
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="rounded-2xl border border-border bg-panel">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="text-sm font-bold">Haftalık üretim</div>
            <span className="text-xs text-ink/40">son 8 hafta</span>
          </div>
          <div className="h-48 px-2 pt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="w" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={24} />
                <Tooltip cursor={{ fill: "rgba(93,22,255,0.04)" }} contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="n" name="Yazı" fill="#5d16ff" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-panel">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="text-sm font-bold">GEO puan dağılımı</div>
            <span className="text-xs text-ink/40">yazı sayısı</span>
          </div>
          <div className="h-48 px-2 pt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dist}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="k" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={24} />
                <Tooltip cursor={{ fill: "rgba(93,22,255,0.04)" }} contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="n" name="Yazı" radius={[6, 6, 0, 0]}>
                  {dist.map((d) => (
                    <Cell key={d.k} fill={d.c} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Hızlı başlangıç */}
      <div className="grid gap-3 md:grid-cols-3">
        {[
          { t: "Boş yazı", d: "Kendin yazmak istersen GEO'ya uygun iskelet: kısa cevap, soru başlıklar, SSS.", a: onBlank, href: null },
          { t: "Anahtar kelimeden", d: "Anahtar Kelime Bulucu'da konu seç, 'Yazı yaz' ile hazır iskelet gelsin.", a: null, href: "/keywords" },
          { t: "Rakip boşluğundan", d: "Gap Analysis'te AI'da kaybettiğin sorulardan içerik özeti çıkar.", a: null, href: "/gap" },
        ].map((c) =>
          c.href ? (
            <Link key={c.t} href={c.href} className="rounded-2xl border border-border bg-panel p-4 transition hover:border-accent/40">
              <div className="text-sm font-bold">{c.t} →</div>
              <p className="mt-1 text-xs leading-5 text-ink/55">{c.d}</p>
            </Link>
          ) : (
            <button key={c.t} type="button" onClick={c.a!} className="rounded-2xl border border-border bg-panel p-4 text-left transition hover:border-accent/40">
              <div className="text-sm font-bold">{c.t} →</div>
              <p className="mt-1 text-xs leading-5 text-ink/55">{c.d}</p>
            </button>
          )
        )}
      </div>

      {/* Taslak tablosu */}
      <div className="overflow-hidden rounded-2xl border border-border bg-panel">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
          <div className="mr-auto text-sm font-bold">Yazılarım ({shown.length})</div>
          {([
            ["all", "Tümü"],
            ["weak", "Zayıf GEO"],
            ["published", "Yayında"],
          ] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === k ? "bg-ink text-white" : "bg-muted text-ink/60"}`}>
              {l}
            </button>
          ))}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Yazılarda ara…" className="w-44 rounded-lg border border-border bg-muted px-2.5 py-1.5 text-xs outline-none focus:border-accent" />
        </div>
        {drafts === null ? (
          <div className="h-24 animate-pulse" />
        ) : shown.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div className="text-sm font-bold">{rows.length ? "Bu filtrede yazı yok" : "Henüz yazı yok"}</div>
            <p className="mt-1 text-xs text-ink/50">Yukarıdan bir sayfa aç, boş bir yazı başlat ya da Article Writer ile oluştur.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-ink/45">
                <th className="px-5 py-2 font-semibold">Başlık</th>
                <th className="py-2 pr-3 font-semibold">GEO</th>
                <th className="hidden py-2 pr-3 font-semibold md:table-cell">Kelime</th>
                <th className="hidden py-2 pr-3 font-semibold sm:table-cell">Durum</th>
                <th className="py-2 pr-5 text-right font-semibold">Tarih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.slice(0, limit).map((d) => {
                const st = STATUS[d.status ?? "draft"] ?? STATUS.draft;
                return (
                  <tr key={d.id} onClick={() => onOpen(d.id)} className="cursor-pointer hover:bg-muted/40">
                    <td className="max-w-[28rem] px-5 py-2.5">
                      <div className="truncate font-medium">{d.article.title || "Başlıksız"}</div>
                      <div className="truncate text-[11px] text-ink/45">{source(d.sourceUrl)}</div>
                    </td>
                    <td className="py-2.5 pr-3">
                      {d.geo === null ? <span className="text-xs text-ink/30">—</span> : <span className={`rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${tone(d.geo)}`}>{d.geo}</span>}
                    </td>
                    <td className="hidden py-2.5 pr-3 text-xs tabular-nums text-ink/60 md:table-cell">{d.words.toLocaleString("tr-TR")}</td>
                    <td className="hidden py-2.5 pr-3 sm:table-cell">
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${st[1]}`}>{st[0]}</span>
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-5 text-right text-xs text-ink/45">{new Date(d.createdAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {shown.length > limit && (
          <button type="button" onClick={() => setLimit((l) => l + 24)} className="w-full border-t border-border py-2.5 text-xs font-semibold text-accent hover:bg-muted/40">
            {shown.length - limit} yazı daha göster
          </button>
        )}
      </div>

      {kbOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button type="button" aria-label="Kapat" onClick={() => setKbOpen(false)} className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" />
          <div className="relative flex h-full w-full max-w-lg flex-col bg-panel shadow-2xl animate-[pop-in_0.25s_ease-out]">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Ayarlar</div>
                <div className="font-bold">Marka bilgi bankası</div>
              </div>
              <button type="button" onClick={() => setKbOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full text-ink/50 hover:bg-muted">
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <KnowledgeBase />
            </div>
          </div>
        </div>
      )}

      <PageGuide id="editor" />
    </div>
  );
}
