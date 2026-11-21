"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import KnowledgeBase from "@/components/KnowledgeBase";
import { citabilityOfMarkdown } from "@/lib/citability";
import WriteWizard from "@/components/tool/WriteWizard";
import { Drawer, EmptyBlock, TableSkeleton, PageHeader, BTN1, BTN2 } from "@/components/ui";
import { publishLabel } from "@/lib/publish-state";

/** GEO brief'inden gelen hazır plan (?plan=JSON). Adres çubuğundan gelir: şekli ve uzunlukları doğrulanır. */
export type WriterPlan = { outline: { h2: string; h3: string[]; note: string }[]; questions: string[] };
function parsePlan(raw: string | null): WriterPlan | undefined {
  if (!raw) return undefined;
  try {
    const p = JSON.parse(raw);
    const outline = (Array.isArray(p?.outline) ? p.outline : [])
      .map((s: any) => ({ h2: String(s?.h2 ?? "").slice(0, 140), h3: (Array.isArray(s?.h3) ? s.h3 : []).map((x: unknown) => String(x).slice(0, 140)).slice(0, 5), note: String(s?.note ?? "").slice(0, 400) }))
      .filter((s: { h2: string }) => s.h2.trim())
      .slice(0, 8);
    const questions = (Array.isArray(p?.questions) ? p.questions : []).map((x: unknown) => String(x).slice(0, 200)).filter(Boolean).slice(0, 6);
    return outline.length ? { outline, questions } : undefined;
  } catch {
    return undefined;
  }
}

interface DraftItem {
  id: number;
  sourceUrl: string;
  article: { title: string; metaDescription: string; bodyMarkdown: string };
  status?: string;
  publishedPostUrl?: string | null;
  publishState?: string | null;
  scheduledAt?: string | null;
  publishError?: string | null;
  createdAt: string;
}

