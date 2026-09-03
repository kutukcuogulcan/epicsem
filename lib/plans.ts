/**
 * Usage-limit safety layer — NOT a billing/payment system. There's no Stripe
 * integration here (deliberately, per product decision): this exists purely to stop
 * one user's abuse from turning into an unbounded LLM bill the moment DEMO_MODE is
 * turned off and real provider keys are connected. Every user is on the "free" plan
 * today; the `plan` column on `users` and this Record-keyed shape exist so a real
 * paid tier can be added later (Stripe webhook sets users.plan) without touching the
 * enforcement code in lib/db.ts or the API routes that call checkQuota/consumeQuota.
 */

export type PlanId = "free";

export interface PlanLimits {
  /** Total (prompt × engine) LLM calls per calendar month, combined across /api/geo and /api/gap. */
  engineQueries: number;
  /** /api/content/generate calls per calendar month. */
  contentGenerations: number;
  /** /api/geo/suggest-prompts calls per calendar month — one LLM call each. */
  promptSuggestions: number;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    engineQueries: 300,
    contentGenerations: 20,
    promptSuggestions: 30,
  },
};

export const DEFAULT_PLAN: PlanId = "free";

export type UsageMetric = keyof PlanLimits;

export function limitsForPlan(plan: string): PlanLimits {
  return PLAN_LIMITS[plan as PlanId] ?? PLAN_LIMITS[DEFAULT_PLAN];
}
