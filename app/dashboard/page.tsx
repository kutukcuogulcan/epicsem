import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import {
  getClient,
  getClientSettings,
  getDashboardSummary,
  listBrandMonitors,
  listCampaigns,
  listClients,
  listCmsConnections,
  listContentDrafts,
  listGeoBrands,
  listGeoRunsForOverview,
  listMonitorSchedules,
} from "@/lib/db";
import OverviewPanel from "@/components/OverviewPanel";
import UsageMeter from "@/components/UsageMeter";
import DashboardActivityChart from "@/components/DashboardActivityChart";
import { Card, CardHeader, StatCard } from "@/components/ui";
import { ScoreRing } from "@/components/tool/MonitorBits";

export const metadata = {
  title: "Genel Bakış — Epicsem",
  description: "Aktif projenin özeti: kurulum adımları, AI görünürlüğü, son yazılar ve Autoblog.",
};

const norm = (d: string) => d.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }) : "—");
const FREQ: Record<string, string> = { daily: "Her gün", weekly: "Haftalık", biweekly: "2 haftada bir", monthly: "Aylık" };

const btnPrimary = "inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-accent px-3 text-sm font-medium text-white hover:opacity-90";
const btnSecondary =
  "inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-panel px-3 text-sm font-medium text-ink shadow-[inset_0_0_0_1px_#D5D7DA,0_1px_2px_rgba(13,18,28,0.05)] hover:bg-muted";

