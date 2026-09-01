import { getUsageCount, getUserPlan, incrementUsage } from "@/lib/db";
import { limitsForPlan, type UsageMetric } from "@/lib/plans";

/**
 * Thin wrapper around lib/db.ts's usage_counters table — the enforcement half of the
 * usage-limit safety layer described in lib/plans.ts. Callers (API routes) are expected
 * to only gate on this when a request will make a REAL (non-demo, billable) call —
 * check `isDemoMode()` first and skip both checkQuota and consumeQuota entirely while
 * in demo mode, since nothing costs anything there.
 */

export interface QuotaCheck {
  allowed: boolean;
  used: number;
  limit: number;
  plan: string;
}

export async function checkQuota(userId: number, metric: UsageMetric, amount: number): Promise<QuotaCheck> {
  const plan = await getUserPlan(userId);
  const limit = limitsForPlan(plan)[metric];
  const used = await getUsageCount(userId, metric);
  return { allowed: used + amount <= limit, used, limit, plan };
}

export async function consumeQuota(userId: number, metric: UsageMetric, amount: number) {
  await incrementUsage(userId, metric, amount);
}

export function quotaExceededMessage(metric: UsageMetric, quota: QuotaCheck, requested: number): string {
  const label = metric === "engineQueries" ? "AI motor sorgusu" : "içerik üretimi";
  return `Aylık kullanım limitine ulaşıldı: ${quota.used}/${quota.limit} ${label} (bu işlem ${requested} daha gerektiriyor). Kota her ayın başında (UTC) sıfırlanır.`;
}
