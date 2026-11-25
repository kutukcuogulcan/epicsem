"use client";

import Link from "next/link";
import { useState } from "react";
import { parseAiLog, type AiLogReport } from "@/lib/ai-log";
import { BTN1, BTN2, CARD, StandardTable, StatCard } from "@/components/ui";

/** GEO → "AI bot ziyaretleri": sunucu kaydından AI botları ve AI'dan gelen ziyaretçiler. Dosya tarayıcıda okunur, AI yok. */

const ROLE: Record<string, string> = { citation: "AI arama", fetch: "Canlı okuma", training: "Eğitim" };
const MAX = 200 * 1024 * 1024;

export default function AiLogTab() {
  const [r, setR] = useState<AiLogReport | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load(f: File | undefined) {
    if (!f) return;
    if (f.size > MAX) return setErr("Dosya 200 MB'tan büyük. Son birkaç günün kaydını yükle.");
    if (/\.gz$/i.test(f.name)) return setErr("Sıkıştırılmış (.gz) dosyayı önce aç, .log hâlini yükle.");
    setBusy(true);
    setErr(null);
    try {
      const rep = parseAiLog(await f.text());
      if (!rep.parsed) setErr("Bu dosyada Apache/Nginx (\"combined\") ya da Cloudflare Logpush (JSON) kaydı satırı bulunamadı.");
      setR(rep.parsed ? rep : null);
      setName(f.name);
    } catch {
      setErr("Dosya okunamadı.");
    } finally {
      setBusy(false);
    }
  }

  const picker = (
    <label className={`${r ? BTN2 : BTN1} cursor-pointer`}>
      {busy ? "Okunuyor…" : r ? "Başka dosya" : "Erişim kaydı yükle"}
      <input type="file" accept=".log,.txt,.json,.ndjson,text/plain,application/json" className="sr-only" onChange={(e) => load(e.target.files?.[0])} />
    </label>
  );

  if (!r)
    return (
      <div className={`${CARD} px-6 py-10 text-center`}>
        <h3 className="text-base font-semibold">AI botları siteni ne kadar geziyor?</h3>
        <p className="mx-auto mt-1 max-w-lg text-[13px] text-sub">
          Sunucunun erişim kaydını (access.log) yükle: ChatGPT, Perplexity, Claude, Gemini botlarının hangi sayfaları okuduğunu, hangilerinde hata aldığını ve AI&apos;dan sitene kaç ziyaretçi geldiğini gösterelim.
        </p>
        <div className="mt-4 flex justify-center">{picker}</div>
        {err && <p className="mt-3 text-[13px] text-danger-ink">{err}</p>}
        <p className="mt-4 text-[11px] text-sub">Dosya bilgisayarından çıkmaz, tarayıcında okunur. Apache/Nginx “combined” ya da Cloudflare Logpush (JSON) biçimi; hosting panelinde genelde “Raw Access Logs” adıyla bulunur.</p>
      </div>
    );

  const search = r.bots.filter((b) => b.bot.role !== "training");
  const blocked = r.bots.filter((b) => b.blocked > 0 && b.bot.role !== "training");
  const errPages = r.pages.filter((p) => p.status >= 400 && ![401, 403, 429].includes(p.status)); // engeller ayrı kartta
  const refTotal = r.referrals.reduce((a, b) => a + b.visits, 0);
  const missing = ["OAI-SearchBot", "PerplexityBot", "Claude-SearchBot"].filter((u) => !r.bots.some((b) => b.bot.userAgent === u));
  const todo = [
    blocked.length > 0 && {
      tag: "Engel",
      title: `${blocked.map((b) => b.bot.userAgent).join(", ")} sitende reddediliyor`,
      body: `${blocked.reduce((a, b) => a + b.blocked, 0)} istek 401/403/429 aldı. Güvenlik duvarı (Cloudflare, Wordfence vb.) bu botları engelliyorsa AI cevaplarında kaynak gösterilemezsin; bot izin listesine ekle.`,
    },
    errPages.length > 0 && {
      tag: "Hata",
      title: `AI botları ${errPages.length} hatalı sayfaya gidiyor`,
      body: `Örn. ${errPages.slice(0, 2).map((p) => `${p.path} (${p.status})`).join(", ")}. Bu adresleri çalışan sayfaya 301 ile yönlendir.`,
    },
    missing.length > 0 && {
      tag: "Ziyaret yok",
      title: `${missing.join(", ")} bu dönemde hiç gelmedi`,
      body: "robots.txt'de engel olmadığını kontrol et, sitemap'i Bing'e gönder (ChatGPT araması Bing dizinini kullanır) ve yeni sayfaları IndexNow ile bildir.",
      href: "/indexing",
    },
  ].filter(Boolean) as { tag: string; title: string; body: string; href?: string }[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-sub">
          {name} · {r.parsed.toLocaleString("tr")} satır · {r.from?.split(":")[0]} – {r.to?.split(":")[0]}
        </p>
        {picker}
      </div>
      {err && <p className="text-[13px] text-danger-ink">{err}</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="AI arama botu isteği" value={search.reduce((a, b) => a + b.hits, 0).toLocaleString("tr")} hint={`${search.length} farklı bot`} />
        <StatCard label="Okunan sayfa" value={new Set(r.pages.map((p) => p.path)).size.toLocaleString("tr")} hint="AI botlarının açtığı adres" />
        <StatCard label="Hata / engel" value={r.bots.reduce((a, b) => a + b.errors, 0).toLocaleString("tr")} hint="4xx-5xx dönen bot isteği" />
        <StatCard label="AI'dan gelen ziyaret" value={refTotal.toLocaleString("tr")} hint={r.referrals.map((x) => x.source).join(", ") || "ChatGPT, Perplexity… yönlendirmesi yok"} />
      </div>

      {todo.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Ne yapmalı?</h3>
          <div className="grid gap-3 md:grid-cols-3">
            {todo.map((t) => (
              <div key={t.tag} className={`${CARD} flex flex-col p-4`}>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">{t.tag}</div>
                <h4 className="mt-1.5 text-sm font-semibold">{t.title}</h4>
                <p className="mt-1 flex-1 text-[13px] text-sub">{t.body}</p>
                {t.href && (
                  <div className="mt-3 flex justify-end">
                    <Link href={t.href} className={BTN2}>
                      URL İndeksleme
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <StandardTable
        columns={[
          { header: "Bot", cell: (b) => <div className="font-medium">{b.bot.userAgent}<div className="text-xs font-normal text-sub">{b.bot.engine} · {ROLE[b.bot.role]}</div></div> },
          { header: "İstek", align: "right", cell: (b) => b.hits.toLocaleString("tr") },
          { header: "Sayfa", align: "right", cell: (b) => b.pages.toLocaleString("tr") },
          { header: "Hata", align: "right", cell: (b) => (b.errors ? <span className="font-medium text-danger-ink">{b.errors}{b.blocked ? ` (${b.blocked} engel)` : ""}</span> : "0") },
          { header: "Son ziyaret", cell: (b) => <span className="text-xs text-sub">{b.last.split(":")[0]}</span> },
        ]}
        rows={r.bots}
        rowKey={(b) => b.bot.userAgent}
        empty="Bu kayıtta AI botu yok."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold">AI botlarının en çok okuduğu sayfalar</h3>
          <StandardTable
            columns={[
              { header: "Sayfa", cell: (p) => <span className="block max-w-[280px] truncate">{p.path}</span> },
              { header: "İstek", align: "right", cell: (p) => p.hits },
              { header: "Durum", align: "right", cell: (p) => <span className={p.status >= 400 ? "font-medium text-danger-ink" : "text-sub"}>{p.status}</span> },
            ]}
            rows={r.pages.slice(0, 15)}
            rowKey={(p) => p.path}
          />
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">AI&apos;dan gelen ziyaretçilerin açtığı sayfalar</h3>
          <StandardTable
            columns={[
              { header: "Kaynak", cell: (x) => <span className="font-medium">{x.source}</span> },
              { header: "Sayfa", cell: (x) => <span className="block max-w-[240px] truncate text-xs text-sub">{x.page}</span> },
              { header: "Ziyaret", align: "right", cell: (x) => x.visits },
            ]}
            rows={r.referrals.flatMap((s) => s.pages.slice(0, 5).map((p) => ({ source: s.source, page: p.path, visits: p.visits })))}
            rowKey={(x) => x.source + x.page}
            empty="Bu kayıtta AI'dan gelen ziyaretçi yok."
          />
        </div>
      </div>
      <p className="text-[11px] text-sub">Botlar kullanıcı aracısı (user-agent) adıyla tanınır; sahte botlar ayıklanmaz. AI kullanmaz, ücretsiz.</p>
    </div>
  );
}
