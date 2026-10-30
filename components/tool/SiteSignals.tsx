"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { BulkImportRow } from "@/types";
import type { PageSpeedResult } from "@/lib/pagespeed";

const CAT_TONE: Record<string, string> = { FAST: "bg-seo/10 text-seo", AVERAGE: "bg-warn/10 text-warn", SLOW: "bg-danger/10 text-danger" };
const CAT_LABEL: Record<string, string> = { FAST: "İyi", AVERAGE: "Geliştirilmeli", SLOW: "Kötü" };

function fmt(key: string, v: number | null) {
  if (v === null) return "—";
  if (key === "CLS") return v.toFixed(2).replace(".", ",");
  return v >= 1000 ? `${(v / 1000).toFixed(1).replace(".", ",")} sn` : `${Math.round(v)} ms`;
}

/**
 * Site Taraması genel bakışındaki iki dış veri kartı:
 *  - Gerçek kullanıcı hızı (PageSpeed Insights / Chrome UX Report)
 *  - Arama motorlarına bildir (IndexNow + Bing Webmaster)
 */
export default function SiteSignals({ rows, host: siteName }: { rows: BulkImportRow[]; host: string }) {
  const firstUrl = rows.find((r) => r.statusCode === 200)?.url;
  let host = siteName;
  try {
    if (firstUrl) host = new URL(firstUrl).host;
  } catch {
    /* site adını kullan */
  }
  const home = rows.find((r) => r.statusCode === 200 && /^https?:\/\/[^/]+\/?$/.test(r.url))?.url ?? rows.find((r) => r.statusCode === 200)?.url ?? `https://${host}/`;
  const local = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.)/.test(host);
  const [strategy, setStrategy] = useState<"mobile" | "desktop">("mobile");
  const [psi, setPsi] = useState<PageSpeedResult | null>(null);
  const [psiBusy, setPsiBusy] = useState(false);
  const [psiErr, setPsiErr] = useState<string | null>(null);

  const indexable = rows.filter((r) => r.statusCode === 200 && r.indexable !== false).map((r) => r.url);
  const [inReady, setInReady] = useState<boolean | null>(null);
  const [bingOk, setBingOk] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendMsg, setSendMsg] = useState<{ ok: boolean; text: string }[] | null>(null);

  useEffect(() => {
    fetch(`/api/indexnow?site=${encodeURIComponent(host)}`)
      .then((r) => (r.ok ? r.json() : { ready: false }))
      .then((d) => setInReady(!!d.ready))
      .catch(() => setInReady(false));
    fetch("/api/bing")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setBingOk(!!d?.connected && (d.sites ?? []).some((s: { url: string }) => s.url.includes(host.replace(/^www\./, "")))))
      .catch(() => {});
  }, [host]);

  async function measure(st: "mobile" | "desktop") {
    setStrategy(st);
    setPsiBusy(true);
    setPsiErr(null);
    try {
      const r = await fetch(`/api/pagespeed?url=${encodeURIComponent(home)}&strategy=${st}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Ölçüm başarısız");
      setPsi(d);
    } catch (e) {
      setPsiErr(e instanceof Error ? e.message : "Ölçüm başarısız");
    } finally {
      setPsiBusy(false);
    }
  }

  async function notify() {
    setSendBusy(true);
    setSendMsg(null);
    const out: { ok: boolean; text: string }[] = [];
    try {
      if (inReady) {
        const r = await fetch("/api/indexnow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ urls: indexable }) });
        const d = await r.json();
        if (!r.ok) out.push({ ok: false, text: `IndexNow: ${d.error}` });
        for (const x of d.results ?? []) out.push({ ok: x.ok, text: `IndexNow (Bing, Yandex, Seznam, Naver): ${x.ok ? `${x.count} URL · ` : ""}${x.detail}` });
      }
      if (bingOk) {
        const sitesRes = await fetch("/api/bing").then((r) => r.json());
        const siteUrl = (sitesRes.sites ?? []).find((s: { url: string }) => s.url.includes(host.replace(/^www\./, "")))?.url;
        if (siteUrl) {
          const r = await fetch("/api/bing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ site: siteUrl, urls: indexable.slice(0, 100) }) });
          const d = await r.json();
          out.push({ ok: r.ok, text: r.ok ? `Bing Webmaster: ${d.submitted} URL tarama sırasına alındı.` : `Bing Webmaster: ${d.error}` });
        }
      }
    } finally {
      setSendMsg(out);
      setSendBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
      <div className="rounded-xl border border-border bg-panel shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
          <div>
            <div className="text-sm font-bold">Gerçek kullanıcı hızı</div>
            <div className="text-[11px] text-ink/45">Google Chrome kullanıcılarının son 28 günü · Core Web Vitals</div>
          </div>
          <div className="flex rounded-lg border border-border p-0.5 text-[11px] font-semibold">
            {(["mobile", "desktop"] as const).map((st) => (
              <button key={st} type="button" disabled={psiBusy || local} onClick={() => measure(st)} className={`rounded-md px-2.5 py-1 disabled:opacity-40 ${psi && strategy === st ? "bg-ink text-white" : "text-ink/60 hover:text-ink"}`}>
                {st === "mobile" ? "Mobil" : "Masaüstü"}
              </button>
            ))}
          </div>
        </div>
        <div className="p-5">
          {local ? (
            <p className="text-sm text-ink/50">Yerel adresler Google tarafından ölçülemez.</p>
          ) : !psi && !psiBusy ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-md text-sm text-ink/55">Ana sayfanın gerçek ziyaretçi hız verisini Google&apos;dan çek: LCP, INP, CLS. Ücretsiz; yaklaşık 20–40 saniye sürer.</p>
              <button type="button" onClick={() => measure("mobile")} className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white">
                Hızı ölç
              </button>
            </div>
          ) : psiBusy ? (
            <div className="flex items-center gap-2 text-sm text-ink/55">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              Google ölçüyor… ({strategy === "mobile" ? "mobil" : "masaüstü"})
            </div>
          ) : psi ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${psi.passed === true ? "bg-seo/10 text-seo" : psi.passed === false ? "bg-danger/10 text-danger" : "bg-muted text-ink/55"}`}>
                  {psi.passed === true ? "Core Web Vitals: geçti" : psi.passed === false ? "Core Web Vitals: kaldı" : "Yeterli gerçek kullanıcı verisi yok"}
                </span>
                <span className="text-[11px] text-ink/45">
                  {psi.fieldScope === "url" ? "Bu sayfanın verisi" : psi.fieldScope === "origin" ? "Tüm sitenin verisi (sayfa için yeterli ziyaret yok)" : "Aşağıdaki değerler laboratuvar ölçümü"}
                </span>
                {psi.labScore !== null && (
                  <span className="ml-auto text-xs text-ink/55">
                    Lighthouse performans: <strong className={psi.labScore >= 90 ? "text-seo" : psi.labScore >= 50 ? "text-warn" : "text-danger"}>{psi.labScore}</strong>
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {psi.metrics.map((m) => (
                  <div key={m.key} className="rounded-xl border border-border p-3">
                    <div className="text-[10px] leading-3 text-ink/50">{m.label}</div>
                    <div className="mt-1 text-lg font-semibold tabular-nums">{fmt(m.key, m.p75)}</div>
                    {m.category ? <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${CAT_TONE[m.category]}`}>{CAT_LABEL[m.category]}</span> : <span className="text-[10px] text-ink/35">hedef {m.good}</span>}
                  </div>
                ))}
              </div>
              {psi.opportunities.length > 0 && (
                <div>
                  <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">En çok kazandıracak düzeltmeler</div>
                  <ul className="space-y-1 text-sm">
                    {psi.opportunities.map((o) => (
                      <li key={o.title} className="flex justify-between gap-3">
                        <span className="text-ink/70">{o.title}</span>
                        <span className="shrink-0 tabular-nums text-ink/45">~{(o.savingsMs / 1000).toFixed(1).replace(".", ",")} sn</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
          {psiErr && <p className="mt-3 rounded-lg bg-danger/5 px-3 py-2 text-xs text-danger">{psiErr}</p>}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-panel shadow-sm">
        <div className="border-b border-border px-5 py-3">
          <div className="text-sm font-bold">Arama motorlarına bildir</div>
          <div className="text-[11px] text-ink/45">ChatGPT arama ve Copilot, Bing indeksini kullanır</div>
        </div>
        <div className="space-y-3 p-5">
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <span>IndexNow</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${inReady ? "bg-seo/10 text-seo" : "bg-muted text-ink/50"}`}>{inReady === null ? "…" : inReady ? "Hazır" : "Kurulu değil"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Bing Webmaster</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${bingOk ? "bg-seo/10 text-seo" : "bg-muted text-ink/50"}`}>{bingOk ? "Bağlı" : "Bağlı değil"}</span>
            </div>
          </div>
          {inReady || bingOk ? (
            <button type="button" onClick={notify} disabled={sendBusy || !indexable.length} className="w-full rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              {sendBusy ? "Gönderiliyor…" : `${indexable.length} indekslenebilir sayfayı bildir`}
            </button>
          ) : (
            <p className="text-xs leading-5 text-ink/55">
              <Link href="/integrations" className="font-semibold text-accent">IndexNow&apos;ı kur</Link> (ücretsiz, hesap yok) ya da WordPress&apos;te Epicsem Connector 1.2&apos;yi yükle; yeni sayfalar arama motorlarına anında bildirilsin.
            </p>
          )}
          {sendMsg?.map((m, i) => (
            <div key={i} className={`rounded-lg px-3 py-2 text-xs ${m.ok ? "bg-seo/5 text-seo" : "bg-danger/5 text-danger"}`}>
              {m.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
