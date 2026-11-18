"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Drawer } from "@/components/ui";
import { ASSET_LABEL, type AssetType, type LinkIdea } from "@/lib/link-plan-types";
import type { LinkPlan } from "@/app/api/backlinks/plan/route";

/** Backlinkler → "Link planı": rakipler hangi içeriklerle link alıyor, sen hangi yazıyı hangi anchor ile yazmalısın. */

const CARD = "rounded-2xl border border-border bg-panel shadow-[0_1px_2px_rgba(13,18,28,0.05)]";
const BTN1 = "inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-accent px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60";
const BTN2 = "inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-panel px-3 text-sm font-medium text-ink shadow-[inset_0_0_0_1px_#D5D7DA,0_1px_2px_rgba(13,18,28,0.05)] hover:bg-muted disabled:opacity-60";
const TYPE_CLS: Partial<Record<AssetType, string>> = {
  stats: "bg-accent/10 text-accent",
  tool: "bg-seo/10 text-seo",
  guide: "bg-sky-50 text-sky-700",
  listicle: "bg-warn/10 text-warn",
  comparison: "bg-danger/10 text-danger",
  template: "bg-violet-50 text-violet-700",
  glossary: "bg-muted text-ink/70",
  case: "bg-muted text-ink/70",
};
const short = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

export default function LinkPlanTab({ site, onPitch }: { site: string; onPitch: (domain: string, url?: string) => void }) {
  const [plan, setPlan] = useState<LinkPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; needsCompetitors?: boolean } | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [open, setOpen] = useState<LinkIdea | null>(null);
  const [first, setFirst] = useState(true);

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
            <p className="mt-3 text-sm text-danger">
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
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {([
          ["İncelenen rakip", String(plan.competitors.length), plan.competitors.map((c) => c.domain).join(", ")],
          ["Rakiplere link veren site", String(totalLinkers), "Wikipedia, Reddit, HN" + (plan.competitors.some((c) => c.refDomains.some((r) => r.source === "ahrefs")) ? ", Ahrefs" : "")],
          ["Sende olmayan içerik türü", String(missing.length), missing.map((m) => ASSET_LABEL[m]).join(", ") || "eksik tür yok"],
          ["Önerilen yazı", String(plan.ideas.length), "link kazandıracak içerik"],
        ] as const).map(([l, v, h]) => (
          <div key={l} className={`${CARD} px-4 py-4`}>
            <div className="text-xs font-medium text-sub">{l}</div>
            <div className="mt-1.5 text-[26px] font-semibold leading-8 tabular-nums">{v}</div>
            <div className="mt-1 h-4 truncate text-[11px] text-sub" title={h}>
              {h}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-end justify-between">
        <div>
          <h3 className="text-sm font-semibold">Yazman gereken link çeken yazılar</h3>
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
            <h4 className="mt-2 text-sm font-semibold leading-5">{i.title}</h4>
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
          <h3 className="text-sm font-semibold">Rakipler hangi içeriklerle link alıyor?</h3>
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
                  ["Tam eşleşme", [open.anchors.exact], "az kullan (~%10)", "text-danger"],
                  ["Kısmi eşleşme", open.anchors.partial, "en çok bunu iste (~%40)", "text-seo"],
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
                      <button type="button" onClick={() => onPitch(d)} className="text-xs font-medium text-accent hover:underline" title="1 AI sorgusu">
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
