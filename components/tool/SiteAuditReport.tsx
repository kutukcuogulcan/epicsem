"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BulkImportResult } from "@/types";
import { ISSUE_INFO, ISSUE_LABEL, ISSUE_SEVERITY, SEVERITY_LABEL, THEMES, pageAdvice, priorityScore, type IssueInfo, type Severity } from "@/lib/bulk-labels";
import type { BulkImportRow } from "@/types";
import PageRow, { short } from "./PageRow";

export interface RunSummary {
  id: number;
  filename: string;
  rowCount: number;
  summary: BulkImportResult["summary"];
  createdAt: string;
}

const SEV_STYLE: Record<Severity, { dot: string; badge: string; color: string }> = {
  error: { dot: "bg-danger", badge: "bg-danger/10 text-danger", color: "#ef4444" },
  warning: { dot: "bg-warn", badge: "bg-warn/10 text-warn", color: "#f59e0b" },
  notice: { dot: "bg-accent", badge: "bg-accent/10 text-accent", color: "#5d16ff" },
};
const SEV_ORDER: Severity[] = ["error", "warning", "notice"];
const STATUS_COLOR: Record<string, string> = { "2xx": "#16a34a", "3xx": "#f59e0b", "4xx": "#ef4444", "5xx": "#991b1b", hata: "#64748b", "?": "#cbd5e1" };

const site = (f: string) => f.split(" · ")[0].replace(" (kısmi)", "");
const sevOf = (code: string): Severity => ISSUE_SEVERITY[code] ?? "notice";

function scoreColor(n: number) {
  return n >= 80 ? "#16a34a" : n >= 50 ? "#f59e0b" : "#ef4444";
}

