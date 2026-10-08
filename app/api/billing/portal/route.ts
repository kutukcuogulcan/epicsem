import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getBillingInfo } from "@/lib/db";
import { createPortalSession, isStripeConfigured } from "@/lib/stripe";
import { SITE_URL } from "@/lib/site";

/** Stripe Customer Portal — plan change, cancel, invoices, card update. */
export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  if (!isStripeConfigured()) return NextResponse.json({ error: "Ödeme henüz aktif değil." }, { status: 503 });

  const billing = await getBillingInfo(user.id);
  if (!billing?.stripeCustomerId) {
    return NextResponse.json({ error: "Henüz bir aboneliğiniz yok." }, { status: 400 });
  }
  try {
    const session = await createPortalSession(billing.stripeCustomerId, `${SITE_URL}/billing`);
    return NextResponse.json({ url: session.url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Portal açılamadı" }, { status: 502 });
  }
}
