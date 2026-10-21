"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ToolPageHeader from "@/components/ToolPageHeader";

interface Site {
  url: string;
  verified: boolean;
}
interface Day {
  date: string;
  clicks: number;
  impressions: number;
}
interface Q {
  query: string;
  clicks: number;
  impressions: number;
  position: number | null;
}

export default function BingPage() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [site, setSite] = useState("");
  const [traffic, setTraffic] = useState<Day[]>([]);
  const [queries, setQueries] = useState<Q[]>([]);
  const [quota, setQuota] = useState<{ daily: number; monthly: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [submitText, setSubmitText] = useState("");
  const [submitMsg, setSubmitMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/bing")
      .then(async (r) => {
        if (r.status === 401) return (window.location.href = "/login?next=/bing");
        const d = await r.json();
        setConnected(!!d.connected);
        if (d.error) setErr(d.error);
        const list: Site[] = d.sites ?? [];
        setSites(list);
        setSite(list.find((s) => s.verified)?.url ?? list[0]?.url ?? "");
      })
      .catch(() => setConnected(false));
  }, []);

  useEffect(() => {
    if (!site) return;
    setLoading(true);
    setErr(null);
    fetch(`/api/bing?site=${encodeURIComponent(site)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setErr(d.error);
        setTraffic(d.traffic ?? []);
        setQueries(d.queries ?? []);
        setQuota(d.quota ?? null);
      })
      .catch(() => setErr("Bing verisi alınamadı"))
      .finally(() => setLoading(false));
  }, [site]);

  const totals = useMemo(() => {
    const last28 = traffic.slice(-28);
    const prev28 = traffic.slice(-56, -28);
    const sum = (a: Day[], k: "clicks" | "impressions") => a.reduce((x, d) => x + d[k], 0);
    const c = sum(last28, "clicks");
    const i = sum(last28, "impressions");
    const pc = sum(prev28, "clicks");
    return { c, i, ctr: i ? (c / i) * 100 : 0, delta: pc ? Math.round(((c - pc) / pc) * 100) : null };
  }, [traffic]);

  const shown = queries.filter((q) => !filter || q.query.toLocaleLowerCase("tr").includes(filter.toLocaleLowerCase("tr")));
  // Gösterimi yüksek ama tıklaması düşük sorgular: başlık/açıklama iyileştirme fırsatı.
  const opportunities = queries.filter((q) => q.impressions >= 50 && q.clicks / Math.max(1, q.impressions) < 0.02 && (q.position ?? 99) <= 15).slice(0, 8);

  async function submit() {
    const urls = submitText.split(/\s+/).map((x) => x.trim()).filter((x) => /^https?:\/\//.test(x));
    if (!urls.length) return setSubmitMsg({ ok: false, text: "En az bir URL yaz (https://…)." });
    setSubmitMsg(null);
    const r = await fetch("/api/bing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ site, urls }) });
    const d = await r.json();
    setSubmitMsg(r.ok ? { ok: true, text: `${d.submitted} URL Bing'e gönderildi.` } : { ok: false, text: d.error ?? "Gönderilemedi" });
    if (r.ok) setSubmitText("");
  }

  return (
    <div className="space-y-6">
      <ToolPageHeader
        breadcrumbLabel="Bing Webmaster"
        title="Bing Webmaster"
        body="Bing'deki tıklama, gösterim ve sorguların. ChatGPT arama ve Microsoft Copilot Bing indeksini kullandığı için burada görünmek AI görünürlüğünü doğrudan etkiler."
      >
        {sites.length > 0 && (
          <select value={site} onChange={(e) => setSite(e.target.value)} className="rounded-xl border border-border bg-panel px-3 py-2 text-sm">
            {sites.map((s) => (
              <option key={s.url} value={s.url}>
                {s.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                {s.verified ? "" : " (doğrulanmamış)"}
              </option>
            ))}
          </select>
        )}
      </ToolPageHeader>

      {connected === false && (
        <div className="rounded-2xl border border-border bg-panel p-8 text-center">
          <div className="font-bold">Bing Webmaster bağlı değil</div>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink/55">Ücretsiz Bing Webmaster hesabından bir API anahtarı alıp bağla; tıklama, gösterim ve sorgular burada görünür.</p>
          <Link href="/integrations" className="mt-4 inline-block rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white">
            Entegrasyonlara git
          </Link>
        </div>
      )}
      {connected && !sites.length && !err && <div className="rounded-2xl border border-border bg-panel p-6 text-sm text-ink/60">Bing Webmaster hesabında site yok. bing.com/webmasters'tan siteni ekleyip doğrula.</div>}
      {err && <div className="rounded-xl bg-danger/5 px-4 py-2.5 text-sm text-danger">{err}</div>}

      {connected && site && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Tıklama (28 gün)", totals.c.toLocaleString("tr-TR"), totals.delta !== null ? `${totals.delta >= 0 ? "▲" : "▼"} %${Math.abs(totals.delta)} önceki 28 güne göre` : ""],
              ["Gösterim (28 gün)", totals.i.toLocaleString("tr-TR"), ""],
              ["Tıklama oranı", `%${totals.ctr.toFixed(1)}`, ""],
              ["URL gönderme kotası", quota ? `${quota.daily} / gün` : "—", quota ? `${quota.monthly} / ay` : ""],
            ].map(([l, v, sub]) => (
              <div key={l} className="rounded-2xl border border-border bg-panel p-4">
                <div className="text-[11px] text-ink/50">{l}</div>
                <div className="text-2xl font-extrabold tabular-nums">{loading ? "…" : v}</div>
                {sub && <div className="text-[11px] text-ink/45">{sub}</div>}
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-border bg-panel p-5">
            <div className="mb-3 text-sm font-bold">Günlük tıklama ve gösterim</div>
            {traffic.length ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={traffic}>
                    <defs>
                      <linearGradient id="bi" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#00a4a6" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#00a4a6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="bc" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#5d16ff" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#5d16ff" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#eee" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
                    <YAxis yAxisId="i" orientation="right" tick={{ fontSize: 10 }} width={40} />
                    <YAxis yAxisId="c" tick={{ fontSize: 10 }} width={32} />
                    <Tooltip labelFormatter={(d) => new Date(String(d)).toLocaleDateString("tr-TR")} />
                    <Area yAxisId="i" type="monotone" dataKey="impressions" name="Gösterim" stroke="#00a4a6" fill="url(#bi)" strokeWidth={1.5} />
                    <Area yAxisId="c" type="monotone" dataKey="clicks" name="Tıklama" stroke="#5d16ff" fill="url(#bc)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="py-10 text-center text-sm text-ink/45">{loading ? "Yükleniyor…" : "Bu site için henüz trafik verisi yok."}</div>
            )}
          </div>

          {opportunities.length > 0 && (
            <div className="rounded-2xl border border-warn/30 bg-warn/5 p-5">
              <div className="text-sm font-bold">Tıklama fırsatları</div>
              <p className="mt-0.5 text-xs text-ink/55">Bing'de ilk 15'te görünüp neredeyse hiç tıklanmayan sorgular — sayfa başlığını ve açıklamasını bu sorguya göre yaz.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {opportunities.map((q) => (
                  <Link key={q.query} href={`/editor?new=${encodeURIComponent(q.query)}`} className="rounded-full bg-panel px-3 py-1 text-xs font-semibold text-ink/70 ring-1 ring-border hover:text-accent">
                    {q.query} · {q.impressions} gösterim
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
            <div className="overflow-hidden rounded-2xl border border-border bg-panel">
              <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
                <div className="text-sm font-bold">Sorgular ({queries.length})</div>
                <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Sorgularda ara…" className="w-48 rounded-lg border border-border bg-muted px-2.5 py-1.5 text-xs outline-none focus:border-accent" />
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-ink/45">
                    <th className="px-5 py-2 font-semibold">Sorgu</th>
                    <th className="py-2 pr-3 text-right font-semibold">Tıklama</th>
                    <th className="py-2 pr-3 text-right font-semibold">Gösterim</th>
                    <th className="py-2 pr-5 text-right font-semibold">Ort. sıra</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {shown.slice(0, 100).map((q) => (
                    <tr key={q.query}>
                      <td className="px-5 py-2">{q.query}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{q.clicks}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{q.impressions}</td>
                      <td className="py-2 pr-5 text-right tabular-nums">{q.position ?? "—"}</td>
                    </tr>
                  ))}
                  {!shown.length && (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-sm text-ink/45">
                        {loading ? "Yükleniyor…" : "Sorgu verisi yok."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="h-fit space-y-3 rounded-2xl border border-border bg-panel p-5">
              <div className="text-sm font-bold">Bing'e URL gönder</div>
              <p className="text-xs text-ink/55">Yeni ya da güncellenen sayfaları Bing'in hemen taramasını iste. Her satıra bir adres.</p>
              <textarea value={submitText} onChange={(e) => setSubmitText(e.target.value)} rows={6} placeholder={`${site.replace(/\/$/, "")}/yeni-yazi`} className="w-full rounded-xl border border-border bg-muted px-3 py-2 text-xs outline-none focus:border-accent" />
              <button type="button" onClick={submit} className="w-full rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white">
                Gönder
              </button>
              {submitMsg && <div className={`rounded-lg px-3 py-2 text-xs ${submitMsg.ok ? "bg-seo/5 text-seo" : "bg-danger/5 text-danger"}`}>{submitMsg.text}</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
