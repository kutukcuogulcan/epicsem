import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDashboardSummary, listGeoBrands, listGeoRunsForOverview } from "@/lib/db";
import OverviewPanel from "@/components/OverviewPanel";
import StatCard from "@/components/StatCard";
import UsageMeter from "@/components/UsageMeter";
import DashboardActivityChart from "@/components/DashboardActivityChart";
import { TOOL_ICONS } from "@/components/ToolIcons";

export const metadata = {
  title: "Panel — Epicsem",
  description: "Tüm araçların özeti: bu ay ne çalıştırıldı, ne üretildi, ne bekliyor.",
};

// Mirrors Nav.tsx's NAV_GROUPS — a flat quick-launch grid here instead of a dropdown,
// since this page's whole point is being the one place you land on and see everything.
const TOOLS = [
  { href: "/audit", label: "SEO + AXO Audit", icon: "audit" },
  { href: "/geo", label: "GEO/AEO Visibility", icon: "geo" },
  { href: "/gap", label: "Gap Analysis", icon: "gap" },
  { href: "/article-writer", label: "Article Writer", icon: "article" },
  { href: "/monitor", label: "AXO Monitoring", icon: "monitor" },
  { href: "/campaigns", label: "Kampanyalar", icon: "campaigns" },
  { href: "/import", label: "Bulk Import", icon: "import" },
  { href: "/content", label: "Content Studio", icon: "content" },
  { href: "/local", label: "Yerel İşletme (GBP)", icon: "local" },
  { href: "/clients", label: "Clients", icon: "clients" },
  { href: "/prompts", label: "Claude Code Prompts", icon: "prompts" },
];

