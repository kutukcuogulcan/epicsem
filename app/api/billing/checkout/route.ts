import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { DEMO_EMAIL, requireUser } from "@/lib/auth";
import { getBillingInfo, setStripeCustomerId } from "@/lib/db";
import { createCheckoutSession, createCustomer, isStripeConfigured, priceIdFor } from "@/lib/stripe";
import { SITE_URL } from "@/lib/site";

const Body = z.object({ plan: z.enum(["pro", "agency"]) });

/** Starts a Stripe Checkout (subscription) session and returns its hosted URL. */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  if (user.email === DEMO_EMAIL) {
    return NextResponse.json({ error: "Demo hesabıyla plan satın alınamaz — önce kendi hesabınızla giriş yapın." }, { status: 403 });
  }
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Ödeme henüz aktif değil." }, { status: 503 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz plan" }, { status: 400 });
  const plan = parsed.data.plan;
  const priceId = priceIdFor(plan);
  if (!priceId) return NextResponse.json({ error: `Bu plan için fiyat tanımlı değil (${plan}).` }, { status: 503 });

  try {
    const billing = await getBillingInfo(user.id);
    let customerId = billing?.stripeCustomerId ?? null;
    if (!customerId) {
      customerId = (await createCustomer(user.email, user.id)).id;
      await setStripeCustomerId(user.id, customerId);
    }
    const session = await createCheckoutSession({
      customerId,
      priceId,
      userId: user.id,
      plan,
      successUrl: `${SITE_URL}/billing?status=success`,
      cancelUrl: `${SITE_URL}/billing?status=cancel`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ödeme başlatılamadı" }, { status: 502 });
  }
}
