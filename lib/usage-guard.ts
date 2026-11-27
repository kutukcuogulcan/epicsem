import { getUsageCount, getUserPlan, incrementUsage, tryIncrementUsage } from "@/lib/db";
import { guestPoolLimits, limitsForPlan, type UsageMetric } from "@/lib/plans";

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
  /** Misafir alanlarının ortak aylık havuzu doldu (kişisel kota değil). */
  pool?: boolean;
}

const POOL = (m: UsageMetric) => `pool:${m}`;
async function poolUser(): Promise<number> {
  return (await import("@/lib/auth")).guestPoolUserId();
}

export async function checkQuota(userId: number, metric: UsageMetric, amount: number): Promise<QuotaCheck> {
  const plan = await getUserPlan(userId);
  const limit = limitsForPlan(plan)[metric];
  const used = await getUsageCount(userId, metric);
  if (used + amount > limit) return { allowed: false, used, limit, plan };
  if (plan === "guest") {
    // shortcut: kontrol ve düşme ayrı adımlar (atomik değil); yeni rotalar reserveQuota kullanmalı.
    const poolLimit = guestPoolLimits()[metric];
    const poolUsed = await getUsageCount(await poolUser(), POOL(metric));
    if (poolUsed + amount > poolLimit) return { allowed: false, used: poolUsed, limit: poolLimit, plan, pool: true };
  }
  return { allowed: true, used, limit, plan };
}

export async function consumeQuota(userId: number, metric: UsageMetric, amount: number) {
  await incrementUsage(userId, metric, amount);
  if ((await getUserPlan(userId)) === "guest") await incrementUsage(await poolUser(), POOL(metric), amount);
}

/**
 * İşten ÖNCE kotayı ayırır (atomik). Paralel istekler birlikte limiti aşamaz.
 * Kullanılmayan kısım refundQuota ile geri verilir; ayrıca consumeQuota çağrılmaz.
 */
export async function reserveQuota(userId: number, metric: UsageMetric, amount: number): Promise<QuotaCheck> {
  const plan = await getUserPlan(userId);
  const limit = limitsForPlan(plan)[metric];
  const after = await tryIncrementUsage(userId, metric, amount, limit);
  if (after == null) return { allowed: false, used: await getUsageCount(userId, metric), limit, plan };
  if (plan === "guest") {
    // Misafirler ayrıca ortak havuzdan düşer: çerez silip yeni alan açmak sınırsız harcama sağlamasın.
    const pid = await poolUser();
    const poolLimit = guestPoolLimits()[metric];
    if ((await tryIncrementUsage(pid, POOL(metric), amount, poolLimit)) == null) {
      await incrementUsage(userId, metric, -amount);
      return { allowed: false, used: await getUsageCount(pid, POOL(metric)), limit: poolLimit, plan, pool: true };
    }
  }
  return { allowed: true, used: after - amount, limit, plan };
}

export async function refundQuota(userId: number, metric: UsageMetric, amount: number) {
  if (amount <= 0) return;
  await incrementUsage(userId, metric, -amount);
  if ((await getUserPlan(userId)) === "guest") await incrementUsage(await poolUser(), POOL(metric), -amount);
}

const METRIC_LABEL: Record<UsageMetric, string> = {
  engineQueries: "AI motor sorgusu",
  contentGenerations: "içerik üretimi",
  promptSuggestions: "prompt önerisi",
  onboardingSetup: "otomatik kurulum adımı",
};

export function quotaExceededMessage(metric: UsageMetric, quota: QuotaCheck, requested: number): string {
  const label = METRIC_LABEL[metric] ?? metric;
  if (quota.pool) return `Deneme alanlarının bu ayki ortak ${label} hakkı doldu. Ayın başında (UTC) yenilenir; daha fazlası için bizimle iletişime geç.`;
  return `Aylık kullanım limitine ulaşıldı: ${quota.used}/${quota.limit} ${label} (bu işlem ${requested} daha gerektiriyor). Kota her ayın başında (UTC) sıfırlanır.`;
}
