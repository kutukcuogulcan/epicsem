"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Link from "next/link";
import { Drawer, ErrorBlock, PageHeader } from "@/components/ui";

interface MonitorCheck {
  id: number;
  score: number;
  aiCrawlScore: number;
  blockedBots: string[];
  createdAt: string;
}

interface MonitoredPage {
  id: number;
  url: string;
  label: string | null;
  slackWebhook: string | null;
  createdAt: string;
  latestCheck: MonitorCheck | null;
}

interface AlertRow {
  id: number;
  monitoredPageId: number;
  message: string;
  acknowledged: boolean;
  createdAt: string;
  url: string;
}

export default function MonitorPage() {
  const [pages, setPages] = useState<MonitoredPage[] | null>(null);
  const [alerts, setAlerts] = useState<AlertRow[] | null>(null);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [slackWebhook, setSlackWebhook] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedTrend, setExpandedTrend] = useState<number | null>(null);
  const [trendData, setTrendData] = useState<Record<number, MonitorCheck[]>>({});
  const [trendLoading, setTrendLoading] = useState<number | null>(null);

  function redirectToLogin() {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }

  async function toggleTrend(pageId: number) {
    if (expandedTrend === pageId) {
      setExpandedTrend(null);
      return;
    }
    setExpandedTrend(pageId);
    if (trendData[pageId]) return;
    setTrendLoading(pageId);
    try {
      const res = await fetch(`/api/monitor/history?pageId=${pageId}`);
      if (res.status === 401) {
        redirectToLogin();
        return;
      }
      const data = await res.json();
      setTrendData((prev) => ({ ...prev, [pageId]: data.history ?? [] }));
    } finally {
      setTrendLoading(null);
    }
  }

  const [rk, setRk] = useState(0);

  async function refresh() {
    setRk((k) => k + 1);
    const [pagesRes, alertsRes] = await Promise.all([fetch("/api/monitor"), fetch("/api/monitor/alerts")]);
    if (pagesRes.status === 401 || alertsRes.status === 401) {
      redirectToLogin();
      return;
    }
    const pagesData = await pagesRes.json();
    const alertsData = await alertsRes.json();
    setPages(pagesData.pages ?? []);
    setAlerts(alertsData.alerts ?? []);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function addPage(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) {
      setError("İzlenecek bir URL girin.");
      return;
    }
    setBusy("add");
    setError(null);
    try {
      const res = await fetch("/api/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, label: label || undefined, slackWebhook: slackWebhook || undefined }),
      });
      if (res.status === 401) {
        redirectToLogin();
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sayfa eklenemedi");
      setUrl("");
      setLabel("");
      setSlackWebhook("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti");
    } finally {
      setBusy(null);
    }
  }

  async function removePage(id: number) {
    setBusy(`remove-${id}`);
    try {
      const res = await fetch("/api/monitor", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.status === 401) {
        redirectToLogin();
        return;
      }
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function checkNow(id?: number) {
    setBusy(id ? `check-${id}` : "check-all");
    setError(null);
    try {
      const res = await fetch("/api/monitor/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { pageId: id } : { all: true }),
      });
      if (res.status === 401) {
        redirectToLogin();
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Kontrol başarısız oldu");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti");
    } finally {
      setBusy(null);
    }
  }

  async function ackAlert(id: number) {
    const res = await fetch("/api/monitor/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.status === 401) {
      redirectToLogin();
      return;
    }
    await refresh();
  }

  const [sel, setSel] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [f, setF] = useState<"all" | "blocked" | "ok" | "new">("all");
  const BTN1 = "inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-accent px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60";
  const BTN2 = "inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-panel px-3 text-sm font-medium text-ink shadow-[inset_0_0_0_1px_#D5D7DA,0_1px_2px_rgba(13,18,28,0.05)] hover:bg-muted disabled:opacity-50";
  const CARD = "rounded-2xl border border-border bg-panel shadow-[0_1px_2px_rgba(13,18,28,0.05)]";
  const INPUT = "h-9 w-full rounded-[10px] border border-border bg-panel px-3 text-sm outline-none focus:border-[#BDB4FF]";
  const chip = (on: boolean) =>
    `inline-flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-[13px] font-medium whitespace-nowrap ${on ? "bg-accent/5 text-ink shadow-[inset_0_0_0_1px_#BDB4FF]" : "bg-panel text-sub shadow-[inset_0_0_0_1px_#E4E5E8] hover:text-ink"}`;
  const tone = (n: number) => (n >= 80 ? "bg-seo/10 text-seo" : n >= 60 ? "bg-warn/10 text-warn" : "bg-danger/10 text-danger");

  const list = pages ?? [];
  const checked = list.filter((p) => p.latestCheck);
  const blocked = checked.filter((p) => p.latestCheck!.blockedBots.length > 0);
  const avg = (k: "score" | "aiCrawlScore") => (checked.length ? Math.round(checked.reduce((a, p) => a + p.latestCheck![k], 0) / checked.length) : null);
  const openAlerts = (alerts ?? []).filter((a) => !a.acknowledged);
  const lastCheck = checked.map((p) => p.latestCheck!.createdAt).sort().pop();
  const shown = list.filter((p) => (f === "blocked" ? blocked.includes(p) : f === "ok" ? p.latestCheck && !p.latestCheck.blockedBots.length : f === "new" ? !p.latestCheck : true));
  const selPage = list.find((p) => p.id === sel) ?? null;
  const host = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "");

  function openPage(id: number) {
    setSel(id);
    if (expandedTrend !== id) toggleTrend(id);
  }

  const actions: { kind: string; color: string; title: string; body: string; cta: React.ReactNode }[] = [];
  if (blocked.length)
    actions.push({
      kind: "Kritik",
      color: "text-danger",
      title: `${blocked.length} sayfada AI botu engelli`,
      body: `${host(blocked[0].url)}: ${blocked[0].latestCheck!.blockedBots.slice(0, 3).join(", ")}. Bu sayfa ChatGPT/Claude cevaplarında kaynak olamaz; robots.txt ya da CDN kuralını kontrol et.`,
      cta: <button type="button" onClick={() => openPage(blocked[0].id)} className={BTN2}>Detayı aç</button>,
    });
  const unchecked = list.filter((p) => !p.latestCheck);
  if (unchecked.length)
    actions.push({
      kind: "Başla",
      color: "text-accent",
      title: `${unchecked.length} sayfa henüz kontrol edilmedi`,
      body: "İlk kontrol başlangıç kaydını oluşturur; sonraki günlük kontroller bu kayda göre değişimi yakalar.",
      cta: <button type="button" onClick={() => checkNow()} className={BTN2}>Hepsini kontrol et</button>,
    });
  if (list.length < 3)
    actions.push({
      kind: "Kapsam",
      color: "text-seo",
      title: "Kritik sayfalarını ekle",
      body: "Ana sayfa, en çok trafik alan blog yazısı ve fiyat/ürün sayfası. Engelleme genelde tüm siteyi değil bazı yolları etkiler.",
      cta: <button type="button" onClick={() => setAddOpen(true)} className={BTN2}>Sayfa ekle</button>,
    });
  if (!actions.length)
    actions.push({
      kind: "İyi",
      color: "text-seo",
      title: "Tüm sayfalar AI botlarına açık",
      body: "Kontroller her gün otomatik çalışır. Bir bot engellenirse burada ve Slack'te uyarı görürsün.",
      cta: <button type="button" onClick={() => checkNow()} className={BTN2}>Şimdi kontrol et</button>,
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title={list.length ? "AI botları sayfalarına hâlâ ulaşabiliyor mu?" : "Sayfa İzleme"}
        description={
          list.length
            ? `${list.length} sayfa izleniyor${lastCheck ? ` · son kontrol ${new Date(lastCheck).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""} · her gün otomatik`
            : "robots.txt ya da CDN kuralı değişip GPTBot, ClaudeBot, PerplexityBot engellenirse haftalar sonra değil, o gün haber al."
        }
        actions={
          <div className="flex items-center gap-2">
            {list.length > 0 && (
              <button type="button" onClick={() => checkNow()} disabled={busy === "check-all"} className={BTN2}>
                {busy === "check-all" ? "Kontrol ediliyor…" : "↻ Hepsini kontrol et"}
              </button>
            )}
            <button type="button" onClick={() => setAddOpen(true)} className={BTN1}>
              + Sayfa ekle
            </button>
          </div>
        }
      />

      <ErrorBlock message={error} />

      {openAlerts.length > 0 && (
        <div className="space-y-2">
          {openAlerts.map((a) => (
            <div key={a.id} className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-[13px]">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-danger" />
              <div className="min-w-0 flex-1">
                <div>{a.message}</div>
                <div className="text-[11px] text-sub">{new Date(a.createdAt).toLocaleString("tr-TR")}</div>
              </div>
              <button type="button" onClick={() => ackAlert(a.id)} className={BTN2}>
                Gördüm
              </button>
            </div>
          ))}
        </div>
      )}

      {pages === null && <div className="h-64 animate-pulse rounded-2xl bg-muted" />}

      {pages && list.length === 0 && (
        <div className={`${CARD} px-6 py-10 text-center`}>
          <div className="text-base font-semibold">Henüz izlenen sayfa yok</div>
          <p className="mx-auto mt-1 max-w-lg text-sm text-sub">Engelleme sessizce olur: bir WAF ya da CDN güncellemesi GPTBot&apos;u fark ettirmeden kapatabilir. Kritik sayfalarını ekle, her gün kontrol edelim.</p>
          <button type="button" onClick={() => setAddOpen(true)} className={`${BTN1} mt-4`}>
            + Sayfa ekle
          </button>
        </div>
      )}

      {pages && list.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {([
              ["İzlenen sayfa", String(list.length), "", `${checked.length} kontrol edildi`, ""],
              ["AI'ya kapalı", String(blocked.length), `/${checked.length || list.length}`, "en az bir bot engelli", blocked.length ? "text-danger" : "text-seo"],
              ["Ort. AXO", avg("aiCrawlScore") !== null ? String(avg("aiCrawlScore")) : "—", "/100", "AI erişim puanı", ""],
              ["Ort. SEO", avg("score") !== null ? String(avg("score")) : "—", "/100", "teknik puan", ""],
              ["Açık uyarı", String(openAlerts.length), "", "onaylanmamış", openAlerts.length ? "text-danger" : ""],
            ] as const).map(([l, v, suf, hint, col]) => (
              <div key={l} className={`${CARD} px-4 py-4`}>
                <div className="text-xs font-medium text-sub">{l}</div>
                <div className="mt-1.5 flex items-baseline gap-1">
                  <span className={`text-[26px] font-semibold leading-8 tabular-nums ${col}`}>{v}</span>
                  {suf && <span className="text-sm text-sub">{suf}</span>}
                </div>
                <div className="mt-1 h-4 text-[11px] text-sub">{hint}</div>
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
            <div className="flex flex-wrap items-center gap-2 px-5 py-3">
              {([
                ["all", "Tümü", list.length],
                ["blocked", "AI'ya kapalı", blocked.length],
                ["ok", "Açık", checked.length - blocked.length],
                ["new", "Kontrol edilmedi", unchecked.length],
              ] as const).map(([k, l, n]) => (
                <button key={k} type="button" onClick={() => setF(k)} className={chip(f === k)}>
                  {l} <span className="text-sub">{n}</span>
                </button>
              ))}
            </div>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-y border-border bg-[#fafafa] text-left text-xs text-sub">
                  <th className="py-2 pl-5 font-medium">Sayfa</th>
                  <th className="py-2 pr-3 font-medium">Durum</th>
                  <th className="py-2 pr-3 text-right font-medium">SEO</th>
                  <th className="py-2 pr-3 text-right font-medium">AXO</th>
                  <th className="hidden py-2 pr-3 font-medium md:table-cell">Son kontrol</th>
                  <th className="py-2 pr-5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((p) => {
                  const c = p.latestCheck;
                  return (
                    <tr key={p.id} onClick={() => openPage(p.id)} className="cursor-pointer hover:bg-[#fafafa]">
                      <td className="max-w-[24rem] py-2.5 pl-5">
                        <div className="truncate font-medium">{p.label || host(p.url)}</div>
                        {p.label && <div className="truncate text-[11px] text-sub">{host(p.url)}</div>}
                      </td>
                      <td className="py-2.5 pr-3">
                        {!c ? (
                          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-sub">Kontrol edilmedi</span>
                        ) : c.blockedBots.length ? (
                          <span className="rounded-md bg-danger/10 px-2 py-0.5 text-[11px] font-medium text-danger">{c.blockedBots.length} bot engelli</span>
                        ) : (
                          <span className="rounded-md bg-seo/10 px-2 py-0.5 text-[11px] font-medium text-seo">AI&apos;ya açık</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-right">{c ? <span className={`rounded-md px-2 py-0.5 text-xs font-medium tabular-nums ${tone(c.score)}`}>{c.score}</span> : "—"}</td>
                      <td className="py-2.5 pr-3 text-right">{c ? <span className={`rounded-md px-2 py-0.5 text-xs font-medium tabular-nums ${tone(c.aiCrawlScore)}`}>{c.aiCrawlScore}</span> : "—"}</td>
                      <td className="hidden py-2.5 pr-3 text-xs text-sub md:table-cell">{c ? new Date(c.createdAt).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                      <td className="whitespace-nowrap py-2.5 pr-5 text-right text-xs">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            checkNow(p.id);
                          }}
                          disabled={busy === `check-${p.id}`}
                          className="font-medium text-accent hover:underline disabled:opacity-50"
                        >
                          {busy === `check-${p.id}` ? "Kontrol…" : "Kontrol et"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Sayfa detayı */}
      <Drawer isOpen={!!selPage} onClose={() => setSel(null)} eyebrow="İzlenen sayfa" title={selPage ? selPage.label || host(selPage.url) : ""} subtitle={selPage ? selPage.url : undefined} size="lg">
        {selPage && (
          <div className="space-y-5 text-[13px]">
            {selPage.latestCheck ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ["SEO", selPage.latestCheck.score],
                    ["AXO", selPage.latestCheck.aiCrawlScore],
                    ["Engelli bot", selPage.latestCheck.blockedBots.length],
                  ] as const).map(([l, v]) => (
                    <div key={l} className="rounded-xl border border-border px-3 py-2">
                      <div className="text-[11px] text-sub">{l}</div>
                      <div className="text-lg font-semibold tabular-nums">{v}</div>
                    </div>
                  ))}
                </div>
                {selPage.latestCheck.blockedBots.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-xs font-medium text-sub">Engellenen botlar</div>
                    <div className="flex flex-wrap gap-1.5">
                      {selPage.latestCheck.blockedBots.map((b) => (
                        <span key={b} className="rounded-md bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                          {b}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sub">Henüz kontrol edilmedi.</p>
            )}
            <div>
              <div className="mb-1.5 text-xs font-medium text-sub">Puan geçmişi</div>
              {trendLoading === selPage.id ? (
                <p className="text-sub">Yükleniyor…</p>
              ) : (trendData[selPage.id]?.length ?? 0) < 2 ? (
                <p className="text-sub">Grafik için en az iki kontrol gerekiyor; kontroller her gün otomatik çalışır.</p>
              ) : (
                <div className="h-48 rounded-xl border border-border p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData[selPage.id].map((c) => ({ date: new Date(c.createdAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }), SEO: c.score, AXO: c.aiCrawlScore }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f2" vertical={false} />
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={11} domain={[0, 100]} width={28} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e9eaeb", borderRadius: 12, fontSize: 12 }} />
                      <Legend />
                      <Line type="monotone" dataKey="SEO" stroke="#4f00ff" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="AXO" stroke="#16a34a" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <button type="button" onClick={() => checkNow(selPage.id)} disabled={busy === `check-${selPage.id}`} className={BTN1}>
                {busy === `check-${selPage.id}` ? "Kontrol ediliyor…" : "Şimdi kontrol et"}
              </button>
              <Link href={`/audit?url=${encodeURIComponent(selPage.url)}`} className={BTN2}>
                Tam denetim
              </Link>
              <button
                type="button"
                onClick={() => {
                  removePage(selPage.id);
                  setSel(null);
                }}
                className="ml-auto text-xs font-medium text-danger/70 hover:text-danger"
              >
                İzlemeyi bırak
              </button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Sayfa ekle */}
      <Drawer
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        eyebrow="Sayfa İzleme"
        title="İzlenecek sayfa ekle"
        subtitle="Her gün kontrol edilir; bir AI botu engellenirse uyarı oluşur (Slack webhook verirsen oraya da gider). Yapay zekâ kullanmaz."
        size="md"
        as="form"
        onSubmit={async (e: React.FormEvent) => {
          await addPage(e);
          setAddOpen(false);
        }}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAddOpen(false)} className={BTN2}>
              Vazgeç
            </button>
            <button type="submit" disabled={busy === "add"} className={BTN1}>
              {busy === "add" ? "Ekleniyor…" : "Ekle"}
            </button>
          </div>
        }
      >
        <div className="space-y-4 text-[13px]">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-sub">Sayfa adresi</div>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="siten.com/kritik-sayfa" required className={INPUT} />
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-sub">Etiket (opsiyonel)</div>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ör. Ana sayfa, Fiyatlar" className={INPUT} />
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-sub">Slack webhook (opsiyonel)</div>
            <input value={slackWebhook} onChange={(e) => setSlackWebhook(e.target.value)} placeholder="https://hooks.slack.com/…" className={INPUT} />
          </div>
        </div>
      </Drawer>
    </div>
  );
}
