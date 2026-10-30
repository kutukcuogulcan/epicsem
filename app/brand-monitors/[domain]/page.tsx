"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ENGINE_META, EngineDot, ScoreRing, SentimentBar, netSentiment, sentimentLabel } from "@/components/tool/MonitorBits";

interface Resp {
  engine: string;
  model: string;
  mentioned: boolean;
  position: number | null;
  sentiment: number | null;
  text: string;
  mentions: string[];
  citations: { url: string; domain: string; isOwnDomain: boolean }[];
}
interface Prompt {
  text: string;
  topic: string;
  branded: boolean;
  visibility: number;
  sentiment: number | null;
  mentions: string[];
  responses: Resp[];
}
interface Detail {
  brand: { name: string; domain: string };
  lastRunAt: string;
  demoMode: boolean;
  visibility: number;
  sentiment: number | null;
  summaries: { brand: string; domain: string; visibility: number; shareOfVoice: number; avgPosition: number | null; avgSentiment: number | null; citationCount: number }[];
  sources: { domain: string; count: number; type: string; citationShare: number; chatsCited: number }[];
  prompts: Prompt[];
  engines: { engine: string; visibility: number; sentiment: number | null; total: number }[];
  timeline: { at: string; visibility: number; sentiment: number | null }[];
  legacy?: boolean;
}

type Tab = "prompts" | "visibility" | "sentiment" | "rivals" | "sources";
const fmt = (iso: string) => new Date(iso).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const pct = (x: number) => `${Math.round(x * 100)}%`;
const SOURCE_TYPE: Record<string, string> = { You: "Sen", Competitor: "Rakip", Corporate: "Kurumsal", Editorial: "Editoryal", Government: "Kamu", Reference: "Referans", UGC: "Forum/UGC", Other: "Diğer" };

