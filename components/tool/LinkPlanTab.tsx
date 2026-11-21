"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Drawer } from "@/components/ui";
import { ASSET_LABEL, assetType, type AssetType, type LinkIdea } from "@/lib/link-plan-types";
import type { LinkPlan } from "@/app/api/backlinks/plan/route";
import type { CommunityThread } from "@/lib/link-plan";

/** Backlinkler → "Link planı": rakipler hangi içeriklerle link alıyor, sen hangi yazıyı hangi anchor ile yazmalısın. */

const CARD = "rounded-2xl border border-border bg-panel shadow-[0_1px_2px_rgba(13,18,28,0.05)]";
const BTN1 = "inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-accent px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60";
const BTN2 = "inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-panel px-3 text-sm font-medium text-ink shadow-[inset_0_0_0_1px_#D5D7DA,0_1px_2px_rgba(13,18,28,0.05)] hover:bg-muted disabled:opacity-60";
const TYPE_CLS: Partial<Record<AssetType, string>> = {
  stats: "bg-accent/10 text-accent",
  tool: "bg-seo/10 text-seo-ink",
  guide: "bg-sky-50 text-sky-700",
  listicle: "bg-warn/10 text-warn-ink",
  comparison: "bg-danger/10 text-danger-ink",
  template: "bg-violet-50 text-violet-700",
  glossary: "bg-muted text-ink/70",
  case: "bg-muted text-ink/70",
};
const short = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
const host = (d: string) => d.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase();
/** Bu kaynaklar site bazında değil konu bazında değerlendirilir (Topluluk fırsatları bölümü). */
const isCommunity = (d: string) => d === "reddit.com" || d === "news.ycombinator.com" || d.endsWith("wikipedia.org");
type CSource = CommunityThread["source"];
const COMMUNITY: Record<CSource, { label: string; cls: string; open: string; tip: string }> = {
  reddit: { label: "Reddit", cls: "bg-[#ff4500]/10 text-[#d93a00]", open: "Konuyu aç ↗", tip: "Reddit: link bırakıp çıkma, konuya gerçek bir cevapla katıl. Yazın yayınlanınca ilgili soruya kaynak olarak paylaş; subreddit kurallarına uy." },
  hn: { label: "Hacker News", cls: "bg-[#ff6600]/10 text-[#cc5200]", open: "Konuyu aç ↗", tip: "Hacker News: tanıtım değil, teknik ve dürüst bir yorumla katıl." },
  wikipedia: { label: "Wikipedia", cls: "bg-muted text-ink/70", open: "Maddeyi aç ↗", tip: "Wikipedia: kaynağı eksik bir cümleye güvenilir bir kaynak olarak ekleyebilirsin. Kendi siteni eklemek çıkar çatışması sayılır; araştırma/istatistik içeriğin varsa tartışma sayfasında öner." },
  donanimhaber: { label: "Donanımhaber", cls: "bg-sky-50 text-sky-700", open: "Konuyu aç ↗", tip: "Donanımhaber forumu: rakibinin konuşulduğu konuya deneyimini anlatan bir cevap yaz; reklam gibi durursa silinir. Uygunsa yazını kaynak olarak ver." },
  sikayetvar: { label: "ŞikayetVar", cls: "bg-emerald-50 text-emerald-700", open: "Sayfayı aç ↗", tip: "ŞikayetVar: rakiple ilgili şikâyetler müşterinin ne aradığını gösterir. Bu sorunları çözdüğünü anlatan bir karşılaştırma yazısı yaz; şikâyet sayfalarına yorum bırakma." },
  quora: { label: "Quora", cls: "bg-[#b92b27]/10 text-[#b92b27]", open: "Soruyu aç ↗", tip: "Quora: soruya tam ve tarafsız bir cevap yaz, markanı açıkça belirt; yazın varsa cevabın sonunda kaynak olarak ver." },
  youtube: { label: "YouTube", cls: "bg-danger/10 text-danger-ink", open: "Videoyu aç ↗", tip: "YouTube: rakibini inceleyen kanallar senin için de inceleme yapabilir. Kanal sahibine ulaş; videonun açıklamasına link istemek yerine ürününü denemeyi öner." },
  medium: { label: "Medium", cls: "bg-ink/10 text-ink", open: "Yazıyı aç ↗", tip: "Medium: rakibini anlatan yazarlara karşılaştırma ya da araştırma içeriğini öner; Medium'da kendi yazını da yayınlayabilirsin." },
};
/** Link verenler (konuya link var) ve bahsetmeler (Google'da rakibin konuşulduğu sayfa). */
const LINKED: CSource[] = ["reddit", "hn", "wikipedia"];
const SRC_LABEL: Record<string, string> = { wikipedia: "Wikipedia", reddit: "Reddit", hn: "Hacker News", ahrefs: "Ahrefs", bing: "Bing", news: "Haber", csv: "CSV" };

