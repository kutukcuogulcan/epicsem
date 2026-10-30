"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ToolPageHeader from "@/components/ToolPageHeader";
import PageGuide from "@/components/PageGuide";

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
  source: "bing" | "ahrefs";
}
interface Data {
  site?: string;
  sources: { bing: boolean; ahrefs: boolean };
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
const path = (u: string) => u.replace(/^https?:\/\/(www\.)?[^/]+/, "") || "/";

export default function BacklinksPage() {
  const [site, setSite] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"domains" | "pages" | "gap">("domains");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "live" | "lost" | "high">("all");
  const [open, setOpen] = useState<string | null>(null);
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
    fetch("/api/assistant")
      .then((r) => (r.ok ? r.json() : { sites: [] }))
      .then((d) => {
        const first = d.sites?.[0];
        if (first) {
          setSite(first);
          load(first);
        }
      })
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
      { k: "50–69", n: 0, c: "#5d16ff" },
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

  const noSource = data && !data.sources.bing && !data.sources.ahrefs;

  return (
    <div className="space-y-6">
      <ToolPageHeader
        breadcrumbLabel="Backlink"
        title="Backlink"
        body="Sitene link veren alan adları, otoriteleri (Domain Rating) ve kaybedilen linkler. Rakiplerin link aldığı ama senin almadığın sitelerden link fırsatları çıkar."
      >
        {data?.cachedAt && (
          <span className="text-xs text-ink/45">
            Son güncelleme: {new Date(data.cachedAt).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </ToolPageHeader>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          load(site, true);
        }}
        className="flex items-center gap-2 rounded-2xl border border-border bg-panel p-2 pl-4"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-ink/35" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M8.5 11.5l3-3M7 9.5l-1.5 1.5a2.5 2.5 0 0 0 3.5 3.5L10.5 13M13 10.5l1.5-1.5a2.5 2.5 0 0 0-3.5-3.5L9.5 7" />
        </svg>
        <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="siten.com" className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" />
        <button disabled={loading || !site.trim() || !!noSource} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
          {loading ? "Yükleniyor…" : "Backlinkleri getir →"}
        </button>
      </form>

      {noSource && (
        <div className="grid gap-3 md:grid-cols-2">
          {[
            { t: "Bing Webmaster (ücretsiz)", d: "Bing'in bildiği gelen linkler ve anchor metinleri. Kendi doğrulanmış siten için ücretsiz.", c: "bg-[#008373]" },
            { t: "Ahrefs", d: "Ücretsiz anahtarla Domain Rating; Lite+ planla tam referring domain listesi, yeni/kaybedilen linkler ve rakip boşluğu.", c: "bg-[#ff8800]" },
          ].map((x) => (
            <Link key={x.t} href="/integrations" className="rounded-2xl border border-border bg-panel p-5 transition hover:border-accent/40">
              <div className="flex items-center gap-3">
                <div className={`h-9 w-9 rounded-xl ${x.c}`} />
                <div className="font-bold">{x.t} →</div>
              </div>
              <p className="mt-2 text-sm leading-6 text-ink/60">{x.d}</p>
            </Link>
          ))}
          <p className="text-xs text-ink/50 md:col-span-2">Backlink verisi için en az bir kaynak bağla. İkisi birden bağlıysa veriler birleştirilir.</p>
        </div>
      )}

      {err && <div className="rounded-xl bg-danger/5 px-4 py-2.5 text-sm text-danger">{err}</div>}
      {data?.errors?.map((e) => (
        <div key={e} className="rounded-xl border border-warn/30 bg-warn/5 px-4 py-2.5 text-sm text-ink/70">
          {e}
        </div>
      ))}

      {data?.site && !noSource && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              ["Referring domain", String(kpi.refs), "link veren alan adı"],
              ["Backlink", kpi.links.toLocaleString("tr-TR"), "toplam link"],
              ["Ortalama DR", kpi.avgDr !== null ? String(kpi.avgDr) : "—", "link verenlerin otoritesi"],
              ["Güçlü kaynak", String(kpi.high), "DR 50 ve üstü"],
              ["Kaybedilen", String(kpi.lost), data.sources.ahrefs ? "son 90 gün" : "Ahrefs ile görünür"],
            ].map(([l, v, sub]) => (
              <div key={l} className="rounded-2xl border border-border bg-panel p-4">
                <div className="text-[11px] text-ink/50">{l}</div>
                <div className="text-2xl font-extrabold tabular-nums">{loading ? "…" : v}</div>
                <div className="text-[11px] text-ink/40">{sub}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="rounded-2xl border border-border bg-panel">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <div className="text-sm font-bold">Domain Rating dağılımı</div>
                <span className="text-xs text-ink/40">{withDr.length ? "referring domain sayısı" : "DR için Ahrefs bağla"}</span>
              </div>
              <div className="h-48 px-2 pt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dist}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="k" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={28} />
                    <Tooltip cursor={{ fill: "rgba(93,22,255,0.04)" }} contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, fontSize: 12 }} />
                    <Bar dataKey="n" name="Alan adı" radius={[6, 6, 0, 0]}>
                      {dist.map((d) => (
                        <Cell key={d.k} fill={d.c} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-panel">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <div className="text-sm font-bold">En sık anchor metinleri</div>
                <span className="text-xs text-ink/40">{anchors.length ? "alan adı sayısı" : "Bing ile görünür"}</span>
              </div>
              <ul className="space-y-2 p-5">
                {anchors.length ? (
                  anchors.map(([a, n]) => (
                    <li key={a} className="flex items-center gap-3 text-sm">
                      <span className="min-w-0 flex-1 truncate">{a}</span>
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${(n / anchors[0][1]) * 100}%` }} />
                      </div>
                      <span className="w-6 text-right text-xs tabular-nums text-ink/50">{n}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-ink/45">Anchor verisi yok.</li>
                )}
              </ul>
            </div>
          </div>

          <div className="flex flex-wrap rounded-xl border border-border bg-panel p-1 text-xs font-semibold w-fit">
            {([
              ["domains", `Referring domains · ${domains.length}`],
              ["pages", `En çok link alan sayfalar · ${data.pages?.length ?? 0}`],
              ["gap", "Link fırsatları"],
            ] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 ${tab === k ? "bg-ink text-white" : "text-ink/55 hover:text-ink"}`}>
                {l}
              </button>
            ))}
          </div>

          {tab === "domains" && (
            <div className="overflow-hidden rounded-2xl border border-border bg-panel">
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
                {([
                  ["all", "Tümü"],
                  ["live", "Canlı"],
                  ["high", "DR 50+"],
                  ["lost", "Kaybedilen"],
                ] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setStatus(k)} className={`rounded-full px-3 py-1 text-xs font-semibold ${status === k ? "bg-ink text-white" : "bg-muted text-ink/60"}`}>
                    {l}
                  </button>
                ))}
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Alan adı ya da anchor ara…" className="ml-auto w-52 rounded-lg border border-border bg-muted px-2.5 py-1.5 text-xs outline-none focus:border-accent" />
              </div>
              {shown.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-ink/45">{loading ? "Yükleniyor…" : "Bu filtrede link veren alan adı yok."}</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-ink/45">
                      <th className="px-5 py-2 font-semibold">Alan adı</th>
                      <th className="py-2 pr-3 font-semibold">DR</th>
                      <th className="py-2 pr-3 text-right font-semibold">Link</th>
                      <th className="hidden py-2 pr-3 text-right font-semibold md:table-cell">Trafik</th>
                      <th className="hidden py-2 pr-3 font-semibold lg:table-cell">İlk görülme</th>
                      <th className="py-2 pr-5 font-semibold">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {shown.slice(0, 300).map((d) => (
                      <Fragment key={d.domain}>
                        <tr onClick={() => setOpen(open === d.domain ? null : d.domain)} className="cursor-pointer hover:bg-muted/40">
                          <td className="px-5 py-2.5">
                            <div className="flex items-center gap-2">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={`https://www.google.com/s2/favicons?domain=${d.domain}&sz=32`} alt="" className="h-4 w-4 rounded" />
                              <span className="font-medium">{d.domain}</span>
                              {d.spam && <span className="rounded bg-danger/10 px-1.5 text-[10px] font-bold text-danger">spam</span>}
                            </div>
                            {d.anchors[0] && <div className="truncate pl-6 text-[11px] text-ink/45">“{d.anchors[0]}”</div>}
                          </td>
                          <td className="py-2.5 pr-3">
                            <span className={`rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${drTone(d.dr)}`}>{d.dr !== null ? Math.round(d.dr) : "—"}</span>
                          </td>
                          <td className="py-2.5 pr-3 text-right tabular-nums">{d.links}</td>
                          <td className="hidden py-2.5 pr-3 text-right text-xs tabular-nums text-ink/55 md:table-cell">{d.traffic != null ? d.traffic.toLocaleString("tr-TR") : "—"}</td>
                          <td className="hidden py-2.5 pr-3 text-xs text-ink/55 lg:table-cell">{fmtDate(d.firstSeen)}</td>
                          <td className="py-2.5 pr-5">
                            {d.lostAt ? (
                              <span className="rounded-md bg-danger/10 px-2 py-0.5 text-[11px] font-semibold text-danger">Kaybedildi · {fmtDate(d.lostAt)}</span>
                            ) : (
                              <span className="rounded-md bg-seo/10 px-2 py-0.5 text-[11px] font-semibold text-seo">Canlı</span>
                            )}
                          </td>
                        </tr>
                        {open === d.domain && (
                          <tr>
                            <td colSpan={6} className="bg-muted/30 px-5 py-3 text-xs">
                              <div className="grid gap-3 md:grid-cols-3">
                                <div>
                                  <div className="mb-1 font-bold text-ink/50">Anchor metinleri</div>
                                  {d.anchors.length ? d.anchors.map((a) => <div key={a}>“{a}”</div>) : <div className="text-ink/40">—</div>}
                                </div>
                                <div>
                                  <div className="mb-1 font-bold text-ink/50">Link verilen sayfaların</div>
                                  {d.targets.length ? d.targets.map((t) => <div key={t} className="truncate">{path(t)}</div>) : <div className="text-ink/40">—</div>}
                                </div>
                                <div>
                                  <div className="mb-1 font-bold text-ink/50">Kaynak</div>
                                  <div>{d.source === "ahrefs" ? "Ahrefs" : "Bing Webmaster"}</div>
                                  {d.sampleUrl && (
                                    <a href={d.sampleUrl} target="_blank" rel="noreferrer" className="mt-1 block truncate font-semibold text-accent hover:underline">
                                      Link veren sayfayı aç ↗
                                    </a>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === "pages" && (
            <div className="overflow-hidden rounded-2xl border border-border bg-panel">
              {data.pages?.length ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-ink/45">
                      <th className="px-5 py-2 font-semibold">Sayfa</th>
                      <th className="py-2 pr-5 text-right font-semibold">Gelen link</th>
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
                        <td className="py-2.5 pr-5 text-right font-semibold tabular-nums">{p.count.toLocaleString("tr-TR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="px-5 py-10 text-center text-sm text-ink/45">Sayfa bazlı link sayıları Bing Webmaster bağlantısıyla gelir.</div>
              )}
            </div>
          )}

          {tab === "gap" && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-panel p-5">
                <div className="text-sm font-bold">Rakiplerin link aldığı ama senin almadığın siteler</div>
                <p className="mt-1 text-xs text-ink/55">En fazla 4 rakip gir. Birden çok rakibe link veren siteler en üstte — bunlar sana da link vermeye en yatkın olanlar. Ahrefs (Lite+) gerekir; sonuç 24 saat saklanır.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {comps.map((c, i) => (
                    <input
                      key={i}
                      value={c}
                      onChange={(e) => setComps((a) => a.map((x, j) => (j === i ? e.target.value : x)))}
                      placeholder={`rakip${i + 1}.com`}
                      className="w-48 rounded-xl border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-accent"
                    />
                  ))}
                  {comps.length < 4 && (
                    <button type="button" onClick={() => setComps((a) => [...a, ""])} className="rounded-xl border border-dashed border-border px-3 py-2 text-sm text-ink/50 hover:border-accent/40">
                      + rakip
                    </button>
                  )}
                  <button type="button" onClick={runGap} disabled={gapBusy || !comps.some((c) => c.trim()) || !data.sources.ahrefs} className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                    {gapBusy ? "Karşılaştırılıyor…" : "Fırsatları bul"}
                  </button>
                </div>
                {!data.sources.ahrefs && (
                  <p className="mt-3 text-xs text-ink/55">
                    Bu karşılaştırma için <Link href="/integrations" className="font-semibold text-accent">Ahrefs&apos;i bağla</Link>.
                  </p>
                )}
                {gapErr && <p className="mt-3 rounded-lg bg-danger/5 px-3 py-2 text-xs text-danger">{gapErr}</p>}
              </div>
              {gap && (
                <div className="overflow-hidden rounded-2xl border border-border bg-panel">
                  <div className="border-b border-border px-5 py-3 text-sm font-bold">
                    {gap.gaps.length} fırsat · {gap.checked.join(", ")}
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-ink/45">
                        <th className="px-5 py-2 font-semibold">Alan adı</th>
                        <th className="py-2 pr-3 font-semibold">DR</th>
                        <th className="hidden py-2 pr-3 text-right font-semibold md:table-cell">Trafik</th>
                        <th className="py-2 pr-3 font-semibold">Link verdiği rakipler</th>
                        <th className="py-2 pr-5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {gap.gaps.slice(0, 200).map((g) => (
                        <tr key={g.domain}>
                          <td className="px-5 py-2.5 font-medium">{g.domain}</td>
                          <td className="py-2.5 pr-3">
                            <span className={`rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${drTone(g.dr)}`}>{g.dr !== null ? Math.round(g.dr) : "—"}</span>
                          </td>
                          <td className="hidden py-2.5 pr-3 text-right text-xs tabular-nums text-ink/55 md:table-cell">{g.traffic != null ? g.traffic.toLocaleString("tr-TR") : "—"}</td>
                          <td className="py-2.5 pr-3">
                            <div className="flex flex-wrap gap-1">
                              {g.linksTo.map((c) => (
                                <span key={c} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-ink/60">
                                  {c}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="whitespace-nowrap py-2.5 pr-5 text-right text-xs">
                            <a href={`https://${g.domain}`} target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">
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

          {data.drLicense && (
            <p className="text-[11px] text-ink/40">
              Domain Rating by{" "}
              <a href="https://ahrefs.com/" target="_blank" rel="noreferrer" className="underline">
                Ahrefs
              </a>
              .
            </p>
          )}
        </>
      )}

      <PageGuide id="backlinks" />
    </div>
  );
}
