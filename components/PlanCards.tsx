import { PAID_PLANS, PLAN_META, type PlanId } from "@/lib/plans";
import { formatPrice, getPrice, isStripeConfigured, priceIdFor } from "@/lib/stripe";
import PlanCheckoutButton from "./PlanCheckoutButton";

const CHECK = (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
    <path d="M2.5 6.5L4.5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Free / Pro / Ajans cards. Paid prices come live from Stripe — if Stripe isn't
 * configured (or a price id is missing) the card says so instead of showing a made-up number.
 */
export default async function PlanCards({ currentPlan, signedIn }: { currentPlan: PlanId | null; signedIn: boolean }) {
  const stripeOn = isStripeConfigured();
  const prices = await Promise.all(
    PAID_PLANS.map(async (p) => {
      const id = priceIdFor(p);
      return stripeOn && id ? formatPrice(await getPrice(id)) : null;
    })
  );
  const priceFor = (p: PlanId) => (p === "free" ? "Ücretsiz" : prices[PAID_PLANS.indexOf(p)]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {(["free", "pro", "agency"] as PlanId[]).map((id) => {
        const meta = PLAN_META[id];
        const price = priceFor(id);
        const isCurrent = currentPlan === id;
        const highlight = id === "pro";
        return (
          <div key={id} className={`card flex flex-col gap-5 p-6 ${highlight ? "border-2 border-accent/50" : ""}`}>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-extrabold">{meta.label}</h3>
                {isCurrent && <span className="pill-outline">Mevcut plan</span>}
                {!isCurrent && highlight && <span className="badge badge-info">En popüler</span>}
              </div>
              <p className="text-sm text-ink/50 mt-1">{meta.tagline}</p>
              <div className="mt-4 text-3xl font-extrabold tracking-tight">
                {price ?? <span className="text-ink/30 text-xl">Fiyat yakında</span>}
              </div>
            </div>
            <ul className="space-y-2.5 text-sm text-ink/70 font-medium border-t border-border pt-5 flex-1">
              {meta.features.map((f) => (
                <li key={f} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                    {CHECK}
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            {id === "free" ? (
              <a
                href={signedIn ? "/dashboard" : "/login"}
                className="block text-center rounded-lg border border-border px-4 py-2.5 text-sm font-bold text-ink/80 hover:bg-muted"
              >
                {isCurrent ? "Panele git" : "Ücretsiz başla"}
              </a>
            ) : isCurrent ? (
              <PlanCheckoutButton label="Aboneliği yönet" variant="secondary" />
            ) : !signedIn ? (
              <a
                href="/login?next=/billing"
                className="block text-center rounded-lg bg-accent text-white px-4 py-2.5 text-sm font-bold hover:opacity-90"
              >
                {meta.label} planına geç
              </a>
            ) : (
              <PlanCheckoutButton
                plan={id}
                label={price ? `${meta.label} planına geç` : "Ödeme yakında"}
                variant={highlight ? "primary" : "secondary"}
                disabled={!price}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
