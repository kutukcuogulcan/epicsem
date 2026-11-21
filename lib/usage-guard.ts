import { getUsageCount, getUserPlan, incrementUsage, tryIncrementUsage } from "@/lib/db";
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

/**
 * İşten ÖNCE kotayı ayırır (atomik). Paralel istekler birlikte limiti aşamaz.
 * Kullanılmayan kısım refundQuota ile geri verilir; ayrıca consumeQuota çağrılmaz.
 */
export async function reserveQuota(userId: number, metric: UsageMetric, amount: number): Promise<QuotaCheck> {
  const plan = await getUserPlan(userId);
  const limit = limitsForPlan(plan)[metric];
  const after = await tryIncrementUsage(userId, metric, amount, limit);
  if (after != null) return { allowed: true, used: after - amount, limit, plan };
  return { allowed: false, used: await getUsageCount(userId, metric), limit, plan };
}

export async function refundQuota(userId: number, metric: UsageMetric, amount: number) {
  if (amount > 0) await incrementUsage(userId, metric, -amount);
}

const METRIC_LABEL: Record<UsageMetric, string> = {
  engineQueries: "AI motor sorgusu",
  contentGenerations: "içerik üretimi",
  promptSuggestions: "prompt önerisi",
  onboardingSetup: "otomatik kurulum adımı",
};

export function quotaExceededMessage(metric: UsageMetric, quota: QuotaCheck, requested: number): string {
  const label = METRIC_LABEL[metric] ?? metric;
  return `Aylık kullanım limitine ulaşıldı: ${quota.used}/${quota.limit} ${label} (bu işlem ${requested} daha gerektiriyor). Kota her ayın başında (UTC) sıfırlanır.`;
}