/** Genel Bakış — Arvow "Overview" düzeni: başlarken listesi, metrikler, son yazılar, Autoblog, AI görünürlüğü. */
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ brand?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { brand } = await searchParams;

  const pid = Number((await cookies()).get("epicsem_project")?.value);
  const proj = (pid ? await getClient(user.id, pid) : null) ?? (await listClients(user.id))[0] ?? null;
  const domain = proj ? norm(proj.domain) : null;

  const [summary, geoBrands, drafts, campaigns, monitors, schedules, cms, settings] = await Promise.all([
    getDashboardSummary(user.id),
    listGeoBrands(user.id),
    listContentDrafts(user.id, 200),
    listCampaigns(user.id),
    listBrandMonitors(user.id),
    listMonitorSchedules(user.id),
    listCmsConnections(user.id).catch(() => []),
    proj ? getClientSettings(user.id, proj.id) : Promise.resolve({} as Record<string, string>),
  ]);

  // Aktif projeye ait veriler (başka markaya düşmez).
  const projDrafts = domain ? drafts.filter((d) => d.sourceUrl.includes(domain) || d.sourceUrl.startsWith("keyword:")) : drafts;
  const projCampaigns = domain ? campaigns.filter((c) => norm(c.brandDomain) === domain) : campaigns;
  const monitor = domain ? monitors.find((m) => norm(m.brandDomain) === domain) ?? null : monitors[0] ?? null;
  const schedule = monitor ? schedules.find((s) => norm(s.brandDomain) === norm(monitor.brandDomain)) ?? null : null;
  const selectedBrand = brand ? geoBrands.find((b) => b.brandDomain === brand) : domain ? geoBrands.find((b) => b.brandDomain === domain) : geoBrands[0];
  const overviewRuns = selectedBrand ? await listGeoRunsForOverview(user.id, selectedBrand.brandDomain, 90) : [];

  const settingsFilled = ["description", "audience", "products"].filter((k) => String((settings as Record<string, unknown>)[k] ?? "").trim()).length >= 2;
  const steps = [
    { done: !!proj, title: "Proje oluştur", body: "Siteni ve rakiplerini ekle.", href: "/project", cta: "Proje ekle" },
    { done: settingsFilled, title: "Markanı tanıt", body: "Ton, hedef kitle ve ürünler — AI bunlarla yazar.", href: "/project", cta: "Ayarları doldur" },
    { done: !!monitor, title: "İlk GEO testini çalıştır", body: "ChatGPT, Gemini ve Perplexity'de görünüyor musun?", href: "/geo", cta: "Testi başlat" },
    { done: !!schedule?.active, title: "Monitörü otomatiğe al", body: "Görünürlüğü her gün ya da hafta kendiliğinden ölç.", href: monitor ? `/brand-monitors/${encodeURIComponent(monitor.brandDomain)}` : "/brand-monitors", cta: "İzlemeyi aç" },
    { done: projDrafts.length > 0, title: "İlk yazını yaz", body: "Anahtar kelimeden konuya, plandan yazıya.", href: "/editor", cta: "Yazı yaz" },
    { done: projCampaigns.length > 0, title: "Autoblog kur", body: "Yazılar düzenli olarak kendiliğinden üretilsin.", href: "/campaigns", cta: "Autoblog kur" },
    { done: cms.length > 0, title: "Siteni bağla", body: "WordPress ya da Shopify'a tek tıkla yayınla.", href: "/content", cta: "Bağla" },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const writtenThisMonth = projDrafts.filter((d) => new Date(d.createdAt).getTime() >= monthStart).length;
  const published = projDrafts.filter((d) => d.status !== "draft").length;
  const activeCampaigns = projCampaigns.filter((c) => c.status === "active").length;
  const nextRun = projCampaigns
    .filter((c) => c.status === "active" && c.nextRunAt)
    .map((c) => c.nextRunAt as string)
    .sort()[0];

  return (
    <div className="space-y-6">
      {/* Başlık */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-sub">
            {proj && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} alt="" className="h-4 w-4 rounded" />
                <span>{domain}</span>
              </>
            )}
          </div>
          <h1 className="mt-1 text-2xl font-medium leading-8 text-ink">{proj ? `${proj.name} · Genel bakış` : "Genel bakış"}</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/geo" className={btnSecondary}>
            GEO testi
          </Link>
          <Link href="/editor" className={btnPrimary}>
            <span className="text-base leading-none">+</span> Yeni yazı
          </Link>
        </div>
      </div>

      {/* Başlarken */}
      {doneCount < steps.length && (
        <Card padded={false}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
            <div>
              <h2 className="text-base font-medium">Başlarken</h2>
              <p className="text-sm text-sub">Epicsem&apos;den tam verim almak için {steps.length} adım.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-2 w-40 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
              </div>
              <span className="text-sm tabular-nums text-sub">
                {doneCount}/{steps.length}
              </span>
            </div>
          </div>
          <ul className="divide-y divide-border">
            {steps.map((s, i) => (
              <li key={i} className="flex items-center gap-3 px-6 py-3">
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${s.done ? "bg-seo text-white" : "border border-[#D5D7DA] text-sub"}`}>
                  {s.done ? "✓" : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-medium ${s.done ? "text-sub line-through decoration-sub/40" : "text-ink"}`}>{s.title}</div>
                  {!s.done && <div className="text-xs text-sub">{s.body}</div>}
                </div>
                {!s.done && (
                  <Link href={s.href} className={btnSecondary}>
                    {s.cta}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {summary.activeAlerts > 0 && (
        <Link href="/monitor" className="flex items-center justify-between gap-4 rounded-2xl border border-danger/30 bg-danger/5 px-5 py-3 text-sm hover:bg-danger/10">
          <span>
            <span className="font-medium text-danger">{summary.activeAlerts} bekleyen uyarı</span>
            <span className="text-sub"> — izlenen bir sayfada AI tarayıcı engeli tespit edildi</span>
          </span>
          <span className="font-medium text-danger">Detaylar →</span>
        </Link>
      )}

      {/* Metrikler */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="AI görünürlüğü"
          value={monitor?.visibility != null ? `%${Math.round(monitor.visibility * 100)}` : "—"}
          hint={monitor ? `${monitor.prompts} prompt · ${monitor.engines} motor` : "Henüz test yok"}
          icon={<ScoreRing value={monitor?.visibility != null ? monitor.visibility * 100 : null} size={22} stroke={2.5} />}
        />
        <StatCard label="Bu ay yazılan" value={writtenThisMonth} hint={`Toplam ${projDrafts.length} yazı`} />
        <StatCard label="Yayınlanan" value={published} hint={cms.length ? `${cms.length} site bağlı` : "Site bağlı değil"} />
        <StatCard label="Autoblog" value={activeCampaigns ? `${activeCampaigns} aktif` : "Kapalı"} hint={nextRun ? `Sıradaki: ${fmtDate(nextRun)}` : "Planlı yazı yok"} />
      </div>

      {/* Son yazılar + Autoblog */}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card padded={false} className="overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4">
            <h2 className="text-base font-medium">Son yazılar</h2>
            <Link href="/editor" className="text-sm font-medium text-accent hover:underline">
              Tümü →
            </Link>
          </div>
          {projDrafts.length === 0 ? (
            <div className="border-t border-border px-6 py-10 text-center">
              <p className="text-sm font-medium">Henüz yazı yok</p>
              <p className="mt-1 text-sm text-sub">Bir anahtar kelime yaz, gerisini editör halletsin.</p>
              <Link href="/editor" className={`${btnPrimary} mt-4`}>
                İlk yazıyı yaz →
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border bg-[#fafafa] text-left text-xs text-sub">
                  <th className="px-6 py-2.5 font-medium">Başlık</th>
                  <th className="hidden py-2.5 pr-4 font-medium sm:table-cell">Durum</th>
                  <th className="py-2.5 pr-6 text-right font-medium">Tarih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {projDrafts.slice(0, 6).map((d) => (
                  <tr key={d.id} className="hover:bg-muted/40">
                    <td className="max-w-0 px-6 py-3">
                      <Link href={`/editor?draftId=${d.id}`} className="block truncate font-medium text-ink hover:text-accent">
                        {d.article.title || "Başlıksız"}
                      </Link>
                      {d.sourceUrl.startsWith("keyword:") && <div className="truncate text-xs text-sub">{d.sourceUrl.slice(8)}</div>}
                    </td>
                    <td className="hidden py-3 pr-4 sm:table-cell">
                      <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${d.status === "draft" ? "border-border bg-muted text-sub" : "border-seo/30 bg-seo/10 text-seo"}`}>
                        {d.status === "draft" ? "Taslak" : "Yayında"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap py-3 pr-6 text-right tabular-nums text-sub">{fmtDate(d.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Autoblog"
              action={
                <Link href="/campaigns" className="text-sm font-medium text-accent hover:underline">
                  Yönet →
                </Link>
              }
            />
            {projCampaigns.length === 0 ? (
              <div className="mt-3 text-sm text-sub">
                Autoblog kapalı. Anahtar kelime ya da RSS kaynağından düzenli yazı üret.
                <div>
                  <Link href="/campaigns" className={`${btnSecondary} mt-3`}>
                    Autoblog kur
                  </Link>
                </div>
              </div>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {projCampaigns.slice(0, 4).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{FREQ[c.frequency] ?? c.frequency} · {c.postsPerRun} yazı</span>
                      <span className="block text-xs text-sub">Sıradaki: {fmtDate(c.nextRunAt)}</span>
                    </span>
                    <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium ${c.status === "active" ? "border-seo/30 bg-seo/10 text-seo" : "border-border bg-muted text-sub"}`}>
                      {c.status === "active" ? "Aktif" : "Duraklatıldı"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Marka monitörü"
              action={
                monitor && (
                  <Link href={`/brand-monitors/${encodeURIComponent(monitor.brandDomain)}`} className="text-sm font-medium text-accent hover:underline">
                    Aç →
                  </Link>
                )
              }
            />
            {monitor ? (
              <div className="mt-3 flex items-center gap-4">
                <ScoreRing value={monitor.visibility == null ? null : monitor.visibility * 100} size={52} stroke={4} />
                <div className="text-sm">
                  <div className="font-medium">{monitor.brandName}</div>
                  <div className="text-xs text-sub">
                    Son test {fmtDate(monitor.lastRunAt)} · {schedule?.active ? `${schedule.intervalDays} günde bir otomatik` : "elle çalışıyor"}
                  </div>
                  {monitor.sentiment != null && <div className="text-xs text-sub">Duygu puanı {Math.round(monitor.sentiment)}/100</div>}
                </div>
              </div>
            ) : (
              <div className="mt-3 text-sm text-sub">
                Markan AI cevaplarında hiç test edilmedi.
                <div>
                  <Link href="/geo" className={`${btnSecondary} mt-3`}>
                    GEO testi çalıştır
                  </Link>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* AI görünürlüğü detayı */}
      {selectedBrand && (
        <section className="space-y-3">
          <h2 className="text-base font-medium">AI görünürlüğü</h2>
          <OverviewPanel brands={geoBrands} selectedDomain={selectedBrand.brandDomain} runs={overviewRuns} />
        </section>
      )}

      {/* Aktivite + kullanım */}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader title="İçerik aktivitesi" subtitle="Son 14 gün — üretilen ve yayınlanan yazılar (tüm projeler)" />
          <div className="mt-3">
            <DashboardActivityChart data={summary.activity} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Bu ayki kullanım" />
          <div className="mt-3 space-y-2">
            <UsageMeter metric="engineQueries" />
            <UsageMeter metric="contentGenerations" />
            <UsageMeter metric="promptSuggestions" />
          </div>
        </Card>
      </div>
    </div>
  );
}
