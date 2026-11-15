"use client";

/**
 * Site Denetimi sonuç panosu — GEO panosuyla aynı düzen:
 *  5 metrik → sorunlar tablosu (filtreli, tıklayınca çekmece) + AI tarayıcı erişimi + sayfa özeti →
 *  hazır düzeltmeler → geliştirici için Claude Code komutu.
 */
import { useMemo, useState } from "react";
import type { IssueCategory, IssueSeverity, SeoAuditResult, SeoIssueResult } from "@/types";
import { Drawer } from "@/components/ui";
import PromptBlock from "@/components/PromptBlock";
import { buildAuditFixPrompt } from "@/lib/claude-code-prompt";
import type { PageSpeedResult } from "@/lib/pagespeed";

export interface AuditHistoryPoint {
  score: number;
  aiCrawlScore: number;
  createdAt: string;
}

const CATEGORY_LABEL: Record<IssueCategory, string> = {
  meta: "Meta & başlık",
  headings: "Başlıklar",
  schema: "Yapısal veri",
  crawlability: "Taranabilirlik",
  "ai-crawlability": "AI erişimi",
  performance: "Performans",
  content: "İçerik",
  localization: "Dil",
  images: "Görseller",
  links: "Linkler",
};
const SEV: Record<IssueSeverity, { label: string; dot: string; chip: string; rank: number }> = {
  critical: { label: "Kritik", dot: "bg-danger", chip: "bg-danger/10 text-danger", rank: 0 },
  warning: { label: "Uyarı", dot: "bg-warn", chip: "bg-warn/10 text-warn", rank: 1 },
  info: { label: "Bilgi", dot: "bg-sky-500", chip: "bg-sky-50 text-sky-700", rank: 2 },
  pass: { label: "Geçti", dot: "bg-seo", chip: "bg-seo/10 text-seo", rank: 3 },
};
const ROLE: Record<string, string> = { citation: "AI cevaplarında alıntı", fetch: "Kullanıcı isteğiyle açma", training: "Model eğitimi" };

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-border bg-panel shadow-[0_1px_2px_rgba(13,18,28,0.05)] ${className}`}>{children}</div>;
}
function Spark({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return <div className="h-7" />;
  const w = 160,
    h = 28,
    mx = Math.max(...data),
    mn = Math.min(...data);
  const pts = data.map((v, i) => `${(i * w) / (data.length - 1)},${h - ((v - mn) / (mx - mn || 1)) * (h - 4) - 2}`);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-2 h-7 w-full">
      <path d={`M${pts.join(" L")}`} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
const scoreColor = (n: number) => (n >= 80 ? "text-seo" : n >= 50 ? "text-warn" : "text-danger");

export default function AuditDashboard({ result, history }: { result: SeoAuditResult; history: AuditHistoryPoint[] }) {
  const [sev, setSev] = useState<"all" | IssueSeverity>("all");
  const [cat, setCat] = useState<"all" | IssueCategory>("all");
  const [open, setOpen] = useState<SeoIssueResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [allBots, setAllBots] = useState(false);
  const [psi, setPsi] = useState<PageSpeedResult | null>(null);
  const [psiBusy, setPsiBusy] = useState(false);
  const [psiErr, setPsiErr] = useState<string | null>(null);
  async function measure() {
    setPsiBusy(true);
    setPsiErr(null);
    try {
      const r = await fetch(`/api/pagespeed?url=${encodeURIComponent(result.url)}&strategy=mobile`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Ölçüm başarısız");
      setPsi(d);
    } catch (e) {
      setPsiErr(e instanceof Error ? e.message : "Ölçüm başarısız");
    } finally {
      setPsiBusy(false);
    }
  }

  const issues = useMemo(() => result.issues.filter((i) => i.severity !== "pass").sort((a, b) => SEV[a.severity].rank - SEV[b.severity].rank), [result.issues]);
  const counts = { critical: issues.filter((i) => i.severity === "critical").length, warning: issues.filter((i) => i.severity === "warning").length, info: issues.filter((i) => i.severity === "info").length };
  const shown = issues.filter((i) => (sev === "all" || i.severity === sev) && (cat === "all" || i.category === cat));
  const cats = [...new Set(issues.map((i) => i.category))];
  const bots = result.meta.aiBotAccess;
  const allowed = bots.filter((b) => b.allowed).length;
  const prev = history.length >= 2 ? history[history.length - 2] : null;

  const kpis = [
    { label: "Teknik SEO", value: `${result.score}`, suffix: "/100", cls: scoreColor(result.score), d: prev ? result.score - prev.score : null, spark: history.map((h) => h.score) },
    { label: "AI erişimi (AXO)", value: `${result.aiCrawlScore}`, suffix: "/100", cls: scoreColor(result.aiCrawlScore), d: prev ? result.aiCrawlScore - prev.aiCrawlScore : null, spark: history.map((h) => h.aiCrawlScore) },
    { label: "Kritik sorun", value: String(counts.critical), suffix: "", cls: counts.critical ? "text-danger" : "text-ink", d: null, spark: [] },
    { label: "Uyarı", value: String(counts.warning), suffix: "", cls: counts.warning ? "text-warn" : "text-ink", d: null, spark: [] },
    { label: "İzinli AI botu", value: `${allowed}`, suffix: `/${bots.length}`, cls: allowed === bots.length ? "text-seo" : "text-danger", d: null, spark: [] },
  ];

  const facts: [string, React.ReactNode, boolean | null][] = [
    ["Başlık (title)", result.meta.title ? `${result.meta.title} (${result.meta.title.length} karakter)` : "Yok", !!result.meta.title],
    ["Meta açıklama", result.meta.description ? `${result.meta.description.length} karakter` : "Yok", !!result.meta.description],
    ["H1 başlığı", `${result.meta.h1Count} adet`, result.meta.h1Count === 1],
    ["Kelime sayısı", `~${result.meta.wordCount}`, result.meta.wordCount >= 300],
    ["Yapısal veri", result.meta.hasSchema ? result.meta.schemaTypes.join(", ") : "Yok", result.meta.hasSchema],
    ["Canonical", result.meta.canonical ? "Var" : "Yok", !!result.meta.canonical],
    ["Sayfa dili", result.meta.htmlLang ?? "Belirtilmemiş", !!result.meta.htmlLang],
    ["robots.txt", result.meta.robotsTxtFound ? "Bulundu" : "Bulunamadı", result.meta.robotsTxtFound],
    ["sitemap.xml", result.meta.sitemap ? (result.meta.sitemap.url ? `${result.meta.sitemap.urls.toLocaleString("tr-TR")} URL${result.meta.sitemap.broken.length ? ` · ${result.meta.sitemap.broken.length} kırık` : ""}` : "Bulunamadı") : result.meta.sitemapFound ? "Bulundu" : "Bulunamadı", result.meta.sitemap ? !!result.meta.sitemap.url && !result.meta.sitemap.broken.length : result.meta.sitemapFound],
    ...(result.meta.llmsTxt !== undefined ? ([["llms.txt", result.meta.llmsTxt ? "Bulundu" : "Yok", result.meta.llmsTxt]] as [string, React.ReactNode, boolean][]) : []),
    ...(result.meta.images && result.meta.images.total
      ? ([["Görseller", `${result.meta.images.total} görsel${result.meta.images.noAlt ? ` · ${result.meta.images.noAlt} alt metinsiz` : " · hepsinde alt var"}`, result.meta.images.noAlt === 0]] as [string, React.ReactNode, boolean][])
      : []),
    ...(result.meta.links
      ? ([["Linkler", `${result.meta.links.internal} iç · ${result.meta.links.external} dış${result.meta.links.broken.length ? ` · ${result.meta.links.broken.length} kırık` : ""}`, result.meta.links.internal > 0 && !result.meta.links.broken.length]] as [string, React.ReactNode, boolean][])
      : []),
    ...(result.meta.eeat
      ? ([["Yazar / tarih", `${result.meta.eeat.author ? "Yazar var" : "Yazar yok"} · ${result.meta.eeat.date ? "tarih var" : "tarih yok"}`, result.meta.eeat.author && result.meta.eeat.date]] as [string, React.ReactNode, boolean][])
      : []),
  ];

  async function copy(code: string, key: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* pano izni yok */
    }
  }

  const chip = (on: boolean) =>
    `inline-flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-[13px] font-medium whitespace-nowrap ${on ? "bg-accent/5 text-ink shadow-[inset_0_0_0_1px_#BDB4FF]" : "bg-panel text-sub shadow-[inset_0_0_0_1px_#E4E5E8] hover:text-ink"}`;

  return (
    <div className="space-y-3">
      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => (
          <Card key={k.label} className="px-4 py-4">
            <div className="text-xs font-medium text-sub">{k.label}</div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className={`text-[26px] font-semibold leading-8 tabular-nums ${k.cls}`}>{k.value}</span>
              {k.suffix && <span className="text-sm text-sub">{k.suffix}</span>}
              {k.d != null && k.d !== 0 && <span className={`ml-1 text-xs font-medium ${k.d > 0 ? "text-seo" : "text-danger"}`}>{k.d > 0 ? "↑" : "↓"} {Math.abs(k.d)}</span>}
            </div>
            <Spark data={k.spark} color={k.d == null || k.d === 0 ? "#a1a1aa" : k.d > 0 ? "#12b76a" : "#f04438"} />
          </Card>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.45fr_1fr]">
        {/* Sorunlar */}
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
            <div>
              <h3 className="text-sm font-semibold">Sorunlar</h3>
              <p className="text-xs text-sub">Satıra tıkla → ne anlama geldiği ve nasıl düzeltileceği</p>
            </div>
            <select value={cat} onChange={(e) => setCat(e.target.value as typeof cat)} className="h-8 rounded-[9px] border border-border bg-panel px-2.5 text-[13px] outline-none">
              <option value="all">Tüm kategoriler</option>
              {cats.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c] ?? c}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2 px-5 pb-3 pt-3">
            <button type="button" onClick={() => setSev("all")} className={chip(sev === "all")}>
              Tümü <span className="text-sub">{issues.length}</span>
            </button>
            {(["critical", "warning", "info"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setSev(s)} className={chip(sev === s)}>
                <span className={`h-2 w-2 rounded-full ${SEV[s].dot}`} />
                {SEV[s].label} <span className="text-sub">{counts[s]}</span>
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <div className="border-t border-border px-5 py-10 text-center text-sm text-sub">{issues.length ? "Bu filtrede sorun yok." : "Sorun bulunmadı — sayfa temiz görünüyor. 🎉"}</div>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-y border-border bg-[#fafafa] text-left text-xs text-sub">
                  <th className="py-2 pl-5 font-medium">Önem</th>
                  <th className="py-2 font-medium">Sorun</th>
                  <th className="hidden py-2 pr-5 font-medium sm:table-cell">Kategori</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((i, k) => (
                  <tr key={k} onClick={() => setOpen(i)} className="cursor-pointer hover:bg-[#fafafa]">
                    <td className="py-3 pl-5 align-top">
                      <span className={`whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ${SEV[i.severity].chip}`}>{SEV[i.severity].label}</span>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="font-medium text-ink">{i.title}</div>
                      {i.recommendation && <div className="mt-0.5 line-clamp-1 text-xs text-sub">{i.recommendation}</div>}
                    </td>
                    <td className="hidden py-3 pr-5 align-top sm:table-cell">
                      <span className="whitespace-nowrap rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-sub">{CATEGORY_LABEL[i.category] ?? i.category}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <div className="space-y-3">
          {/* AI tarayıcıları */}
          <Card>
            <div className="px-5 pt-4">
              <h3 className="text-sm font-semibold">AI tarayıcı erişimi</h3>
              <p className="text-xs text-sub">
                {allowed === bots.length ? `${bots.length} botun hepsi siteye erişebiliyor.` : `${bots.length - allowed} bot robots.txt ile engellenmiş.`}
              </p>
            </div>
            <div className="mt-2">
              {(allBots
                ? [...bots].sort((a, b) => Number(a.allowed) - Number(b.allowed))
                : [...bots.filter((b) => !b.allowed), ...bots.filter((b) => b.allowed && b.role === "citation")].slice(0, 7)
              ).map((b) => (
                <div key={b.bot} className="flex items-center gap-3 border-t border-border px-5 py-2.5 first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium">
                      {b.bot} <span className="font-normal text-sub">· {b.engine}</span>
                    </div>
                    {b.role && <div className="text-[11px] text-sub">{ROLE[b.role] ?? b.role}</div>}
                  </div>
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${b.allowed ? "bg-seo/10 text-seo" : "bg-danger/10 text-danger"}`}>{b.allowed ? "İzinli" : "Engelli"}</span>
                </div>
              ))}
              <button type="button" onClick={() => setAllBots((v) => !v)} className="w-full border-t border-border px-5 py-2.5 text-left text-xs font-medium text-accent hover:bg-muted/40">
                {allBots ? "Daha az göster" : `Tüm botları göster (${bots.length})`}
              </button>
            </div>
          </Card>

          {/* Sayfa özeti */}
          <Card>
            <div className="px-5 pt-4">
              <h3 className="text-sm font-semibold">Sayfa özeti</h3>
            </div>
            <div className="mt-2">
              {facts.map(([k, v, ok]) => (
                <div key={k} className="flex items-start gap-3 border-t border-border px-5 py-2 text-[13px] first:border-t-0">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${ok ? "bg-seo" : "bg-warn"}`} />
                  <span className="w-28 shrink-0 text-sub">{k}</span>
                  <span className="min-w-0 flex-1 break-words">{v}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Sayfa hızı (Core Web Vitals) — isteğe bağlı, Google PageSpeed (ücretsiz) */}
          <Card>
            <div className="flex items-start justify-between gap-3 px-5 pt-4">
              <div>
                <h3 className="text-sm font-semibold">Sayfa hızı (Core Web Vitals)</h3>
                <p className="text-xs text-sub">Google PageSpeed · mobil · ücretsiz, ~30 sn</p>
              </div>
              <button type="button" onClick={measure} disabled={psiBusy} className="inline-flex h-8 shrink-0 items-center rounded-[10px] bg-panel px-3 text-sm font-medium shadow-[inset_0_0_0_1px_#D5D7DA] hover:bg-muted disabled:opacity-60">
                {psiBusy ? "Ölçülüyor…" : psi ? "Tekrar ölç" : "Ölç"}
              </button>
            </div>
            <div className="px-5 pb-4 pt-3 text-[13px]">
              {psiErr && <p className="text-xs text-danger">{psiErr}</p>}
              {!psi && !psiErr && <p className="text-xs text-sub">LCP, INP ve CLS gerçek kullanıcı verisi; yoksa laboratuvar puanı.</p>}
              {psi && (
                <div className="space-y-1.5">
                  {psi.labScore !== null && (
                    <div className="flex items-baseline gap-1">
                      <span className={`text-[22px] font-semibold tabular-nums ${scoreColor(psi.labScore)}`}>{psi.labScore}</span>
                      <span className="text-xs text-sub">/100 performans</span>
                      {psi.passed !== null && <span className={`ml-auto rounded-md px-2 py-0.5 text-[11px] font-medium ${psi.passed ? "bg-seo/10 text-seo" : "bg-danger/10 text-danger"}`}>{psi.passed ? "CWV geçti" : "CWV kaldı"}</span>}
                    </div>
                  )}
                  {psi.metrics
                    .filter((m) => m.p75 !== null)
                    .map((m) => (
                      <div key={m.key} className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${m.category === "FAST" ? "bg-seo" : m.category === "AVERAGE" ? "bg-warn" : "bg-danger"}`} />
                        <span className="flex-1 text-sub">{m.label}</span>
                        <span className="tabular-nums">{m.key === "CLS" ? m.p75!.toFixed(2) : m.p75! >= 1000 ? `${(m.p75! / 1000).toFixed(1)} sn` : `${m.p75} ms`}</span>
                      </div>
                    ))}
                  {psi.fieldScope === "none" && <p className="text-[11px] text-sub">Bu sayfa için gerçek kullanıcı verisi yok; puan laboratuvar ölçümü.</p>}
                  {psi.opportunities.slice(0, 3).map((o) => (
                    <div key={o.title} className="text-[11px] text-sub">
                      • {o.title} <span className="tabular-nums">(~{(o.savingsMs / 1000).toFixed(1)} sn)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Hazır düzeltmeler */}
      {result.fixes.length > 0 && (
        <>
          <div className="pt-5">
            <h2 className="text-base font-semibold">Hazır düzeltmeler</h2>
            <p className="text-xs text-sub">Sayfanın kendi içeriğinden üretildi, hiçbir bilgi uydurulmadı. Kopyalayıp sitene yapıştır.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {result.fixes.map((f, i) => (
              <Card key={i} className="flex flex-col p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">Hızlı kazanım</div>
                <h4 className="mt-1.5 text-sm font-semibold">{f.label}</h4>
                <p className="mt-1 text-[13px] text-sub">{f.note}</p>
                <pre className="mt-3 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[#fafafa] p-2.5 text-[11px] leading-4 text-ink/70">{f.code}</pre>
                <div className="mt-3 flex justify-end">
                  <button type="button" onClick={() => copy(f.code, `fix-${i}`)} className="inline-flex h-7 items-center rounded-lg bg-accent px-2.5 text-xs font-medium text-white hover:opacity-90">
                    {copied === `fix-${i}` ? "Kopyalandı ✓" : "Kodu kopyala"}
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Geliştirici */}
      <details className="group rounded-2xl border border-border bg-panel px-5 py-4 shadow-[0_1px_2px_rgba(13,18,28,0.05)]">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
          Geliştiriciye gönder: Claude Code ile otomatik düzelt
          <span className="text-sub transition group-open:rotate-180">▾</span>
        </summary>
        <div className="mt-3">
          <PromptBlock title="Claude Code komutu" description="Sitenin kod deposunda çalışan Claude Code'a yapıştırın; güvenle düzeltilebilecek sorunları düzeltsin." prompt={buildAuditFixPrompt(result)} />
        </div>
      </details>

      {open && (
        <Drawer isOpen onClose={() => setOpen(null)} eyebrow={CATEGORY_LABEL[open.category] ?? open.category} title={open.title} size="md">
          <div className="space-y-5 text-sm">
            <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${SEV[open.severity].chip}`}>{SEV[open.severity].label}</span>
            {open.detail && (
              <div>
                <div className="mb-1 text-xs font-medium text-sub">Ne bulundu?</div>
                <p className="leading-6">{open.detail}</p>
              </div>
            )}
            {open.recommendation && (
              <div>
                <div className="mb-1 text-xs font-medium text-sub">Nasıl düzeltilir?</div>
                <div className="rounded-xl bg-accent/5 px-4 py-3 leading-6 text-ink">{open.recommendation}</div>
              </div>
            )}
            {(() => {
              const fix = result.fixes.find(
                (f) => (open.category === "meta" && f.kind === "meta-description") || (open.category === "schema" && (f.kind === "organization-schema" || f.kind === "faq-schema"))
              );
              return fix ? (
                <div>
                  <div className="mb-1 text-xs font-medium text-sub">Hazır kod: {fix.label}</div>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[#fafafa] p-3 text-[11px] leading-4">{fix.code}</pre>
                  <button type="button" onClick={() => copy(fix.code, "drawer")} className="mt-2 inline-flex h-8 items-center rounded-[10px] bg-accent px-3 text-sm font-medium text-white">
                    {copied === "drawer" ? "Kopyalandı ✓" : "Kodu kopyala"}
                  </button>
                </div>
              ) : null;
            })()}
          </div>
        </Drawer>
      )}
    </div>
  );
}
