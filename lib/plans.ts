/**
 * Plans + usage limits. Enforcement lives in lib/usage-guard.ts (unchanged call sites);
 * paid plans are sold through Stripe (lib/stripe.ts). The Stripe webhook
 * (app/api/stripe/webhook) is the ONLY thing that ever moves `users.plan` off "free".
 *
 * Prices are NOT hard-coded here — each paid plan points at a Stripe Price id from env
 * (STRIPE_PRICE_PRO / STRIPE_PRICE_AGENCY) and the amount shown in the UI is read from
 * Stripe itself, so the number on /pricing can never drift from what's actually charged.
 *
 * NOTE: the pro/agency limit numbers below are starting values — adjust to the real
 * offer before launch.
 */

export type PlanId = "free" | "pro" | "agency";
export type PaidPlanId = Exclude<PlanId, "free">;

export interface PlanLimits {
  /** Total (prompt × engine) LLM calls per calendar month, combined across /api/geo and /api/gap. */
  engineQueries: number;
  /** /api/content/generate and /api/article-writer calls per calendar month (both are real LLM calls). */
  contentGenerations: number;
  /** /api/geo/suggest-prompts calls per calendar month — one LLM call each. */
  promptSuggestions: number;
  /** URL-first onboarding wizard's 3-call chain, counted together. */
  onboardingSetup: number;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: { engineQueries: 300, contentGenerations: 20, promptSuggestions: 30, onboardingSetup: 30 },
  pro: { engineQueries: 3000, contentGenerations: 150, promptSuggestions: 300, onboardingSetup: 150 },
  agency: { engineQueries: 15000, contentGenerations: 750, promptSuggestions: 1500, onboardingSetup: 750 },
};

export interface PlanMeta {
  id: PlanId;
  label: string;
  tagline: string;
  features: string[];
}

export const PLAN_META: Record<PlanId, PlanMeta> = {
  free: {
    id: "free",
    label: "Ücretsiz",
    tagline: "Denemek ve tek marka için",
    features: ["Tüm araçlar", "Aylık 300 AI motor sorgusu", "Aylık 20 içerik üretimi", "Sınırsız SEO + AXO audit"],
  },
  pro: {
    id: "pro",
    label: "Pro",
    tagline: "Büyüyen markalar için",
    features: ["Ücretsizdeki her şey", "Aylık 3.000 AI motor sorgusu", "Aylık 150 içerik üretimi", "Öncelikli izleme"],
  },
  agency: {
    id: "agency",
    label: "Ajans",
    tagline: "Birden çok müşteri yöneten ajanslar için",
    features: ["Pro'daki her şey", "Aylık 15.000 AI motor sorgusu", "Aylık 750 içerik üretimi", "White-label PDF raporlar"],
  },
};

export const PAID_PLANS: PaidPlanId[] = ["pro", "agency"];
export const DEFAULT_PLAN: PlanId = "free";

export type UsageMetric = keyof PlanLimits;

export function isPlanId(v: string): v is PlanId {
  return v === "free" || v === "pro" || v === "agency";
}

export function limitsForPlan(plan: string): PlanLimits {
  return PLAN_LIMITS[plan as PlanId] ?? PLAN_LIMITS[DEFAULT_PLAN];
}

export function planLabel(plan: string): string {
  return PLAN_META[plan as PlanId]?.label ?? PLAN_META.free.label;
}