export interface PitchOptions {
  url?: string;
  offer?: { title: string; why?: string };
  competitors?: string[];
}

/** Rakiplere link verip sana vermeyen site — fırsat tablosunun bir satırı. */
interface Opportunity {
  domain: string;
  dr: number | null;
  sources: string[];
  competitors: string[];
  targets: string[];
  idea: LinkIdea | null;
  score: number;
}

export default function LinkPlanTab({ site, ownLinkers, onPitch }: { site: string; ownLinkers: string[] | null; onPitch: (domain: string, opts?: PitchOptions) => void }) {
  const [plan, setPlan] = useState<LinkPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; needsCompetitors?: boolean } | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [open, setOpen] = useState<LinkIdea | null>(null);
  const [first, setFirst] = useState(true);
  const [oppAll, setOppAll] = useState(false);

  // Fırsatlar: rakiplere link veren ama sana vermeyen siteler (eşleşen yazı önerisiyle).
  const opps = useMemo<Opportunity[]>(() => {
    if (!plan) return [];
    const own = new Set((ownLinkers ?? []).map(host));
    const compHosts = new Set(plan.competitors.map((c) => host(c.domain)));
    const me = host(plan.site);
    const m = new Map<string, Opportunity>();
    for (const c of plan.competitors)
      for (const r of c.refDomains) {
        const d = host(r.domain);
        if (!d || d === me || own.has(d) || compHosts.has(d) || isCommunity(d)) continue;
        const o = m.get(d) ?? { domain: d, dr: null, sources: [], competitors: [], targets: [], idea: null, score: 0 };
        if (r.dr != null) o.dr = Math.max(o.dr ?? 0, r.dr);
        if (!o.sources.includes(r.source)) o.sources.push(r.source);
        if (!o.competitors.includes(c.domain)) o.competitors.push(c.domain);
        if (r.target && !o.targets.includes(r.target)) o.targets.push(r.target);
        m.set(d, o);
      }
    for (const o of m.values()) {
      o.idea =
        plan.ideas.find((i) => i.pitchTo.map(host).includes(o.domain)) ??
        plan.ideas.find((i) => o.targets.some((t) => assetType(t) === i.type)) ??
        null;
      o.score = o.competitors.length * 10 + (o.dr ?? 0) / 10 + (o.idea ? 2 : 0);
    }
    return [...m.values()].sort((a, b) => b.score - a.score);
  }, [plan, ownLinkers]);
  // Topluluk fırsatları: rakibin linklendiği Reddit / HN konuları ve Wikipedia maddeleri (konu bazında).
  const [cSrc, setCSrc] = useState<"all" | CSource>("all");
  const [cAll, setCAll] = useState(false);
  const community = useMemo(() => {
    if (!plan) return { rows: [], legacy: false };
    const m = new Map<string, { source: CSource; url: string; title: string; where: string | null; date: string | null; score: number | null; targets: string[]; competitors: string[]; idea: LinkIdea | null }>();
    for (const c of plan.competitors)
      for (const t of c.community ?? []) {
        const row = m.get(t.url) ?? { ...t, targets: [], competitors: [], idea: null };
        if (!row.competitors.includes(c.domain)) row.competitors.push(c.domain);
        if (t.target && !row.targets.includes(t.target)) row.targets.push(t.target);
        m.set(t.url, row);
      }
    const ORDER: Record<CSource, number> = { reddit: 0, donanimhaber: 1, sikayetvar: 2, quora: 3, youtube: 4, medium: 5, hn: 6, wikipedia: 7 };
    const rows = [...m.values()]
      .map((r) => ({
        ...r,
        idea:
          plan.ideas.find((i) => r.targets.some((t) => assetType(t) === i.type)) ??
          // Bahsetmelerde (link yok) rakiple kıyaslayan yazı en uygun cevap.
          (LINKED.includes(r.source) ? null : plan.ideas.find((i) => i.type === "comparison") ?? plan.ideas[0] ?? null),
      }))
      .sort((a, b) => ORDER[a.source] - ORDER[b.source] || b.competitors.length - a.competitors.length || (b.score ?? 0) - (a.score ?? 0));
    return { rows, legacy: plan.competitors.every((c) => c.community === undefined) };
  }, [plan]);
  const pitch = (o: Opportunity) =>
    onPitch(o.domain, { url: o.targets[0], competitors: o.competitors, offer: o.idea ? { title: o.idea.title, why: o.idea.why.slice(0, 300) } : undefined });

  const run = useCallback(
    async (refresh = false, onlyCache = false) => {
      setBusy(true);
      setErr(null);
      try {
        const r = await fetch("/api/backlinks/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ site, refresh, onlyCache }) });
        const d = await r.json();
        if (!r.ok) throw Object.assign(new Error(d.error || "Plan çıkarılamadı"), { needs: d.needsCompetitors });
        setPlan(d.plan);
        setCachedAt(d.cachedAt ?? null);
        window.dispatchEvent(new Event("epicsem:usage-changed"));
      } catch (e) {
        const x = e as Error & { needs?: boolean };
        setErr({ text: x.message, needsCompetitors: x.needs });
      } finally {
        setBusy(false);
      }
    },
    [site]
  );
  // Önbellekte plan varsa açılışta ücretsiz yükle.
  useEffect(() => {
    if (!site || !first) return;
    setFirst(false);
    fetch("/api/backlinks/plan?cache=1&site=" + encodeURIComponent(site))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.plan) {
          setPlan(d.plan);
          setCachedAt(d.cachedAt ?? null);
        }
      })
      .catch(() => {});
  }, [site, first]);

  const writeHref = (i: LinkIdea) =>
    `/editor?write=1&kw=${encodeURIComponent(i.targetKeyword)}&title=${encodeURIComponent(i.title)}&note=${encodeURIComponent(
      `Bu yazı link kazanmak için bir "${ASSET_LABEL[i.type]}" içeriği. Başka sitelerin kaynak olarak göstermek isteyeceği şekilde yaz: özgün tablo/kontrol listesi, net tanımlar, kopyalanabilir özet. Önerilen bölümler: ${i.outline.join("; ")}.`
    )}`;

  if (!plan)
    return (
      <div className={`${CARD} px-6 py-10 text-center`}>
        <div className="mx-auto max-w-lg">
          <div className="text-base font-semibold">Rakiplerin hangi yazılarla link alıyor?</div>
          <p className="mt-1 text-sm text-sub">
            Proje rakiplerinin sitelerini ve onlara link veren siteleri (Wikipedia, Reddit, Hacker News{` `}— Ahrefs bağlıysa tüm referanslar) inceleyip sana yazman gereken &quot;link çeken&quot; 5 yazıyı, hedef anchor text&apos;leri ve link isteyeceğin siteleri önerir.
          </p>
          {err && (
            <p className="mt-3 text-sm text-danger-ink">
              {err.text}{" "}
              {err.needsCompetitors && (
                <Link href="/project" className="font-medium underline">
                  Proje Ayarları
                </Link>
              )}
            </p>
          )}
          <button type="button" onClick={() => run(false)} disabled={busy || !site} className={`${BTN1} mt-4`}>
            {busy ? "Rakipler inceleniyor (~1 dk)…" : "Link planını çıkar"}
          </button>
          <p className="mt-2 text-[11px] text-sub">Rakip analizi ücretsiz · yazı önerileri 1 AI sorgusu · sonuç 7 gün saklanır</p>
        </div>
      </div>
    );

  const totalLinkers = new Set(plan.competitors.flatMap((c) => c.refDomains.map((r) => r.domain))).size;
  const compTypes = new Map<AssetType, number>();
  for (const c of plan.competitors) for (const [k, v] of Object.entries(c.types)) if (k !== "other") compTypes.set(k as AssetType, (compTypes.get(k as AssetType) ?? 0) + (v ?? 0));
  const missing = [...compTypes.entries()].filter(([k, v]) => v >= 2 && !(plan.ownTypes[k] ?? 0)).map(([k]) => k);

  return (
    <div className="space-y-4">
      {plan.demo && <div className="rounded-xl border border-warn/30 bg-warn/5 px-4 py-2.5 text-[13px] text-ink/70">Demo mod: öneriler örnek; gerçek anahtar tanımlanınca rakip verisinden siteye özel yazılır.</div>}
      {/* Özet bandı */}
      <div className={`${CARD} p-4 md:p-5`}>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {([
            ["Sana link veren site", ownLinkers ? String(ownLinkers.length) : "—", ownLinkers ? "Link veren siteler sekmesindeki canlı liste" : "Önce backlink verisini yükle"],
            ["Rakiplere link veren", String(totalLinkers), `${plan.competitors.length} rakip · ${plan.competitors.map((c) => c.domain).join(", ")}`],
            ["Rakip farkı", String(opps.length), `rakibe link verip sana vermeyen site${community.rows.length ? ` · +${community.rows.length} topluluk konusu` : ""}`],
            ["Eksik içerik türü", String(missing.length), missing.map((m) => ASSET_LABEL[m]).join(", ") || "rakiplerde olup sende olmayan tür yok"],
          ] as const).map(([l, v, h]) => (
            <div key={l} className="min-w-0 rounded-xl border border-border px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-sub">{l}</div>
              <div className={`mt-1 text-[24px] font-semibold tabular-nums ${l === "Rakip farkı" && opps.length ? "text-danger-ink" : ""}`}>{v}</div>
              <div className="truncate text-[11px] text-sub" title={h}>
                {h}
              </div>
            </div>
          ))}
        </div>

        {opps.length > 0 && (
          <div className="mt-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-sub">En iyi 3 fırsat</div>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              {opps.slice(0, 3).map((o) => (
                <div key={o.domain} className="flex flex-col rounded-xl border border-border p-3">
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`https://www.google.com/s2/favicons?domain=${o.domain}&sz=32`} alt="" className="h-4 w-4 rounded" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{o.domain}</span>
                    {o.dr != null && <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-sub">DR {Math.round(o.dr)}</span>}
                  </div>
                  <p className="mt-1 text-xs text-sub">
                    {o.competitors.length > 1 ? `${o.competitors.length} rakibine` : `${o.competitors[0]} sitesine`} link veriyor, sana vermiyor.
                  </p>
                  {o.idea && (
                    <p className="mt-1 line-clamp-2 text-xs">
                      <span className="text-sub">Önereceğin yazı: </span>
                      {o.idea.title}
                    </p>
                  )}
                  <div className="mt-auto flex gap-1.5 pt-2.5">
                    <button type="button" onClick={() => pitch(o)} className="inline-flex h-7 items-center rounded-lg bg-accent px-2.5 text-xs font-medium text-white hover:opacity-90" title="1 AI sorgusu">
                      E-posta taslağı
                    </button>
                    {o.idea && (
                      <Link href={writeHref(o.idea)} className="inline-flex h-7 items-center rounded-lg px-2.5 text-xs font-medium shadow-[inset_0_0_0_1px_#D5D7DA] hover:bg-muted">
                        Yazıyı yaz
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {plan.ideas[0] && (
          <div className="mt-4 rounded-xl bg-accent/[0.06] p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">Önce bunu yap</div>
            {(() => {
              const top = opps.find((o) => o.idea)?.idea ?? plan.ideas[0];
              const askers = opps.filter((o) => o.idea === top).slice(0, 3).map((o) => o.domain);
              return (
                <>
                  <div className="mt-1 text-[13px] font-semibold leading-snug">&ldquo;{top.title}&rdquo; yazısını yaz</div>
                  <p className="mt-1 text-xs text-sub">
                    {ASSET_LABEL[top.type]} · hedef kelime &ldquo;{top.targetKeyword}&rdquo;
                    {askers.length ? `. Yayınlayınca ${askers.join(", ")} sitelerinden link iste.` : top.pitchTo.length ? `. Yayınlayınca ${top.pitchTo.slice(0, 3).join(", ")} sitelerinden link iste.` : "."}
                  </p>
                  <Link href={writeHref(top)} className="mt-2 inline-flex h-7 items-center rounded-lg bg-accent px-2.5 text-[12px] font-medium text-white hover:opacity-90">
                    Link çekecek yazıyı yaz
                  </Link>
                </>
              );
            })()}
          </div>
        )}
        <p className="mt-3 text-[11px] text-sub">
          Rakip linkleri ücretsiz kaynaklardan (Wikipedia, Reddit, Hacker News{plan.competitors.some((c) => c.refDomains.some((r) => r.source === "ahrefs")) ? ", Ahrefs" : ""}) geliyor; gerçek profilin bir kısmıdır. Ahrefs bağlarsan liste büyür.
        </p>
      </div>

      {/* Topluluk fırsatları: Reddit, Hacker News, Wikipedia (konu bazında) */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
          <div>
            <h2 className="text-sm font-semibold">Topluluk fırsatları</h2>
            <p className="text-xs text-sub">Rakiplerinin konuşulduğu ve linklendiği konular: Reddit, Donanımhaber, ŞikayetVar, Quora, YouTube, Medium, Hacker News, Wikipedia. AI motorları bu sayfaları sık kaynak gösteriyor.</p>
          </div>
          {community.rows.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(["all", ...(Object.keys(COMMUNITY) as CSource[]).filter((k) => community.rows.some((r) => r.source === k))] as ("all" | CSource)[]).map((k) => {
                const l = k === "all" ? "Tümü" : COMMUNITY[k].label;
                const n = k === "all" ? community.rows.length : community.rows.filter((r) => r.source === k).length;
                return (
                  <button key={k} type="button" onClick={() => setCSrc(k)} disabled={!n} className={`inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-xs font-medium disabled:opacity-40 ${cSrc === k ? "bg-accent/5 text-ink shadow-[inset_0_0_0_1px_#BDB4FF]" : "text-sub shadow-[inset_0_0_0_1px_#E4E5E8] hover:text-ink"}`}>
                    {l} <span className="tabular-nums text-sub">{n}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {community.legacy ? (
          <p className="px-5 pb-5 pt-3 text-[13px] text-sub">
            Bu plan topluluk konuları eklenmeden önce çıkarıldı. Reddit, Donanımhaber, ŞikayetVar, Quora, YouTube ve Medium konularını görmek için aşağıdaki <b>Yenile</b>&apos;ye bas.
          </p>
        ) : community.rows.length === 0 ? (
          <p className="px-5 pb-5 pt-3 text-[13px] text-sub">Topluluk sitelerinde rakiplerinle ilgili konu bulunamadı.</p>
        ) : (
          <>
            <div className="mx-5 mt-3 rounded-xl bg-muted/60 px-3 py-2 text-xs text-ink/70">
              {cSrc === "all" ? "Link bırakıp çıkma: her sitede konuya gerçek bir katkıyla gir. Bir kaynağı seçince o siteye özel ipucu çıkar. Reddit, Hacker News ve Wikipedia satırları rakibe link veren konulardır; diğerleri rakibin konuşulduğu, Google'da bulunan sayfalardır." : COMMUNITY[cSrc].tip}
            </div>
            <ul className="mt-2 divide-y divide-border border-t border-border">
              {(cAll ? community.rows : community.rows.filter((r) => cSrc === "all" || r.source === cSrc).slice(0, 10))
                .filter((r) => cSrc === "all" || r.source === cSrc)
                .map((r) => (
                  <li key={r.url} className="flex flex-wrap items-start gap-3 px-5 py-3">
                    <span className={`mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${COMMUNITY[r.source].cls}`}>{r.where ?? COMMUNITY[r.source].label}</span>
                    <div className="min-w-0 flex-1">
                      <a href={r.url} target="_blank" rel="noreferrer" className="line-clamp-2 text-[13px] font-medium hover:text-accent">
                        {r.title}
                      </a>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-sub">
                        {r.competitors.map((c) => (
                          <span key={c} className="rounded bg-danger/10 px-1 font-medium text-danger-ink">
                            {c}
                          </span>
                        ))}
                        {r.targets[0] && <span className="max-w-[260px] truncate">{short(r.targets[0])}</span>}
                        {!LINKED.includes(r.source) && <span>rakip konuşuluyor</span>}
                        {r.score != null && r.source !== "wikipedia" && <span>{r.score} puan</span>}
                        {r.date && <span>{new Date(r.date).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" })}</span>}
                      </div>
                      {r.idea && (
                        <div className="mt-1 text-xs">
                          <span className="text-sub">Paylaşacağın yazı: </span>
                          {r.idea.title}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center rounded-lg px-2.5 text-xs font-medium shadow-[inset_0_0_0_1px_#D5D7DA] hover:bg-muted">
                        {COMMUNITY[r.source].open}
                      </a>
                      {r.idea && (
                        <Link href={writeHref(r.idea)} className="inline-flex h-7 items-center rounded-lg bg-accent px-2.5 text-xs font-medium text-white hover:opacity-90">
                          Yazıyı yaz
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
            </ul>
            {community.rows.filter((r) => cSrc === "all" || r.source === cSrc).length > 10 && (
              <button type="button" onClick={() => setCAll((v) => !v)} className="w-full border-t border-border py-2.5 text-xs font-medium text-accent hover:bg-muted/40">
                {cAll ? "Daha az göster" : "Tümünü göster"}
              </button>
            )}
          </>
        )}
      </div>

      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-sm font-semibold">Yazman gereken link çeken yazılar</h2>
          <p className="text-xs text-sub">Kartı aç → anchor planı, link isteyeceğin siteler, içeriden link verecek sayfaların · &quot;Yazıyı yaz&quot; sihirbazı hazır açar</p>
        </div>
        <div className="flex items-center gap-2">
          {cachedAt && <span className="text-[11px] text-sub">{new Date(cachedAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} tarihli</span>}
          <button type="button" onClick={() => run(true)} disabled={busy} className={BTN2} title="Yeniden analiz · 1 AI sorgusu">
            {busy ? "Yenileniyor…" : "Yenile"}
          </button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {plan.ideas.map((i) => (
          <div key={i.title} className={`${CARD} flex flex-col p-4`}>
            <span className={`self-start rounded-md px-1.5 py-0.5 text-[11px] font-medium ${TYPE_CLS[i.type] ?? "bg-muted"}`}>{ASSET_LABEL[i.type]}</span>
            <h3 className="mt-2 text-sm font-semibold leading-5">{i.title}</h3>
            <p className="mt-1 line-clamp-3 text-[13px] text-sub">{i.why}</p>
            <div className="mt-3 space-y-1 text-[12px]">
              <div>
                <span className="text-sub">Hedef kelime: </span>
                <b>{i.targetKeyword}</b>
              </div>
              <div className="truncate">
                <span className="text-sub">Anchor: </span>
                {[i.anchors.exact, ...i.anchors.partial.slice(0, 1), i.anchors.branded].filter(Boolean).map((a) => `“${a}”`).join(" · ")}
              </div>
              <div className="truncate">
                <span className="text-sub">Link iste: </span>
                {i.pitchTo.length ? i.pitchTo.slice(0, 3).join(", ") : "liste için Ahrefs/CSV gerekli"}
              </div>
            </div>
            <div className="mt-auto flex justify-end gap-2 pt-3">
              <button type="button" onClick={() => setOpen(i)} className={BTN2}>
                Detay
              </button>
              <Link href={writeHref(i)} className={BTN1}>
                Yazıyı yaz
              </Link>
            </div>
          </div>
        ))}
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="px-5 pt-4">
          <h2 className="text-sm font-semibold">Fırsat tablosu</h2>
          <p className="text-xs text-sub">Rakiplerine link veren ama sana vermeyen siteler · en çok rakibe link verenler üstte</p>
        </div>
        {opps.length === 0 ? (
          <p className="px-5 pb-5 pt-3 text-[13px] text-sub">
            {totalLinkers ? "Rakiplerine link veren sitelerin hepsi zaten sana da link veriyor." : "Ücretsiz kaynaklarda rakiplerine link veren site bulunamadı. Ahrefs bağlarsan ya da rakibin backlink CSV'sini yüklersen tablo dolar."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mt-3 w-full min-w-[640px] text-[13px]">
              <thead className="border-y border-border bg-[#fafafa] text-left text-xs text-sub">
                <tr>
                  <th className="py-2 pl-5 font-medium">Site</th>
                  <th className="py-2 pr-3 font-medium">Link verdiği rakip</th>
                  <th className="py-2 pr-3 font-medium">Önereceğin yazı</th>
                  <th className="py-2 pr-5 text-right font-medium">Aksiyon</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(oppAll ? opps : opps.slice(0, 12)).map((o) => (
                  <tr key={o.domain} className="align-top">
                    <td className="py-2.5 pl-5 pr-3">
                      <div className="flex items-center gap-2 font-medium">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`https://www.google.com/s2/favicons?domain=${o.domain}&sz=32`} alt="" className="h-4 w-4 rounded" />
                        {o.domain}
                        {o.dr != null && <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-sub">DR {Math.round(o.dr)}</span>}
                      </div>
                      <div className="pl-6 text-[11px] text-sub">{o.sources.map((x) => SRC_LABEL[x] ?? x).join(", ")}</div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {o.competitors.map((c) => (
                          <span key={c} className="rounded-md bg-danger/10 px-1.5 py-0.5 text-[11px] font-medium text-danger-ink">
                            {c}
                          </span>
                        ))}
                      </div>
                      {o.targets[0] && (
                        <a href={o.targets[0]} target="_blank" rel="noreferrer" className="mt-0.5 block max-w-[220px] truncate text-[11px] text-sub hover:text-accent">
                          {short(o.targets[0])}
                        </a>
                      )}
                    </td>
                    <td className="max-w-[260px] py-2.5 pr-3">
                      {o.idea ? (
                        <>
                          <div className="line-clamp-2">{o.idea.title}</div>
                          <span className={`mt-0.5 inline-block rounded-md px-1.5 py-0.5 text-[11px] font-medium ${TYPE_CLS[o.idea.type] ?? "bg-muted"}`}>{ASSET_LABEL[o.idea.type]}</span>
                        </>
                      ) : (
                        <span className="text-sub">Rakibin linklenen sayfasına benzer bir içerik</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-5 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button type="button" onClick={() => pitch(o)} className="inline-flex h-7 items-center whitespace-nowrap rounded-lg bg-accent px-2.5 text-xs font-medium text-white hover:opacity-90" title="1 AI sorgusu">
                          E-posta
                        </button>
                        {o.idea && (
                          <Link href={writeHref(o.idea)} className="inline-flex h-7 items-center whitespace-nowrap rounded-lg px-2.5 text-xs font-medium shadow-[inset_0_0_0_1px_#D5D7DA] hover:bg-muted">
                            Yazıyı yaz
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {opps.length > 12 && (
          <button type="button" onClick={() => setOppAll((v) => !v)} className="w-full border-t border-border py-2.5 text-xs font-medium text-accent hover:bg-muted/40">
            {oppAll ? "Daha az göster" : `Tüm ${opps.length} siteyi göster`}
          </button>
        )}
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="px-5 pt-4">
          <h2 className="text-sm font-semibold">Rakipler hangi içeriklerle link alıyor?</h2>
          <p className="text-xs text-sub">Rakibin sitemap&apos;indeki içerik türleri ve link alan sayfaları</p>
        </div>
        <table className="mt-3 w-full text-[13px]">
          <thead className="border-y border-border bg-[#fafafa] text-left text-xs text-sub">
            <tr>
              <th className="py-2 pl-5 font-medium">Rakip</th>
              <th className="py-2 pr-3 font-medium">İçerik türleri</th>
              <th className="hidden py-2 pr-3 font-medium md:table-cell">En çok link alan sayfa</th>
              <th className="py-2 pr-5 text-right font-medium">Link veren</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {plan.competitors.map((c) => (
              <tr key={c.domain} className="align-top">
                <td className="py-3 pl-5 pr-3">
                  <div className="font-medium">{c.domain}</div>
                  <div className="text-[11px] text-sub">{c.pages} sayfa</div>
                </td>
                <td className="py-3 pr-3">
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(c.types)
                      .filter(([k]) => k !== "other")
                      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
                      .map(([k, v]) => (
                        <span key={k} className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${TYPE_CLS[k as AssetType] ?? "bg-muted"}`}>
                          {ASSET_LABEL[k as AssetType]} {v}
                        </span>
                      ))}
                    {!Object.keys(c.types).some((k) => k !== "other") && <span className="text-sub">sitemap okunamadı</span>}
                  </div>
                </td>
                <td className="hidden max-w-[280px] py-3 pr-3 md:table-cell">
                  {c.topPages[0] ? (
                    <a href={c.topPages[0].url} target="_blank" rel="noreferrer" className="block truncate hover:text-accent">
                      {short(c.topPages[0].url)}
                      <span className="ml-1 text-[11px] text-sub">· {c.topPages[0].linkers.length} site</span>
                    </a>
                  ) : (
                    <span className="text-sub">—</span>
                  )}
                </td>
                <td className="py-3 pr-5 text-right tabular-nums">{c.refDomains.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-5 py-3 text-[11px] text-sub">Ücretsiz kaynaklar link profilinin küçük bir kısmını gösterir. Tam liste için Entegrasyonlar&apos;dan Ahrefs bağla ya da rakibin backlink CSV&apos;sini yükle.</p>
      </div>

      <Drawer isOpen={!!open} onClose={() => setOpen(null)} size="xl" eyebrow={open ? `Link planı · ${ASSET_LABEL[open.type]}` : ""} title={open?.title ?? ""} footer={open && (
        <div className="flex justify-end">
          <Link href={writeHref(open)} className={BTN1}>
            Yazıyı yaz (sihirbaz hazır açılır)
          </Link>
        </div>
      )}>
        {open && (
          <div className="space-y-5 text-[13px]">
            <p className="leading-6">{open.why}</p>
            {open.inspiredBy && (
              <div>
                <span className="text-sub">Karşılık verdiği rakip içeriği: </span>
                <a href={open.inspiredBy} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  {short(open.inspiredBy)} ↗
                </a>
              </div>
            )}
            <div>
              <div className="mb-1.5 text-xs font-medium text-sub">Önerilen bölümler</div>
              <ol className="list-decimal space-y-0.5 pl-5">
                {open.outline.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ol>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium text-sub">Anchor text planı (dışarıdan alınacak linkler için)</div>
              <div className="divide-y divide-border rounded-xl border border-border">
                {([
                  ["Tam eşleşme", [open.anchors.exact], "az kullan (~%10)", "text-danger-ink"],
                  ["Kısmi eşleşme", open.anchors.partial, "en çok bunu iste (~%40)", "text-seo-ink"],
                  ["Markalı", [open.anchors.branded], "doğal görünür (~%35)", "text-accent"],
                  ["Genel", [open.anchors.generic], "doğallık için (~%15)", "text-sub"],
                ] as const).map(([l, list, note, cls]) => (
                  <div key={l} className="flex items-start gap-3 px-3 py-2">
                    <span className="w-28 shrink-0 text-sub">{l}</span>
                    <span className="min-w-0 flex-1">{list.filter(Boolean).map((a) => `“${a}”`).join(", ") || "—"}</span>
                    <span className={`shrink-0 text-[11px] ${cls}`}>{note}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium text-sub">Link isteyeceğin siteler (rakiplerine link veriyorlar)</div>
              {open.pitchTo.length ? (
                <div className="divide-y divide-border rounded-xl border border-border">
                  {open.pitchTo.map((d) => (
                    <div key={d} className="flex items-center justify-between px-3 py-2">
                      <span className="font-medium">{d}</span>
                      <button type="button" onClick={() => onPitch(d, { offer: { title: open.title, why: open.why.slice(0, 300) }, competitors: opps.find((o) => o.domain === host(d))?.competitors })} className="text-xs font-medium text-accent hover:underline" title="1 AI sorgusu">
                        E-posta taslağı
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sub">Ücretsiz kaynaklarda uygun site bulunamadı. Ahrefs bağlarsan ya da rakibin backlink CSV&apos;sini yüklersen liste dolar.</p>
              )}
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium text-sub">Sitenden bu yazıya link ver (iç link)</div>
              {open.internalFrom.length ? (
                <div className="divide-y divide-border rounded-xl border border-border">
                  {open.internalFrom.map((x) => (
                    <div key={x.url} className="px-3 py-2">
                      <a href={x.url} target="_blank" rel="noreferrer" className="block truncate font-medium hover:text-accent">
                        {short(x.url)}
                      </a>
                      <span className="text-[11px] text-sub">Anchor: “{x.anchor}”</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sub">Sitenin sayfaları okunamadı; yazıyı yazınca editörün Linkler sekmesi önerir.</p>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
