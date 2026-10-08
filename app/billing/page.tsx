import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getBillingInfo, getUsageCount } from "@/lib/db";
import { isPlanId, limitsForPlan, planLabel, type UsageMetric } from "@/lib/plans";
import { isStripeConfigured } from "@/lib/stripe";
import ToolPageHeader from "@/components/ToolPageHeader";
import PlanCards from "@/components/PlanCards";

export const metadata = { title: "Plan ve Faturalandırma — Epicsem" };
export const dynamic = "force-dynamic";

const METRICS: { key: UsageMetric; label: string }[] = [
  { key: "engineQueries", label: "AI motor sorgusu" },
  { key: "contentGenerations", label: "İçerik üretimi" },
  { key: "promptSuggestions", label: "Prompt önerisi" },
  { key: "onboardingSetup", label: "Otomatik kurulum adımı" },
];

const STATUS_LABEL: Record<string, string> = {
  active: "Aktif",
  trialing: "Deneme",
  past_due: "Ödeme gecikti",
  canceled: "İptal edildi",
  unpaid: "Ödenmedi",
  incomplete: "Tamamlanmadı",
};

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/billing");
  const { status } = await searchParams;

  const billing = await getBillingInfo(user.id);
  const plan = billing?.plan ?? "free";
  const limits = limitsForPlan(plan);
  const usage = await Promise.all(METRICS.map((m) => getUsageCount(user.id, m.key)));

  return (
    <div className="space-y-8">
      <ToolPageHeader
        breadcrumbLabel="Plan"
        title="Plan ve faturalandırma"
        body="Mevcut planın, bu ayki kullanımın ve plan değiştirme. Ödemeler Stripe üzerinden güvenle alınır."
      />

      {status === "success" && (
        <div className="card border-seo/40 text-sm">
          <span className="font-bold text-seo">Ödeme alındı.</span>{" "}
          <span className="text-ink/60">Planın birkaç saniye içinde güncellenir — görünmezse sayfayı yenile.</span>
        </div>
      )}
      {status === "cancel" && <div className="card text-sm text-ink/60">Ödeme iptal edildi, planında değişiklik olmadı.</div>}
      {!isStripeConfigured() && (
        <div className="card border-warn/40 text-sm text-ink/60">
          <span className="font-bold text-warn">Ödeme henüz aktif değil.</span> Ücretli planlar Stripe bağlandığında açılacak.
        </div>
      )}

      <div className="grid md:grid-cols-[1fr_2fr] gap-5">
        <div className="card space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink/40">Mevcut plan</div>
          <div className="text-3xl font-extrabold">{planLabel(plan)}</div>
          {billing?.subscriptionStatus && (
            <div className="text-sm text-ink/60">Durum: {STATUS_LABEL[billing.subscriptionStatus] ?? billing.subscriptionStatus}</div>
          )}
          {billing?.currentPeriodEnd && (
            <div className="text-sm text-ink/60">
              Dönem sonu: {new Date(billing.currentPeriodEnd).toLocaleDateString("tr-TR")}
            </div>
          )}
        </div>
        <div className="card space-y-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink/40">Bu ayki kullanım</div>
          {METRICS.map((m, i) => {
            const used = usage[i];
            const limit = limits[m.key];
            const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
            return (
              <div key={m.key} className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-ink/70">{m.label}</span>
                  <span className="font-semibold">
                    {used.toLocaleString("tr-TR")} / {limit.toLocaleString("tr-TR")}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full ${pct >= 90 ? "bg-danger" : pct >= 70 ? "bg-warn" : "bg-accent"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
          <p className="text-xs text-ink/40">Kota her ayın başında (UTC) sıfırlanır.</p>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-extrabold">Planlar</h2>
        <PlanCards currentPlan={isPlanId(plan) ? plan : "free"} signedIn />
      </div>
    </div>
  );
}