const tone = (n: number) => (n >= 65 ? "bg-seo/10 text-seo-ink" : n >= 45 ? "bg-warn/10 text-warn-ink" : "bg-danger/10 text-danger-ink");
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
  const [filter, setFilter] = useState<"all" | "weak" | "site" | "published">("all");
  const [limit, setLimit] = useState(12);
  const [newOpen, setNewOpen] = useState(false);
  const [preset, setPreset] = useState<{ keyword: string; title?: string; note?: string; plan?: WriterPlan } | null>(null);
  // ?write=1&kw=…&title=…&note=… (Link planı, GEO aksiyonları vb.) → sihirbaz hazır açılır
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    if (qs.get("write") !== "1" || !qs.get("kw")) return;
    setPreset({ keyword: qs.get("kw")!.slice(0, 100), title: qs.get("title")?.slice(0, 200) || undefined, note: qs.get("note")?.slice(0, 700) || undefined, plan: parsePlan(qs.get("plan")) });
    setNewOpen(true);
    window.history.replaceState(null, "", "/editor");
  }, []);
  const [impOpen, setImpOpen] = useState(false);

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
    const pub = rows.filter((r) => publishLabel(r).key === "published").length;
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
    .filter((r) => (filter === "weak" ? r.geo !== null && r.geo < 45 : filter === "published" ? publishLabel(r).key === "published" : filter === "site" ? publishLabel(r).key !== "draft" : true))
    .filter((r) => !q || (r.article.title + " " + r.sourceUrl).toLocaleLowerCase("tr").includes(q.toLocaleLowerCase("tr")));

  const chip = (on: boolean) =>
    `inline-flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-[13px] font-medium whitespace-nowrap ${on ? "bg-accent/5 text-ink shadow-[inset_0_0_0_1px_#BDB4FF]" : "bg-panel text-sub shadow-[inset_0_0_0_1px_#E4E5E8] hover:text-ink"}`;
  const card = "rounded-2xl border border-border bg-panel shadow-[0_1px_2px_rgba(13,18,28,0.05)]";
  const empty = drafts !== null && rows.length === 0;

  // Ne yapmalı? — taslaklardan somut işler
  const weak = rows.filter((r) => r.geo !== null && r.geo < 45).sort((a, b) => Number(b.words >= 150) - Number(a.words >= 150) || (a.geo ?? 0) - (b.geo ?? 0));
  const ready = rows.filter((r) => r.geo !== null && r.geo >= 65 && publishLabel(r).key === "draft");
  const failed = rows.filter((r) => publishLabel(r).key === "error");
  const actions: { kind: string; color: string; title: string; body: string; cta: React.ReactNode }[] = [];
  if (failed.length)
    actions.push({
      kind: "Hata",
      color: "text-danger-ink",
      title: `${failed.length} yazı yayınlanamadı`,
      body: `"${failed[0].article.title || "Başlıksız"}" siteye gönderilirken hata aldı. Aç, hatayı gör ve tekrar dene.`,
      cta: <button type="button" onClick={() => onOpen(failed[0].id)} className={BTN2}>Yazıyı aç</button>,
    });
  if (ready.length)
    actions.push({
      kind: "Hazır",
      color: "text-seo-ink",
      title: `${ready.length} yazı yayına hazır`,
      body: `GEO puanı 65 ve üstü ama henüz sitede değil. En iyisi: "${ready[0].article.title || "Başlıksız"}".`,
      cta: <button type="button" onClick={() => onOpen(ready[0].id)} className={BTN2}>Aç ve yayınla</button>,
    });
  if (weak.length)
    actions.push({
      kind: "Zayıf",
      color: "text-warn-ink",
      title: `${weak.length} yazı AI'da alıntılanmaya hazır değil`,
      body: `"${weak[0].article.title || "Başlıksız"}" ${weak[0].geo} puanda. Editörde kısa cevap, soru başlıklar ve somut sayı ekle; puan canlı yükselir.`,
      cta: <button type="button" onClick={() => setFilter("weak")} className={BTN2}>Zayıfları göster</button>,
    });
  if (actions.length < 3 && kpi.month === 0)
    actions.push({
      kind: "Fırsat",
      color: "text-accent",
      title: "Bu ay hiç yazı çıkmadı",
      body: "Anahtar Kelime Planlayıcı'dan sıralanabileceğin bir konu seç; yazı tek tıkla gelsin.",
      cta: <Link href="/keywords" className={BTN2}>Konu bul</Link>,
    });
  if (actions.length < 3)
    actions.push({
      kind: "Fırsat",
      color: "text-accent",
      title: "Rakiplerin AI'da kazandığı sorular",
      body: "GEO Görünürlük'te rakibin önerildiği soruları cevaplayan bir yazı, en hızlı görünürlük kazancıdır.",
      cta: <Link href="/geo" className={BTN2}>Soruları gör</Link>,
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title={empty ? "İlk yazını oluştur" : "Yazıların AI'da alıntılanmaya hazır mı?"}
        description={
          empty
            ? "Anahtar kelimeyi yaz, plan seç; SEO ve GEO'ya uygun makale yazılsın. Konu ve plan ücretsiz, yazı 1 kota kullanır."
            : `${kpi.n} yazı · ortalama GEO ${kpi.avg ?? "—"} · ${kpi.pub} yayında · son 30 günde ${kpi.month} yeni yazı`
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setKbOpen(true)} className={BTN2}>
              Bilgi bankası
            </button>
            <button type="button" onClick={() => setImpOpen(true)} className={BTN2}>
              Sitedeki yazıyı aç
            </button>
            {!empty && (
              <button type="button" onClick={() => setNewOpen(true)} className={BTN1}>
                + Yeni yazı
              </button>
            )}
          </div>
        }
      />

      {msg && <div className={`rounded-xl px-4 py-2.5 text-sm ${msg.bad ? "bg-danger/10 text-danger-ink" : "bg-seo/10 text-seo-ink"}`}>{msg.t}</div>}

      {empty ? (
        <div className={`${card} p-5`}>
          <WriteWizard onDone={onOpen} />
          <div className="mt-4 border-t border-border pt-3 text-xs text-sub">
            Kendin yazmak istersen{" "}
            <button type="button" onClick={onBlank} className="font-medium text-accent hover:underline">
              boş bir GEO iskeletiyle başla
            </button>
            .
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {([
              ["Toplam yazı", String(kpi.n), "", "taslak ve yayındakiler", ""],
              ["Ortalama GEO puanı", kpi.avg !== null ? String(kpi.avg) : "—", "/100", "AI'da alıntılanabilirlik", kpi.avg === null ? "" : kpi.avg >= 65 ? "text-seo-ink" : kpi.avg >= 45 ? "text-warn-ink" : "text-danger-ink"],
              ["Yayında", String(kpi.pub), "", kpi.n ? `yazıların %${Math.round((kpi.pub / kpi.n) * 100)}'i` : "", ""],
              ["Yayına hazır", String(ready.length), "", "GEO 65+ taslak", ""],
              ["Son 30 gün", String(kpi.month), "", `${kpi.words.toLocaleString("tr-TR")} kelime toplam`, ""],
            ] as const).map(([l, v, suf, hint, col]) => (
              <div key={l} className={`${card} px-4 py-4`}>
                <div className="text-xs font-medium text-sub">{l}</div>
                <div className="mt-1.5 flex items-baseline gap-1">
                  <span className={`text-[26px] font-semibold leading-8 tabular-nums ${col}`}>{drafts === null ? "…" : v}</span>
                  {suf && <span className="text-sm text-sub">{suf}</span>}
                </div>
                <div className="mt-1 h-4 text-xs text-sub">{hint}</div>
              </div>
            ))}
          </div>

          {drafts !== null && actions.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Ne yapmalı?</h3>
              <div className={`grid gap-3 ${["", "md:grid-cols-1", "md:grid-cols-2", "md:grid-cols-3"][Math.min(actions.length, 3)]}`}>
                {actions.slice(0, 3).map((a) => (
                  <div key={a.title} className={`${card} flex flex-col p-4`}>
                    <div className={`text-xs font-semibold uppercase tracking-wide ${a.color}`}>{a.kind}</div>
                    <h4 className="mt-1.5 text-sm font-semibold leading-5">{a.title}</h4>
                    <p className="mt-1 text-[13px] text-sub">{a.body}</p>
                    <div className="mt-auto flex justify-end pt-3">{a.cta}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-3 lg:grid-cols-[1.7fr_1fr]">
            <div className={`${card} overflow-hidden`}>
              <div className="flex flex-wrap items-center gap-2 px-5 py-3">
                {([
                  ["all", "Tümü"],
                  ["weak", "Zayıf GEO"],
                  ["site", "Sitede"],
                  ["published", "Yayında"],
                ] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setFilter(k)} className={chip(filter === k)}>
                    {l}
                  </button>
                ))}
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Yazılarda ara…" className="ml-auto h-8 w-48 rounded-[9px] border border-border bg-panel px-3 text-[13px] outline-none focus:border-[#BDB4FF]" />
              </div>
              {drafts === null ? (
                <TableSkeleton bare rows={4} cols={5} />
              ) : shown.length === 0 ? (
                <div className="border-t border-border">
                  <EmptyBlock compact title="Bu filtrede yazı yok" description="Filtreyi ya da aramayı değiştir." />
                </div>
              ) : (
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-y border-border bg-[#fafafa] text-left text-xs text-sub">
                      <th className="py-2 pl-5 font-medium">Başlık</th>
                      <th className="py-2 pr-3 font-medium">GEO</th>
                      <th className="hidden py-2 pr-3 text-right font-medium md:table-cell">Kelime</th>
                      <th className="hidden py-2 pr-3 font-medium sm:table-cell">Durum</th>
                      <th className="py-2 pr-5 text-right font-medium">Tarih</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {shown.slice(0, limit).map((d) => {
                      const st = publishLabel(d);
                      return (
                        <tr key={d.id} onClick={() => onOpen(d.id)} className="cursor-pointer hover:bg-[#fafafa]">
                          <td className="max-w-[26rem] py-2.5 pl-5">
                            <div className="truncate font-medium">{d.article.title || "Başlıksız"}</div>
                            <div className="truncate text-xs text-sub">{source(d.sourceUrl)}</div>
                          </td>
                          <td className="py-2.5 pr-3">
                            {d.geo === null ? <span className="text-xs text-sub">—</span> : <span className={`rounded-md px-2 py-0.5 text-xs font-medium tabular-nums ${tone(d.geo)}`}>{d.geo}</span>}
                          </td>
                          <td className="hidden py-2.5 pr-3 text-right text-xs tabular-nums text-sub md:table-cell">{d.words.toLocaleString("tr-TR")}</td>
                          <td className="hidden py-2.5 pr-3 sm:table-cell">
                            <span title={st.hint} className={`whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                            {d.publishedPostUrl && st.key !== "draft" && st.key !== "error" && (
                              <a href={d.publishedPostUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="ml-1.5 text-xs text-accent hover:underline">
                                aç ↗
                              </a>
                            )}
                          </td>
                          <td className="whitespace-nowrap py-2.5 pr-5 text-right text-xs text-sub">{new Date(d.createdAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {shown.length > limit && (
                <button type="button" onClick={() => setLimit((l) => l + 24)} className="w-full border-t border-border py-2.5 text-xs font-medium text-accent hover:bg-[#fafafa]">
                  {shown.length - limit} yazı daha göster
                </button>
              )}
            </div>

            <div className="space-y-3">
              <div className={card}>
                <div className="px-5 pt-4">
                  <h3 className="text-sm font-semibold">GEO puan dağılımı</h3>
                  <p className="text-xs text-sub">65 ve üstü AI motorlarının alıntılamaya yatkın olduğu seviye</p>
                </div>
                <ul className="space-y-2.5 px-5 pb-4 pt-3">
                  {[...dist].reverse().map((b) => {
                    const max = Math.max(1, ...dist.map((x) => x.n));
                    return (
                      <li key={b.k} className="flex items-center gap-3 text-[13px]">
                        <span className="w-12 tabular-nums text-sub">{b.k}</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <span className="block h-full rounded-full" style={{ width: `${(b.n / max) * 100}%`, background: b.c }} />
                        </span>
                        <span className="w-6 text-right text-xs tabular-nums text-sub">{b.n}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className={card}>
                <div className="px-5 pt-4">
                  <h3 className="text-sm font-semibold">Haftalık üretim</h3>
                  <p className="text-xs text-sub">Son 8 haftada yazılan yazılar</p>
                </div>
                <div className="h-36 px-2 pb-2 pt-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weekly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f2" vertical={false} />
                      <XAxis dataKey="w" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={20} />
                      <Tooltip cursor={{ fill: "rgba(79,0,255,0.04)" }} contentStyle={{ background: "#fff", border: "1px solid #e9eaeb", borderRadius: 12, fontSize: 12 }} />
                      <Bar dataKey="n" name="Yazı" fill="#4f00ff" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <Drawer isOpen={newOpen} onClose={() => setNewOpen(false)} eyebrow="AI SEO Editör" title="Yeni yazı" subtitle="Anahtar kelimeyi yaz, plan seç; SEO ve GEO'ya uygun makale yazılsın. Konu ve plan ücretsiz, yazı 1 kota kullanır." size="2xl">
        {newOpen && <WriteWizard preset={preset} onDone={(id) => { setNewOpen(false); setPreset(null); onOpen(id); }} />}
        <div className="mt-4 border-t border-border pt-3 text-xs text-sub">
          Kendin yazmak istersen{" "}
          <button type="button" onClick={() => { setNewOpen(false); onBlank(); }} className="font-medium text-accent hover:underline">
            boş bir GEO iskeletiyle başla
          </button>
          .
        </div>
      </Drawer>

      <Drawer isOpen={impOpen} onClose={() => setImpOpen(false)} eyebrow="AI SEO Editör" title="Sitedeki yazıyı aç" subtitle="Yazı editöre gelir; GEO puanını gör, zayıf paragrafları tek tıkla yeniden yazdır." size="md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onImport();
          }}
          className="space-y-3"
        >
          <input value={importUrl} onChange={(e) => setImportUrl(e.target.value)} placeholder="https://siteniz.com/blog/yazi" className="h-9 w-full rounded-[10px] border border-border bg-panel px-3 text-sm outline-none focus:border-[#BDB4FF]" />
          <button disabled={loading || !importUrl.trim()} className={BTN1}>
            {loading ? "Açılıyor…" : "Sayfayı aç →"}
          </button>
          {msg?.bad && <p className="rounded-lg bg-danger/5 px-3 py-2 text-xs text-danger-ink">{msg.t}</p>}
        </form>
      </Drawer>

      <Drawer isOpen={kbOpen} onClose={() => setKbOpen(false)} eyebrow="Ayarlar" title="Marka bilgi bankası" subtitle="Yazılarda kullanılacak marka bilgileri, ürünler ve ton." size="lg">
        {kbOpen && <KnowledgeBase />}
      </Drawer>
    </div>
  );
}