const QUICK_ACTIONS = [
  { href: "/audit", icon: "audit", title: "Siteyi denetle", body: "SEO + AXO taraması, hazır düzeltmelerle" },
  { href: "/geo", icon: "geo", title: "GEO testi yap", body: "Markan AI cevaplarında görünüyor mu?" },
  { href: "/article-writer", icon: "article", title: "Makale yaz", body: "AI'ın alıntılayacağı biçimde içerik" },
  { href: "/monitor", icon: "monitor", title: "Sayfa izle", body: "AI crawler engellenirse anında haber al" },
];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ brand?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { brand } = await searchParams;
  const [summary, geoBrands] = await Promise.all([getDashboardSummary(user.id), listGeoBrands(user.id)]);
  const selectedBrand = geoBrands.find((b) => b.brandDomain === brand) ?? geoBrands[0];
  const overviewRuns = selectedBrand ? await listGeoRunsForOverview(user.id, selectedBrand.brandDomain, 90) : [];
  const testsThisMonth = summary.thisMonth.auditRuns + summary.thisMonth.geoRuns;

  return (
    <div className="space-y-8">
      {selectedBrand ? (
        <OverviewPanel brands={geoBrands} selectedDomain={selectedBrand.brandDomain} runs={overviewRuns} />
      ) : (
        <div className="rounded-2xl border border-border bg-panel p-8 text-center space-y-3">
          <h2 className="text-lg font-bold">Genel bakış</h2>
          <p className="text-sm text-ink/50 max-w-md mx-auto">
            Markanın ChatGPT, Gemini, Perplexity ve Claude cevaplarında ne sıklıkla geçtiğini, rakiplerle karşılaştırmasını ve
            hangi kaynakların alıntılandığını burada göreceksin. Başlamak için ilk GEO testini çalıştır.
          </p>
          <Link href="/geo" className="inline-block rounded-lg bg-accent text-white px-4 py-2 text-sm font-bold hover:opacity-90">
            İlk GEO testini başlat →
          </Link>
        </div>
      )}

      <div className="pt-4 border-t border-border">
        <h2 className="text-lg font-bold">Hesap özeti</h2>
        <p className="text-sm text-ink/50">Bu ay ne çalıştırıldı, ne üretildi, ne bekliyor.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {QUICK_ACTIONS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="card group flex flex-col gap-3 hover:border-accent/50 transition-colors"
          >
            <span className="h-10 w-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
              {TOOL_ICONS[a.icon]}
            </span>
            <div>
              <div className="font-bold">{a.title}</div>
              <p className="text-xs text-ink/50 mt-1">{a.body}</p>
            </div>
            <span className="text-xs font-bold text-accent mt-auto">Başla →</span>
          </Link>
        ))}
      </div>

      {summary.activeAlerts > 0 && (
        <Link
          href="/monitor"
          className="card border-danger/40 flex items-center justify-between gap-4 hover:bg-danger/5 transition-colors"
        >
          <div className="text-sm">
            <span className="font-bold text-danger">{summary.activeAlerts} bekleyen uyarı</span>
            <span className="text-ink/50"> — bir izlenen sayfada AI crawler engellemesi tespit edildi</span>
          </div>
          <span className="text-xs text-danger font-medium shrink-0">Detaylar →</span>
        </Link>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Bu ay üretilen içerik"
          value={String(summary.thisMonth.contentGenerated)}
          description={`Toplam ${summary.totals.contentDrafts} taslak`}
        />
        <StatCard
          label="Bu ay yayınlanan"
          value={String(summary.thisMonth.contentPublished)}
          description={`Toplam ${summary.totals.contentPublished} yayında`}
          tone="seo"
        />
        <StatCard
          label="İzlenen sayfa"
          value={String(summary.activeServices.monitoredPages)}
          description={summary.activeAlerts > 0 ? `${summary.activeAlerts} aktif uyarı` : "Uyarı yok"}
          tone={summary.activeAlerts > 0 ? "danger" : "accent"}
        />
        <StatCard
          label="Bu ay çalıştırılan test"
          value={String(testsThisMonth)}
          description="Audit + GEO/AEO"
          tone="warn"
        />
      </div>

      <div className="card">
        <h2 className="font-bold mb-1">İçerik aktivitesi</h2>
        <p className="text-xs text-ink/40 mb-2">Son 14 gün — Content Studio ve Article Writer'dan üretilen ve fiilen yayınlanan taslak sayısı</p>
        <DashboardActivityChart data={summary.activity} />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="card space-y-2">
          <h2 className="font-bold text-sm">Bu ayki API kullanımı</h2>
          <div className="space-y-1.5">
            <UsageMeter metric="engineQueries" />
            <UsageMeter metric="contentGenerations" />
            <UsageMeter metric="promptSuggestions" />
          </div>
        </div>
        <div className="card space-y-2">
          <h2 className="font-bold text-sm">Bağlı servisler</h2>
          <div className="text-xs text-ink/50 space-y-1">
            <div>{summary.activeServices.cmsConnections} CMS bağlantısı (WordPress/Shopify)</div>
            <div>{summary.activeServices.clients} kayıtlı müşteri</div>
            <div>{summary.totals.auditRuns} toplam audit, {summary.totals.geoRuns} toplam GEO/AEO testi, {summary.totals.gapRuns} toplam gap analizi</div>
            <div>{summary.totals.importRuns} bulk import çalıştırıldı</div>
          </div>
          <Link href="/monitor" className="text-xs text-accent hover:underline inline-block pt-1">
            Otomatik izleme her 6 saatte bir GitHub Actions üzerinden kendiliğinden çalışıyor →
          </Link>
        </div>
      </div>

      <div>
        <h2 className="font-bold mb-3">Araçlar</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {TOOLS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="card flex flex-col items-center text-center gap-2 py-5 hover:border-accent/40 transition-colors"
            >
              <span className="h-10 w-10 rounded-lg bg-muted text-ink/70 flex items-center justify-center">
                {TOOL_ICONS[t.icon]}
              </span>
              <span className="text-xs font-medium text-ink/80">{t.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