export default function MonitorDetailPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = use(params);
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("prompts");
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | "branded" | "discovery">("all");
  const [open, setOpen] = useState<Prompt | null>(null);
  const [openResp, setOpenResp] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/brand-monitors/${domain}`)
      .then(async (r) => {
        if (r.status === 401) return void (window.location.href = `/login?next=/brand-monitors/${domain}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Monitör alınamadı");
        setD(j);
      })
      .catch((e) => setErr(e.message));
  }, [domain]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const prompts = useMemo(
    () =>
      (d?.prompts ?? [])
        .filter((p) => (type === "branded" ? p.branded : type === "discovery" ? !p.branded : true))
        .filter((p) => !q || p.text.toLocaleLowerCase("tr").includes(q.toLocaleLowerCase("tr"))),
    [d, q, type]
  );

  if (err)
    return (
      <div className="space-y-4">
        <Link href="/brand-monitors" className="text-sm text-ink/55 hover:text-ink">
          ← Monitörler
        </Link>
        <div className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{err}</div>
      </div>
    );
  if (!d) return <div className="py-20 text-center text-sm text-ink/45">Yükleniyor…</div>;

  const stale = Date.now() - new Date(d.lastRunAt).getTime() > 7 * 864e5;
  const net = netSentiment(d.sentiment);
  const timeline = d.timeline.map((t) => ({ ...t, label: new Date(t.at).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }), v: Math.round(t.visibility * 100) }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/brand-monitors" className="text-xs text-ink/45 hover:text-ink">
            ← LLM Marka Monitörleri
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{d.brand.name} monitörü</h1>
          <p className="text-sm text-ink/50">
            Son çalışma {fmt(d.lastRunAt)} · {d.brand.domain}
            {d.demoMode && <span className="ml-2 rounded bg-warn/10 px-1.5 py-0.5 text-[11px] font-medium text-warn">demo verisi</span>}
          </p>
        </div>
        <Link href="/geo" className="rounded-lg border border-border bg-panel px-3.5 py-2 text-sm font-semibold hover:bg-muted">
          ↻ Yeniden çalıştır
        </Link>
      </div>

      {stale && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warn/30 bg-warn/5 px-4 py-3">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-warn text-[10px] font-bold text-white">!</span>
            <div>
              <div className="text-sm font-semibold text-warn">Veriler güncel değil</div>
              <div className="text-xs text-ink/60">Son test 7 günden eski. Markanın AI cevaplarındaki yerini görmek için testi yeniden çalıştır.</div>
            </div>
          </div>
          <Link href="/geo" className="text-sm font-semibold text-accent underline">
            ▶ Testi çalıştır
          </Link>
        </div>
      )}

      {d.legacy && (
        <div className="rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-ink/65">
          Bu monitörün son testi prompt bazında cevapları saklamadan önce yapılmış. Prompt ve cevap detaylarını görmek için testi bir kez yeniden çalıştır.
        </div>
      )}

      {/* KPI kartları */}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-panel p-4">
          <div className="text-sm font-semibold">Görünürlük</div>
          <div className="text-xs text-ink/45">Markanın cevaplarda geçme oranı</div>
          <div className="mt-3 flex items-center gap-3">
            <ScoreRing value={d.visibility * 100} size={40} stroke={4} />
            <div>
              <div className="text-2xl font-semibold tabular-nums">{pct(d.visibility)}</div>
              <div className="text-[11px] text-ink/45">tüm motorlarda</div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-panel p-4">
          <div className="text-sm font-semibold">Duygu</div>
          <div className="text-xs text-ink/45">AI&apos;ın markanı ne kadar olumlu anlattığı</div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums">{net == null ? "—" : `${net > 0 ? "+" : ""}${net}`}</span>
            <span className="text-xs text-ink/50">({sentimentLabel(d.sentiment)})</span>
          </div>
          <div className="mt-2">
            <SentimentBar value={d.sentiment} width={260} />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-panel p-4">
          <div className="text-sm font-semibold">Promptlar</div>
          <div className="text-xs text-ink/45">İzlenen sorular</div>
          <div className="mt-3 text-2xl font-semibold tabular-nums">
            {d.prompts.length} <span className="text-sm font-normal text-ink/50">prompt</span>
          </div>
          <div className="text-[11px] text-ink/45">{d.engines.length} AI motorunda</div>
        </div>
      </div>

      {/* Sekmeler */}
      <div className="flex gap-5 overflow-x-auto border-b border-border text-sm">
        {([
          ["prompts", "Promptlar", d.prompts.length],
          ["visibility", "Görünürlük", null],
          ["sentiment", "Duygu", null],
          ["rivals", "Rakipler", d.summaries.length - 1 || null],
          ["sources", "Kaynaklar", d.sources.length || null],
        ] as const).map(([k, l, n]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 pb-2.5 ${tab === k ? "border-accent font-semibold text-ink" : "border-transparent text-ink/55 hover:text-ink"}`}>
            {l}
            {n != null && <span className="rounded bg-accent/10 px-1.5 text-[11px] font-semibold text-accent">{n}</span>}
          </button>
        ))}
      </div>

      {tab === "prompts" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Prompt ara…" className="w-64 rounded-lg border border-border bg-panel px-3 py-1.5 text-sm outline-none focus:border-accent" />
            <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="rounded-lg border border-border bg-panel px-2.5 py-1.5 text-sm outline-none">
              <option value="all">Tüm türler</option>
              <option value="discovery">Keşif (marka adı geçmeyen)</option>
              <option value="branded">Markalı</option>
            </select>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-panel">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs text-ink/55">
                  <th className="px-4 py-2.5 font-medium">Prompt</th>
                  <th className="hidden py-2.5 pr-4 font-medium md:table-cell">Konu</th>
                  <th className="py-2.5 pr-4 text-center font-medium">Görünürlük</th>
                  <th className="py-2.5 pr-4 font-medium">Duygu</th>
                  <th className="hidden py-2.5 pr-4 font-medium lg:table-cell">Motorlar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {prompts.map((p) => (
                  <tr
                    key={p.text}
                    onClick={() => {
                      setOpen(p);
                      setOpenResp(null);
                    }}
                    className="cursor-pointer hover:bg-muted/40"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.text}</div>
                      {p.branded && <span className="mt-0.5 inline-block rounded bg-muted px-1.5 text-[10px] font-semibold text-ink/50">markalı</span>}
                    </td>
                    <td className="hidden py-3 pr-4 text-xs text-ink/55 md:table-cell">{p.topic}</td>
                    <td className="py-3 pr-4 text-center">
                      <ScoreRing value={p.visibility * 100} />
                    </td>
                    <td className="py-3 pr-4">
                      <SentimentBar value={p.sentiment} />
                    </td>
                    <td className="hidden py-3 pr-4 lg:table-cell">
                      <div className="flex -space-x-1">
                        {p.responses.map((r, i) => (
                          <span key={i} className={r.mentioned ? "" : "opacity-30"}>
                            <EngineDot engine={r.engine} size={18} />
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
                {!prompts.length && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-ink/45">
                      Bu filtrede prompt yok.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "visibility" && (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className="rounded-xl border border-border bg-panel p-4">
            <div className="text-sm font-semibold">Motor kırılımı</div>
            <div className="text-xs text-ink/45">AI motoru başına görünürlük</div>
            <ul className="mt-3 space-y-2.5">
              {d.engines.map((e) => (
                <li key={e.engine} className="flex items-center gap-2.5 text-sm">
                  <EngineDot engine={e.engine} />
                  <span className="flex-1">{ENGINE_META[e.engine]?.name ?? e.engine}</span>
                  <ScoreRing value={e.visibility * 100} size={28} />
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-panel p-4">
            <div className="text-sm font-semibold">Zaman içinde görünürlük</div>
            <div className="text-xs text-ink/45">Her GEO testi bir nokta</div>
            {timeline.length < 2 ? (
              <div className="flex h-56 items-center justify-center text-sm text-ink/45">Grafik için en az 2 test gerekiyor.</div>
            ) : (
              <div className="mt-3 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" vertical={false} />
                    <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={34} tickFormatter={(v) => `${v}%`} />
                    <Tooltip formatter={(v) => [`${v}%`, "Görünürlük"]} contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
                    <Line type="monotone" dataKey="v" stroke="#5d16ff" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "sentiment" && (
        <div className="overflow-hidden rounded-xl border border-border bg-panel">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-ink/55">
                <th className="px-4 py-2.5 font-medium">Motor</th>
                <th className="py-2.5 pr-4 font-medium">Net duygu</th>
                <th className="py-2.5 pr-4 font-medium">Dağılım</th>
                <th className="py-2.5 pr-4 font-medium">Etiket</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {d.engines.map((e) => {
                const n = netSentiment(e.sentiment);
                return (
                  <tr key={e.engine}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <EngineDot engine={e.engine} />
                        {ENGINE_META[e.engine]?.name ?? e.engine}
                      </div>
                    </td>
                    <td className="py-3 pr-4 font-semibold tabular-nums">{n == null ? "—" : `${n > 0 ? "+" : ""}${n}`}</td>
                    <td className="py-3 pr-4">
                      <SentimentBar value={e.sentiment} width={140} />
                    </td>
                    <td className="py-3 pr-4 text-xs text-ink/60">{sentimentLabel(e.sentiment)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="border-t border-border px-4 py-2.5 text-[11px] text-ink/45">Duygu, markanın geçtiği cümlelerden kurallarla hesaplanır. Marka geçmeyen cevaplar duyguya katılmaz.</p>
        </div>
      )}

      {tab === "rivals" && (
        <div className="overflow-hidden rounded-xl border border-border bg-panel">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-ink/55">
                <th className="px-4 py-2.5 font-medium">Marka</th>
                <th className="py-2.5 pr-4 text-center font-medium">Görünürlük</th>
                <th className="py-2.5 pr-4 text-right font-medium">Ses payı</th>
                <th className="hidden py-2.5 pr-4 text-right font-medium md:table-cell">Ort. sıra</th>
                <th className="py-2.5 pr-4 font-medium">Duygu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...d.summaries]
                .sort((a, b) => b.visibility - a.visibility)
                .map((s) => (
                  <tr key={s.domain} className={s.domain === d.brand.domain ? "bg-accent/5" : ""}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`https://www.google.com/s2/favicons?domain=${s.domain}&sz=32`} alt="" className="h-4 w-4 rounded" />
                        <span className="font-medium">{s.brand}</span>
                        {s.domain === d.brand.domain && <span className="rounded bg-accent px-1.5 text-[10px] font-bold text-white">sen</span>}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-center">
                      <ScoreRing value={s.visibility * 100} />
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">{pct(s.shareOfVoice)}</td>
                    <td className="hidden py-3 pr-4 text-right tabular-nums text-ink/60 md:table-cell">{s.avgPosition != null ? s.avgPosition.toFixed(1) : "—"}</td>
                    <td className="py-3 pr-4">
                      <SentimentBar value={s.avgSentiment} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "sources" && (
        <div className="overflow-hidden rounded-xl border border-border bg-panel">
          {d.sources.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-ink/45">Bu testte kaynak gösterilmedi.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs text-ink/55">
                  <th className="px-4 py-2.5 font-medium">Kaynak</th>
                  <th className="py-2.5 pr-4 font-medium">Tür</th>
                  <th className="py-2.5 pr-4 text-right font-medium">Atıf</th>
                  <th className="py-2.5 pr-4 text-right font-medium">Pay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {d.sources.map((s) => (
                  <tr key={s.domain}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`https://www.google.com/s2/favicons?domain=${s.domain}&sz=32`} alt="" className="h-4 w-4 rounded" />
                        {s.domain}
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-ink/60">{SOURCE_TYPE[s.type] ?? s.type}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{s.count}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-ink/60">{pct(s.citationShare)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Prompt çekmecesi */}
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setOpen(null)} />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-[620px] flex-col overflow-y-auto bg-panel shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div className="text-xs text-ink/50">Son çalışma {fmt(d.lastRunAt)}</div>
              <button type="button" onClick={() => setOpen(null)} className="rounded-lg px-2 py-1 text-ink/50 hover:bg-muted" aria-label="Kapat">
                ✕
              </button>
            </div>
            <div className="space-y-5 p-5">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-border px-3 py-1 text-xs">
                  Görünürlük <b>{pct(open.visibility)}</b>
                </span>
                <span className="rounded-full border border-border px-3 py-1 text-xs">
                  Duygu <b>{sentimentLabel(open.sentiment)}</b>
                  {open.sentiment != null && ` (${netSentiment(open.sentiment)! > 0 ? "+" : ""}${netSentiment(open.sentiment)})`}
                </span>
                <span className="rounded-full border border-border px-3 py-1 text-xs">{open.topic}</span>
              </div>
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Kullanıcı sorusu
                </div>
                <div className="rounded-lg bg-muted/60 px-3.5 py-2.5 text-sm">{open.text}</div>
              </div>
              {open.mentions.length > 0 && (
                <div>
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink/45">Cevaplarda geçen markalar</div>
                  <div className="flex flex-wrap gap-1.5">
                    {open.mentions.map((m) => (
                      <span key={m} className={`rounded-md px-2 py-0.5 text-xs font-medium ${m === d.brand.name ? "bg-accent text-white" : "bg-accent/10 text-accent"}`}>
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full bg-seo" /> Cevaplar <span className="font-normal text-ink/45">({open.responses.length})</span>
                </div>
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {open.responses.map((r, i) => {
                    const exp = openResp === i;
                    return (
                      <li key={i} className="cursor-pointer px-3.5 py-3 hover:bg-muted/30" onClick={() => setOpenResp(exp ? null : i)}>
                        <div className="flex items-start gap-3">
                          <EngineDot engine={r.engine} size={20} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-xs text-ink/50">
                              <span className="font-semibold text-ink/70">{ENGINE_META[r.engine]?.name ?? r.engine}</span>
                              {r.mentioned ? (
                                <span className="rounded bg-seo/10 px-1.5 text-[10px] font-semibold text-seo">{r.position ? `${r.position}. sırada` : "geçiyor"}</span>
                              ) : (
                                <span className="rounded bg-danger/10 px-1.5 text-[10px] font-semibold text-danger">geçmiyor</span>
                              )}
                            </div>
                            <p className={`mt-1 whitespace-pre-wrap text-sm leading-6 ${exp ? "" : "line-clamp-2"}`}>{r.text}</p>
                            {r.mentions.length > 0 && <div className="mt-1 text-[11px] text-ink/45">Geçen markalar: {r.mentions.join(", ")}</div>}
                            {exp && r.citations.length > 0 && (
                              <div className="mt-2 space-y-0.5">
                                <div className="text-[11px] font-semibold text-ink/50">Kaynaklar</div>
                                {r.citations.map((c) => (
                                  <a key={c.url} href={c.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className={`block truncate text-xs hover:underline ${c.isOwnDomain ? "font-semibold text-seo" : "text-accent"}`}>
                                    {c.url}
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1.5">
                            <ScoreRing value={r.mentioned ? (r.sentiment ?? 50) : 0} size={30} />
                            <SentimentBar value={r.sentiment} width={48} />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