function Card({ title, right, children, className = "" }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-panel ${className}`}>
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <span className="text-sm font-bold">{title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

function Delta({ now, prev, goodWhen = "down" }: { now: number; prev: number | null | undefined; goodWhen?: "up" | "down" }) {
  if (prev == null || now === prev) return null;
  const d = now - prev;
  const good = goodWhen === "down" ? d < 0 : d > 0;
  return <span className={`text-xs font-semibold tabular-nums ${good ? "text-seo" : "text-danger"}`}>{d > 0 ? `+${d}` : d}</span>;
}

/**
 * Ahrefs Site Audit / Semrush Site Audit tarzı rapor: Sağlık skoru, hata/uyarı/bildirim,
 * taranan sayfa dağılımı, tematik puanlar, durum kodu & derinlik grafikleri, öncelikli
 * sorun listesi (neden önemli + nasıl düzeltilir + etkilenen URL'ler) ve sayfa gezgini.
 */
export default function SiteAuditReport({
  result,
  runs,
  currentId,
  onSelectRun,
}: {
  result: BulkImportResult;
  runs: RunSummary[];
  currentId: number | null;
  onSelectRun: (id: number) => void;
}) {
  const [tab, setTab] = useState<"overview" | "issues" | "pages">("overview");
  const [openIssue, setOpenIssue] = useState<string | null>(null);
  const [sevFilter, setSevFilter] = useState<Severity | "all">("all");
  const [pageFilter, setPageFilter] = useState<string | null>(null);
  const [openUrl, setOpenUrl] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const s = result.summary;
  const rows = result.rows;

  const data = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) for (const c of r.issues) counts[c] = (counts[c] ?? 0) + 1;

    const sameSite = runs.filter((r) => site(r.filename) === site(result.filename)).sort((a, b) => a.id - b.id);
    const idx = currentId != null ? sameSite.findIndex((r) => r.id === currentId) : sameSite.length - 1;
    const prev = idx > 0 ? sameSite[idx - 1] : null;
    const prevCounts = prev?.summary.issueCounts ?? null;

    const html = rows.filter((r) => r.statusCode !== null);
    const withErr = html.filter((r) => r.issues.some((c) => sevOf(c) === "error")).length;
    const health = s.healthScore ?? (html.length ? Math.round(((html.length - withErr) / html.length) * 100) : 0);

    const sev = { error: 0, warning: 0, notice: 0 } as Record<Severity, number>;
    const sevTypes = { error: 0, warning: 0, notice: 0 } as Record<Severity, number>;
    for (const [c, n] of Object.entries(counts)) {
      sev[sevOf(c)] += n;
      sevTypes[sevOf(c)]++;
    }
    const prevSev = prev?.summary.severity ?? null;

    const broken = rows.filter((r) => r.statusCode !== null && (r.statusCode >= 400 || r.statusCode === 0)).length;
    const redirects = rows.filter((r) => r.statusCode !== null && r.statusCode >= 300 && r.statusCode < 400).length;
    const blocked = rows.filter((r) => r.statusCode !== null && r.statusCode >= 200 && r.statusCode < 300 && r.indexable === false).length;
    const withIssues = rows.filter((r) => r.statusCode !== null && r.statusCode >= 200 && r.statusCode < 300 && r.indexable !== false && r.issues.length > 0).length;
    const healthy = rows.length - broken - redirects - blocked - withIssues;
    const crawled = [
      { k: "Sağlıklı", v: healthy, c: "#16a34a" },
      { k: "Sorunlu", v: withIssues, c: "#f59e0b" },
      { k: "Yönlendirme", v: redirects, c: "#94a3b8" },
      { k: "İndekslenemez", v: blocked, c: "#5d16ff" },
      { k: "Kırık", v: broken, c: "#ef4444" },
    ];

    const statusDist: Record<string, number> = {};
    for (const r of rows) {
      const k = r.statusCode === null ? "?" : r.statusCode === 0 ? "hata" : `${Math.floor(r.statusCode / 100)}xx`;
      statusDist[k] = (statusDist[k] ?? 0) + 1;
    }
    const depthDist: Record<string, number> = {};
    for (const r of rows) {
      if (!r.metrics) continue;
      const d = r.metrics.depth;
      const k = d === null ? "?" : d >= 5 ? "5+" : String(d);
      depthDist[k] = (depthDist[k] ?? 0) + 1;
    }
    const indexable = rows.filter((r) => r.indexable !== false && r.statusCode !== null && r.statusCode >= 200 && r.statusCode < 300).length;

    const themes = THEMES.map((t) => {
      const bad = html.filter((r) => r.issues.some((c) => t.codes.includes(c))).length;
      return { ...t, score: html.length ? Math.round(((html.length - bad) / html.length) * 100) : 100, bad };
    });

    const issues = Object.entries(counts)
      .map(([code, n]) => ({ code, n, sev: sevOf(code), prev: prevCounts ? prevCounts[code] ?? 0 : null }))
      .sort((a, b) => SEV_ORDER.indexOf(a.sev) - SEV_ORDER.indexOf(b.sev) || b.n - a.n);

    const trend = sameSite.map((r) => ({
      date: new Date(r.createdAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }),
      skor: r.summary.healthScore ?? null,
    })).filter((x) => x.skor !== null);

    const htmlN = html.length || 1;
    const plan = Object.entries(counts)
      .filter(([c]) => sevOf(c) !== "notice" || ["missing-schema", "noindex-tag", "non-indexable"].includes(c))
      .map(([code, n]) => {
        const onlyThis = sevOf(code) === "error" ? html.filter((r) => r.issues.includes(code) && !r.issues.some((x) => x !== code && sevOf(x) === "error")).length : 0;
        return { code, n, sev: sevOf(code), gain: Math.round((onlyThis / htmlN) * 100), p: priorityScore(code, n) + (sevOf(code) === "error" ? 3 : 0) };
      })
      .sort((a, b) => b.p - a.p)
      .slice(0, 6);

    return { plan, counts, prev, health, prevHealth: prev?.summary.healthScore ?? null, sev, sevTypes, prevSev, crawled, statusDist, depthDist, indexable, themes, issues, trend };
  }, [rows, runs, currentId, result.filename, s.healthScore]);

  const pageRows = useMemo(() => {
    let list = pageFilter ? rows.filter((r) => r.issues.includes(pageFilter)) : rows;
    if (q.trim()) list = list.filter((r) => r.url.toLowerCase().includes(q.trim().toLowerCase()));
    return list;
  }, [rows, pageFilter, q]);

  const total = rows.length || 1;

  function showPages(code: string) {
    setPageFilter(code);
    setTab("pages");
  }

  return (
    <div className="space-y-5">
      {/* başlık + tarama seçici + sekmeler */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(site(result.filename))}&sz=64`} alt="" className="h-6 w-6 rounded" />
            <h2 className="truncate text-xl font-extrabold">{site(result.filename)}</h2>
            {result.filename.includes("kısmi") && <span className="rounded bg-warn/10 px-1.5 py-0.5 text-[10px] font-bold text-warn">kısmi</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink/50">
            <span>{rows.length} sayfa tarandı</span>
            <span>·</span>
            {runs.length > 1 ? (
              <select
                value={currentId ?? ""}
                onChange={(e) => onSelectRun(Number(e.target.value))}
                className="rounded-lg border border-border bg-panel px-2 py-1 text-xs font-semibold text-ink/70 outline-none"
              >
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {site(r.filename)} — {new Date(r.createdAt).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </option>
                ))}
              </select>
            ) : (
              <span>{new Date(result.importedAt).toLocaleString("tr-TR")}</span>
            )}
          </div>
        </div>
        <div className="flex rounded-xl border border-border bg-panel p-1 text-xs font-semibold">
          {([
            ["overview", "Genel bakış"],
            ["issues", `Sorunlar · ${data.issues.length}`],
            ["pages", `Sayfa gezgini · ${rows.length}`],
          ] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 ${tab === k ? "bg-ink text-white" : "text-ink/55 hover:text-ink"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && (
        <>
          {/* 1. satır: sağlık skoru | taranan sayfalar | hata/uyarı/bildirim */}
          <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr_1fr]">
            <Card title="Sağlık skoru" right={<span className="text-xs text-ink/40">hatasız sayfa oranı</span>}>
              <div className="flex items-center gap-4 px-5 py-4">
                <div className="relative h-32 w-32 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={[{ v: data.health }, { v: 100 - data.health }]} dataKey="v" innerRadius="74%" outerRadius="100%" startAngle={90} endAngle={-270} stroke="none" isAnimationActive>
                        <Cell fill={scoreColor(data.health)} />
                        <Cell fill="#eef2f7" />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-extrabold tabular-nums" style={{ color: scoreColor(data.health) }}>{data.health}</span>
                    <Delta now={data.health} prev={data.prevHealth} goodWhen="up" />
                  </div>
                </div>
                <div className="h-24 min-w-0 flex-1">
                  {data.trend.length > 1 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.trend} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                        <defs>
                          <linearGradient id="hs" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#16a34a" stopOpacity={0.25} />
                            <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" hide />
                        <YAxis domain={[0, 100]} hide />
                        <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, fontSize: 12 }} />
                        <Area type="monotone" dataKey="skor" stroke="#16a34a" strokeWidth={2} fill="url(#hs)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="pt-6 text-xs text-ink/40">Aynı siteyi tekrar taradıkça skorun trendi burada çizilir.</p>
                  )}
                </div>
              </div>
            </Card>

            <Card title="Taranan sayfalar" right={<span className="text-xs text-ink/40">{rows.length} URL</span>}>
              <div className="px-5 py-4">
                <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                  {data.crawled.filter((x) => x.v > 0).map((x) => (
                    <div key={x.k} style={{ width: `${(x.v / total) * 100}%`, background: x.c }} title={`${x.k}: ${x.v}`} />
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                  {data.crawled.map((x) => (
                    <div key={x.k} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2 text-ink/60">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: x.c }} />
                        {x.k}
                      </span>
                      <span className="font-bold tabular-nums">{x.v}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
                  <div><div className="text-[11px] text-ink/45">İndekslenebilir</div><div className="font-extrabold tabular-nums">{data.indexable}</div></div>
                  <div><div className="text-[11px] text-ink/45">Ort. yanıt</div><div className="font-extrabold tabular-nums">{s.avgResponseMs != null ? `${s.avgResponseMs} ms` : "—"}</div></div>
                  <div><div className="text-[11px] text-ink/45">Ort. boyut</div><div className="font-extrabold tabular-nums">{s.avgHtmlKb != null ? `${s.avgHtmlKb} KB` : "—"}</div></div>
                </div>
              </div>
            </Card>

            <Card title="Sorunlar" right={data.prev ? <span className="text-xs text-ink/40">önceki taramaya göre</span> : undefined}>
              <div className="divide-y divide-border">
                {SEV_ORDER.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setSevFilter(k);
                      setTab("issues");
                    }}
                    className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-muted/50"
                  >
                    <span className="flex items-center gap-2.5">
                      <span className={`h-2.5 w-2.5 rounded-full ${SEV_STYLE[k].dot}`} />
                      <span className="text-sm font-semibold">{SEVERITY_LABEL[k]}</span>
                      <span className="text-xs text-ink/40">{data.sevTypes[k]} tür</span>
                    </span>
                    <span className="flex items-baseline gap-2">
                      <span className="text-xl font-extrabold tabular-nums" style={{ color: data.sev[k] ? SEV_STYLE[k].color : undefined }}>{data.sev[k]}</span>
                      <Delta now={data.sev[k]} prev={data.prevSev?.[k]} />
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          {/* 2. satır: tematik raporlar */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {data.themes.map((t) => (
              <div key={t.key} className="rounded-2xl border border-border bg-panel p-4">
                <div className="text-xs font-semibold text-ink/50">{t.label}</div>
                <div className="mt-1 text-2xl font-extrabold tabular-nums" style={{ color: scoreColor(t.score) }}>%{t.score}</div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${t.score}%`, background: scoreColor(t.score) }} />
                </div>
                <div className="mt-1.5 text-[11px] text-ink/40">{t.bad ? `${t.bad} sayfada sorun` : "sorun yok"}</div>
              </div>
            ))}
          </div>

          {/* öneriler: öncelik sırasına göre yapılacaklar */}
          <Card
            title="Öneriler — önce bunları düzelt"
            right={<button type="button" onClick={() => setTab("issues")} className="text-xs font-semibold text-accent hover:underline">Tüm sorunlar →</button>}
          >
            {data.plan.length === 0 ? (
              <div className="px-5 py-6 text-sm font-semibold text-seo">Kritik bir sorun yok — site sağlıklı görünüyor.</div>
            ) : (
              <ol className="divide-y divide-border">
                {data.plan.map((it, i) => {
                  const info = ISSUE_INFO[it.code];
                  return (
                    <li key={it.code}>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenIssue(it.code);
                          setSevFilter("all");
                          setTab("issues");
                        }}
                        className="flex w-full items-start gap-4 px-5 py-3.5 text-left hover:bg-muted/40"
                      >
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">{i + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{ISSUE_LABEL[it.code] ?? it.code}</span>
                            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${SEV_STYLE[it.sev].badge}`}>{SEVERITY_LABEL[it.sev]}</span>
                            <span className="text-xs text-ink/45">{it.n} sayfa</span>
                          </span>
                          {info && <span className="mt-0.5 block text-sm text-ink/60">{info.steps[0]}</span>}
                        </span>
                        <span className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                          {info && (
                            <span className="flex gap-1 text-[10px] font-semibold">
                              <span className="rounded bg-muted px-1.5 py-0.5 text-ink/60">Etki: {info.impact}</span>
                              <span className="rounded bg-muted px-1.5 py-0.5 text-ink/60">Zorluk: {info.effort}</span>
                            </span>
                          )}
                          {it.gain > 0 && <span className="text-xs font-bold text-seo">Sağlık skoru +{it.gain}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>

          {/* 3. satır: grafikler */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="HTTP durum kodları">
              <div className="flex items-center gap-4 px-5 py-4">
                <div className="h-36 w-36 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={Object.entries(data.statusDist).map(([k, v]) => ({ k, v }))} dataKey="v" nameKey="k" innerRadius="58%" outerRadius="100%" stroke="#fff" strokeWidth={2}>
                        {Object.keys(data.statusDist).map((k) => (
                          <Cell key={k} fill={STATUS_COLOR[k] ?? "#94a3b8"} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-1.5">
                  {Object.entries(data.statusDist).sort().map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-ink/60">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_COLOR[k] ?? "#94a3b8" }} />
                        {k}
                      </span>
                      <span className="font-bold tabular-nums">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card title="Tık derinliği" right={<span className="text-xs text-ink/40">ana sayfadan</span>}>
              <div className="h-44 px-2 pt-3">
                {Object.keys(data.depthDist).length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={["0", "1", "2", "3", "4", "5+", "?"].filter((k) => data.depthDist[k]).map((k) => ({ k: k === "?" ? "bağsız" : k, v: data.depthDist[k] }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="k" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={28} />
                      <Tooltip cursor={{ fill: "rgba(93,22,255,0.04)" }} contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, fontSize: 12 }} />
                      <Bar dataKey="v" name="Sayfa" radius={[6, 6, 0, 0]}>
                        {["0", "1", "2", "3", "4", "5+", "?"].filter((k) => data.depthDist[k]).map((k) => (
                          <Cell key={k} fill={k === "?" || k === "5+" || k === "4" ? "#f59e0b" : "#5d16ff"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="p-4 text-xs text-ink/40">Bu taramada derinlik verisi yok.</p>
                )}
              </div>
            </Card>
          </div>
        </>
      )}

      {tab === "issues" && (
        <div className="overflow-hidden rounded-2xl border border-border bg-panel">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
            {(["all", ...SEV_ORDER] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setSevFilter(k)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${sevFilter === k ? "border-ink bg-ink text-white" : "border-border text-ink/60 hover:border-ink/30"}`}
              >
                {k === "all" ? "Tümü" : SEVERITY_LABEL[k]}
                {k !== "all" && <span className="ml-1 opacity-60">{data.sevTypes[k]}</span>}
              </button>
            ))}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink/45">
                <th className="px-5 py-2.5 font-medium">Sorun</th>
                <th className="py-2.5 pr-3 font-medium">Önem</th>
                <th className="py-2.5 pr-3 font-medium max-md:hidden">Etki</th>
                <th className="py-2.5 pr-3 text-right font-medium">URL</th>
                <th className="py-2.5 pr-3 text-right font-medium">Değişim</th>
                <th className="w-40 py-2.5 pr-5 font-medium max-md:hidden">Pay</th>
              </tr>
            </thead>
            <tbody>
              {data.issues
                .filter((i) => sevFilter === "all" || i.sev === sevFilter)
                .map((i) => {
                  const open = openIssue === i.code;
                  const info = ISSUE_INFO[i.code];
                  const affected = rows.filter((r) => r.issues.includes(i.code));
                  return (
                    <IssueRow
                      key={i.code}
                      code={i.code}
                      open={open}
                      onToggle={() => setOpenIssue(open ? null : i.code)}
                      label={ISSUE_LABEL[i.code] ?? i.code}
                      sev={i.sev}
                      n={i.n}
                      prev={i.prev}
                      pct={(i.n / total) * 100}
                      info={info}
                      affected={affected}
                      onShowAll={() => showPages(i.code)}
                    />
                  );
                })}
            </tbody>
          </table>
          {data.issues.length === 0 && <div className="px-5 py-8 text-center text-sm font-semibold text-seo">Bu taramada sorun bulunmadı.</div>}
        </div>
      )}

      {tab === "pages" && (
        <div className="overflow-hidden rounded-2xl border border-border bg-panel">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="URL ara…"
              className="w-56 rounded-lg border border-border bg-panel px-3 py-1.5 text-xs outline-none focus:border-accent"
            />
            <select
              value={pageFilter ?? ""}
              onChange={(e) => setPageFilter(e.target.value || null)}
              className="rounded-lg border border-border bg-panel px-2 py-1.5 text-xs font-semibold text-ink/70 outline-none"
            >
              <option value="">Tüm sayfalar</option>
              {data.issues.map((i) => (
                <option key={i.code} value={i.code}>
                  {ISSUE_LABEL[i.code] ?? i.code} ({i.n})
                </option>
              ))}
            </select>
            <span className="ml-auto text-xs text-ink/40">{pageRows.length} sayfa</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink/45">
                  <th className="px-5 py-2.5 font-medium">Sayfa</th>
                  <th className="py-2.5 pr-3 font-medium">Durum</th>
                  <th className="py-2.5 pr-3 font-medium">Yanıt</th>
                  <th className="py-2.5 pr-3 font-medium">Kelime</th>
                  <th className="py-2.5 pr-3 font-medium" title="Gelen iç link">İç link</th>
                  <th className="py-2.5 pr-3 font-medium" title="Ana sayfadan tık sayısı">Derinlik</th>
                  <th className="py-2.5 pr-5 font-medium">Sorun</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.slice(0, 300).map((row) => (
                  <PageRow key={row.url} row={row} open={openUrl === row.url} onToggle={() => setOpenUrl(openUrl === row.url ? null : row.url)} />
                ))}
              </tbody>
            </table>
          </div>
          {pageRows.length > 300 && <p className="border-t border-border px-5 py-2 text-xs text-ink/40">İlk 300 sayfa gösteriliyor — aramayı ya da filtreyi daraltın.</p>}
        </div>
      )}

    </div>
  );
}

function CopyCode({ code }: { code: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="relative mt-1">
      <pre className="overflow-x-auto rounded-lg bg-ink py-2.5 pl-3 pr-20 text-[11px] leading-relaxed text-white/90">{code}</pre>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard?.writeText(code).then(() => {
            setOk(true);
            setTimeout(() => setOk(false), 1500);
          });
        }}
        className="absolute right-2 top-2 rounded bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-white/20"
      >
        {ok ? "Kopyalandı" : "Kopyala"}
      </button>
    </div>
  );
}

function IssueRow({
  code,
  open,
  onToggle,
  label,
  sev,
  n,
  prev,
  pct,
  info,
  affected,
  onShowAll,
}: {
  code: string;
  open: boolean;
  onToggle: () => void;
  label: string;
  sev: Severity;
  n: number;
  prev: number | null;
  pct: number;
  info?: IssueInfo;
  affected: BulkImportRow[];
  onShowAll: () => void;
}) {
  const d = prev == null ? null : n - prev;
  return (
    <>
      <tr onClick={onToggle} className={`cursor-pointer border-t border-border hover:bg-muted/40 ${open ? "bg-muted/40" : ""}`}>
        <td className="px-5 py-3 font-medium">
          <span className="mr-1.5 inline-block text-ink/30">{open ? "▾" : "▸"}</span>
          {label}
        </td>
        <td className="py-3 pr-3">
          <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${SEV_STYLE[sev].badge}`}>{SEVERITY_LABEL[sev]}</span>
        </td>
        <td className="py-3 pr-3 text-xs text-ink/55 max-md:hidden">{info?.impact ?? "—"}</td>
        <td className="py-3 pr-3 text-right font-bold tabular-nums">{n}</td>
        <td className="py-3 pr-3 text-right tabular-nums">
          {d == null ? <span className="text-ink/30">—</span> : d === 0 ? <span className="text-ink/40">0</span> : <span className={d < 0 ? "text-seo" : "text-danger"}>{d > 0 ? `+${d}` : d}</span>}
        </td>
        <td className="py-3 pr-5 max-md:hidden">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, pct)}%`, background: SEV_STYLE[sev].color }} />
          </div>
        </td>
      </tr>
      {open && (
        <tr className="bg-muted/20">
          <td colSpan={6} className="px-5 pb-5 pt-1">
            <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
              <div className="space-y-3 text-sm">
                {info ? (
                  <>
                    <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
                      <span className="rounded bg-panel px-2 py-0.5 text-ink/60 ring-1 ring-border">Etki: {info.impact}</span>
                      <span className="rounded bg-panel px-2 py-0.5 text-ink/60 ring-1 ring-border">Zorluk: {info.effort}</span>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-ink/50">Sorun nedir?</div>
                      <p className="mt-0.5 text-ink/80">{info.what}</p>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-ink/50">Neden önemli?</div>
                      <p className="mt-0.5 text-ink/75">{info.why}</p>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-ink/50">Nasıl çözülür?</div>
                      <ol className="mt-1 space-y-1">
                        {info.steps.map((st, i) => (
                          <li key={i} className="flex gap-2 text-ink/75">
                            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-bold text-accent">{i + 1}</span>
                            <span>{st}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                    {info.example && (
                      <div>
                        <div className="text-xs font-bold text-ink/50">Örnek</div>
                        <CopyCode code={info.example} />
                      </div>
                    )}
                  </>
                ) : null}
              </div>
              <div>
                <div className="flex items-center justify-between text-xs font-bold text-ink/50">
                  <span>Etkilenen sayfalar ({affected.length})</span>
                  <button type="button" onClick={onShowAll} className="font-semibold text-accent hover:underline">Sayfa gezgininde aç →</button>
                </div>
                <div className="mt-1.5 divide-y divide-border rounded-xl border border-border bg-panel">
                  {affected.slice(0, 10).map((r) => {
                    const note = pageAdvice(code, r as any);
                    return (
                      <div key={r.url} className="px-3 py-2">
                        <a href={r.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="block truncate text-xs font-medium text-ink/75 hover:text-accent">
                          {short(r.url)}
                        </a>
                        {note && <div className="mt-0.5 truncate text-[11px] text-ink/45">{note}</div>}
                      </div>
                    );
                  })}
                  {affected.length > 10 && <div className="px-3 py-2 text-xs text-ink/40">+{affected.length - 10} sayfa daha</div>}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
