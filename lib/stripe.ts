import crypto from "node:crypto";
import type { PaidPlanId } from "@/lib/plans";

/**
 * Minimal Stripe client over plain fetch (no SDK dependency). Everything is gated on
 * STRIPE_SECRET_KEY — with it unset, the billing UI shows "ödeme henüz aktif değil"
 * instead of a broken button.
 *
 * Env:
 *   STRIPE_SECRET_KEY        sk_live_… / sk_test_…
 *   STRIPE_WEBHOOK_SECRET    whsec_… (from the webhook endpoint in the Stripe dashboard)
 *   STRIPE_PRICE_PRO         price_… (recurring)
 *   STRIPE_PRICE_AGENCY      price_… (recurring)
 */

const API = "https://api.stripe.com/v1";

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function priceIdFor(plan: PaidPlanId): string | null {
  const id = plan === "pro" ? process.env.STRIPE_PRICE_PRO : process.env.STRIPE_PRICE_AGENCY;
  return id || null;
}

export function planForPriceId(priceId: string | null | undefined): PaidPlanId | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  if (priceId === process.env.STRIPE_PRICE_AGENCY) return "agency";
  return null;
}

/** Flattens nested objects into Stripe's form encoding: a[b][0][c]=… */
function encode(obj: Record<string, unknown>, prefix = "", out: URLSearchParams = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (typeof item === "object" && item !== null) encode(item as Record<string, unknown>, `${key}[${i}]`, out);
        else out.append(`${key}[${i}]`, String(item));
      });
    } else if (typeof v === "object") {
      encode(v as Record<string, unknown>, key, out);
    } else {
      out.append(key, String(v));
    }
  }
  return out;
}

async function stripe<T>(method: "GET" | "POST", path: string, body?: Record<string, unknown>): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY tanımlı değil");
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: body ? encode(body).toString() : undefined,
    cache: "no-store",
  });
  const json = (await res.json()) as any;
  if (!res.ok) throw new Error(json?.error?.message ?? `Stripe hatası (${res.status})`);
  return json as T;
}

export async function createCustomer(email: string, userId: number) {
  return stripe<{ id: string }>("POST", "/customers", { email, metadata: { user_id: userId } });
}

export async function createCheckoutSession(opts: {
  customerId: string;
  priceId: string;
  userId: number;
  plan: PaidPlanId;
  successUrl: string;
  cancelUrl: string;
}) {
  return stripe<{ id: string; url: string }>("POST", "/checkout/sessions", {
    mode: "subscription",
    customer: opts.customerId,
    client_reference_id: String(opts.userId),
    line_items: [{ price: opts.priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    metadata: { user_id: opts.userId, plan: opts.plan },
    subscription_data: { metadata: { user_id: opts.userId, plan: opts.plan } },
  });
}

export async function createPortalSession(customerId: string, returnUrl: string) {
  return stripe<{ url: string }>("POST", "/billing_portal/sessions", { customer: customerId, return_url: returnUrl });
}

export interface StripePrice {
  id: string;
  unit_amount: number | null;
  currency: string;
  recurring: { interval: string } | null;
}

/** Real price from Stripe (cached 10 min) — what /pricing and /billing display. */
const priceCache = new Map<string, { at: number; price: StripePrice | null }>();
export async function getPrice(priceId: string): Promise<StripePrice | null> {
  const hit = priceCache.get(priceId);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.price;
  let price: StripePrice | null = null;
  try {
    price = await stripe<StripePrice>("GET", `/prices/${encodeURIComponent(priceId)}`);
  } catch {
    price = null;
  }
  priceCache.set(priceId, { at: Date.now(), price });
  return price;
}

export function formatPrice(p: StripePrice | null): string | null {
  if (!p || p.unit_amount == null) return null;
  const amount = new Intl.NumberFormat("tr-TR", { style: "currency", currency: p.currency.toUpperCase() }).format(
    p.unit_amount / 100
  );
  const interval = p.recurring?.interval === "year" ? "yıl" : p.recurring?.interval === "month" ? "ay" : null;
  return interval ? `${amount} / ${interval}` : amount;
}

/**
 * Verifies the Stripe-Signature header (t=…,v1=…) per Stripe's spec: HMAC-SHA256 of
 * `${t}.${rawBody}` with the webhook secret, constant-time compared, 5-min tolerance.
 */
export function verifyWebhookSignature(rawBody: string, header: string | null, secret: string, toleranceSec = 300): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    })
  ) as Record<string, string>;
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const signatures = header
    .split(",")
    .filter((kv) => kv.trim().startsWith("v1="))
    .map((kv) => kv.trim().slice(3));
  return signatures.some((sig) => {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}
