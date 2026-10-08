import Breadcrumb from "@/components/Breadcrumb";
import PlanCards from "@/components/PlanCards";
import { getCurrentUser } from "@/lib/auth";
import { getUserPlan } from "@/lib/db";
import { isPlanId } from "@/lib/plans";

export const metadata = {
  title: "Fiyatlandırma — Epicsem",
  description: "Epicsem planları: Ücretsiz, Pro ve Ajans — SEO, AXO, AEO ve GEO tek panelde.",
};

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const current = await getCurrentUser().catch(() => null);
  const user = current ? { plan: await getUserPlan(current.id).catch(() => "free") } : null;
  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-accent/[0.06] via-geo/10 to-transparent px-6 sm:px-10 py-14 sm:py-16">
        <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-accent/20 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-geo/20 blur-3xl" aria-hidden />
        <div className="relative space-y-2 max-w-2xl">
          <Breadcrumb items={[{ label: "Ana Sayfa", href: "/" }, { label: "Fiyatlandırma" }]} />
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">Fiyatlandırma</h1>
          <p className="text-ink/60 text-base">
            Ücretsiz başla, ihtiyacın büyüdükçe yükselt. Tüm planlarda SEO, AXO, AEO ve GEO araçlarının tamamı var —
            planlar yalnızca aylık AI motor sorgusu ve içerik üretimi limitinde ayrışır.
          </p>
        </div>
      </section>

      <PlanCards currentPlan={user ? (isPlanId(user.plan) ? user.plan : "free") : null} signedIn={!!user} />
    </div>
  );
}
