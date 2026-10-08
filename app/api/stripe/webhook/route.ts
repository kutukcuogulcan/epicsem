import { NextRequest, NextResponse } from "next/server";
import { applySubscriptionState } from "@/lib/db";
import { planForPriceId, verifyWebhookSignature } from "@/lib/stripe";

export const dynamic = "force-dynamic";

// Statuses that keep paid access. past_due keeps access during Stripe's retry window;
// anything else (canceled, unpaid, incomplete_expired, paused) drops back to free.
const ACTIVE = new Set(["active", "trialing", "past_due"]);

/**
 * Stripe → Epicsem. The only writer of users.plan for paid tiers.
 * Subscribe the endpoint to: checkout.session.completed,
 * customer.subscription.created / updated / deleted.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET tanımlı değil" }, { status: 503 });

  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "Geçersiz imza" }, { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Geçersiz gövde" }, { status: 400 });
  }

  const obj = event?.data?.object ?? {};

  if (event.type === "checkout.session.completed" && obj.mode === "subscription") {
    // Link the customer to the user as early as possible; the subscription.* event
    // that follows carries the authoritative status/plan.
    const userId = Number(obj.client_reference_id ?? obj.metadata?.user_id) || null;
    const plan = obj.metadata?.plan === "pro" || obj.metadata?.plan === "agency" ? obj.metadata.plan : null;
    if (obj.customer && plan) {
      await applySubscriptionState({
        customerId: String(obj.customer),
        userId,
        plan,
        subscriptionId: obj.subscription ? String(obj.subscription) : null,
        status: "active",
        currentPeriodEnd: null,
      });
    }
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const priceId: string | undefined = obj.items?.data?.[0]?.price?.id;
    const paidPlan = planForPriceId(priceId);
    const status: string = event.type === "customer.subscription.deleted" ? "canceled" : String(obj.status ?? "");
    const plan = paidPlan && ACTIVE.has(status) ? paidPlan : "free";
    const periodEnd = obj.current_period_end ?? obj.items?.data?.[0]?.current_period_end;
    await applySubscriptionState({
      customerId: String(obj.customer),
      userId: Number(obj.metadata?.user_id) || null,
      plan,
      subscriptionId: obj.id ? String(obj.id) : null,
      status,
      currentPeriodEnd: periodEnd ? new Date(Number(periodEnd) * 1000) : null,
    });
  }

  return NextResponse.json({ received: true });
}
