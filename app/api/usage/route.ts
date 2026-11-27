import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getUsageCount, getUserPlan } from "@/lib/db";
import { guestPoolLimits, limitsForPlan, planLabel } from "@/lib/plans";
import { guestPoolUserId } from "@/lib/auth";
import { isDemoMode } from "@/lib/geo-providers";

/** Powers components/UsageMeter.tsx — read-only, no side effects. */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  const plan = await getUserPlan(user.id);
  const limits = limitsForPlan(plan);
  const [engineUsed, contentUsed, suggestUsed, onboardingUsed] = await Promise.all([
    getUsageCount(user.id, "engineQueries"),
    getUsageCount(user.id, "contentGenerations"),
    getUsageCount(user.id, "promptSuggestions"),
    getUsageCount(user.id, "onboardingSetup"),
  ]);

  return NextResponse.json({
    plan,
    planLabel: planLabel(plan),
    demoMode: isDemoMode(),
    engineQueries: { used: engineUsed, limit: limits.engineQueries },
    contentGenerations: { used: contentUsed, limit: limits.contentGenerations },
    promptSuggestions: { used: suggestUsed, limit: limits.promptSuggestions },
    onboardingSetup: { used: onboardingUsed, limit: limits.onboardingSetup },
    // Misafir alanları ayrıca bütün deneme alanlarının ortak aylık havuzundan düşer.
    pool: plan === "guest" ? { used: await getUsageCount(await guestPoolUserId(), "pool:engineQueries"), limit: guestPoolLimits().engineQueries } : null,
  });
}
