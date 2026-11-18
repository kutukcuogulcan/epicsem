"use client";

import Link from "next/link";
import { useState } from "react";
import type { FreeCheckResult } from "@/app/api/free-check/route";

const CARD = "rounded-2xl border border-border bg-panel shadow-[0_1px_2px_rgba(13,18,28,0.05)]";
const BTN1 = "inline-flex h-11 items-center justify-center gap-1.5 rounded-[12px] bg-accent px-5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60";

const color = (n: number) => (n >= 75 ? "#12b76a" : n >= 50 ? "#f79009" : "#f04438");
const verdict = (n: number) =>
  n >= 75 ? "AI motorlarına büyük ölçüde hazır" : n >= 50 ? "Kısmen hazır — birkaç önemli eksik var" : "AI cevaplarında kaynak gösterilmesi zor";

const FAQ: [string, string][] = [
  ["Bu test neyi ölçüyor?", "Sitenin ana sayfasında, AI motorlarının siteyi okuyup kaynak gösterebilmesi için gereken teknik ve içerik şartlarını: AI botlarına erişim, llms.txt, yapısal veri, doğrudan cevap veren içerik, meta bilgiler, site haritası ve güven sinyalleri."],
  ["ChatGPT'de görünüp görünmediğimi gösteriyor mu?", "Hayır. Bu test hazırlığı ölçer. Markanın gerçek AI cevaplarında kaç kez, kaçıncı sırada ve hangi kaynaklarla anıldığını Epicsem'in GEO Görünürlük aracı ölçer."],
  ["Ücretli mi?", "Hayır. Test yapay zekâ kullanmaz, ücretsizdir. Saatte 5 test yapılabilir."],
];

export default function FreeCheck() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [r, setR] = useState<FreeCheckResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (url.trim().length < 4) return;
    setBusy(true);
    setErr(null);
    setR(null);
    try {
      const res = await fetch("/api/free-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Test yapılamadı");
      setR(d.result);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Test yapılamadı");
    } finally {
      setBusy(false);
    }
  }

  const signup = r ? `/login?next=${encodeURIComponent(`/onboarding?url=${r.host}`)}` : "/login?next=/onboarding";
  const dash = 2 * Math.PI * 52;

  return (
    <div className="mx-auto max-w-4xl px-5 pb-20 pt-14">
      <div className="text-center">
        <span className="inline-flex rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">Ücretsiz · kayıt gerekmez · 30 saniye</span>
        <h1 className="mx-auto mt-4 max-w-2xl text-[34px] font-semibold leading-tight tracking-tight text-ink md:text-[44px]">Siten ChatGPT ve Gemini&apos;de görünmeye hazır mı?</h1>
        <p className="mx-auto mt-3 max-w-xl text-[15px] text-sub">
          Adresini yaz; AI botlarının siteye girip girmediğini, llms.txt, yapısal veri ve AI&apos;ın alıntılayabileceği içerik yapısını kontrol edelim.
        </p>
      </div>

      <form onSubmit={run} className={`${CARD} mx-auto mt-8 flex max-w-2xl items-center gap-2 p-2 pl-4`}>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="siteniz.com" aria-label="Site adresi" className="min-w-0 flex-1 bg-transparent py-2 text-[15px] outline-none" />
        <button type="submit" disabled={busy || url.trim().length < 4} className={BTN1}>
          {busy ? "Test ediliyor…" : "Ücretsiz test et"}
        </button>
      </form>
      {err && <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-danger">{err}</p>}
      {busy && (
        <div className="mx-auto mt-6 flex max-w-2xl items-center justify-center gap-3 text-sm text-sub">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          Ana sayfa, robots.txt, sitemap ve llms.txt okunuyor…
        </div>
      )}

      {r && (
        <div className="mt-10 space-y-4">
          <div className={`${CARD} grid items-center gap-6 p-6 md:grid-cols-[180px_1fr]`}>
            <div className="relative mx-auto h-[140px] w-[140px]">
              <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                <circle cx="60" cy="60" r="52" fill="none" stroke="#F1F1F3" strokeWidth="10" />
                <circle cx="60" cy="60" r="52" fill="none" stroke={color(r.score)} strokeWidth="10" strokeLinecap="round" strokeDasharray={dash} strokeDashoffset={dash * (1 - r.score / 100)} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[34px] font-semibold tabular-nums" style={{ color: color(r.score) }}>
                  {r.score}
                </span>
                <span className="text-xs text-sub">/100</span>
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-sub">AI hazırlık puanı · {r.host}</div>
              <h2 className="mt-1 text-xl font-semibold">{verdict(r.score)}</h2>
              <p className="mt-1 text-[13px] text-sub">
                {r.items.filter((i) => i.ok).length}/{r.items.length} kontrol geçti. Bu puan hazırlığı ölçer; markanın gerçek AI cevaplarında anılıp anılmadığını ölçmez.
              </p>
            </div>
          </div>

          <div className={`${CARD} overflow-hidden`}>
            {r.items.map((i) => (
              <div key={i.key} className="flex items-start gap-3 border-t border-border px-5 py-3 first:border-t-0">
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${i.ok ? "bg-seo" : i.partial ? "bg-warn" : "bg-danger"}`}>{i.ok ? "✓" : i.partial ? "!" : "✕"}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium">{i.label}</div>
                  <div className="text-[12px] text-sub">{i.detail}</div>
                </div>
                <span className="shrink-0 text-xs tabular-nums text-sub">{i.ok ? i.weight : i.partial ? i.weight / 2 : 0}/{i.weight}</span>
              </div>
            ))}
          </div>

          {r.fixes.length > 0 && (
            <div className={`${CARD} p-5`}>
              <h3 className="text-sm font-semibold">Önce bunları düzelt</h3>
              <ol className="mt-3 space-y-2.5">
                {r.fixes.map((f, n) => (
                  <li key={f.title} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-semibold text-accent">{n + 1}</span>
                    <div>
                      <div className="text-[14px] font-medium">{f.title}</div>
                      <div className="text-[12px] text-sub">{f.why}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="flex flex-col items-center gap-4 rounded-2xl border border-[#BDB4FF] bg-accent/[0.04] p-6 text-center md:flex-row md:text-left">
            <div className="flex-1">
              <h3 className="text-base font-semibold">Tam rapor, hazır kodlar ve gerçek AI görünürlüğü</h3>
              <p className="mt-1 text-[13px] text-sub">Ücretsiz hesapla: tüm sorunlar ve kopyala-yapıştır düzeltmeler, ChatGPT/Gemini/Perplexity&apos;de markanın kaç kez anıldığı, rakiplerinin hangi kaynaklarla öne çıktığı ve aksiyon planı.</p>
            </div>
            <Link href={signup} className={BTN1}>
              Ücretsiz başla →
            </Link>
          </div>
        </div>
      )}

      <div className="mx-auto mt-14 max-w-2xl">
        <h2 className="text-lg font-semibold">Sık sorulanlar</h2>
        <div className="mt-3 divide-y divide-border">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between text-[14px] font-medium">
                {q}
                <span className="text-sub transition group-open:rotate-180">▾</span>
              </summary>
              <p className="mt-2 text-[13px] leading-6 text-sub">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
