import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getUsageCount, getUserPlan } from "@/lib/db";
import { limitsForPlan } from "@/lib/plans";
import { isDemoMode } from "@/lib/geo-providers";

/** Powers components/UsageMeter.tsx — read-only, no side effects. */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  const plan = await getUserPlan(user.id);
  const limits = limitsForPlan(plan);
  const [engineUsed, contentUsed] = await Promise.all([
    getUsageCount(user.id, "engineQueries"),
    getUsageCount(user.id, "contentGenerations"),
  ]);

  return NextResponse.json({
    plan,
    demoMode: isDemoMode(),
    engineQueries: { used: engineUsed, limit: limits.engineQueries },
    contentGenerations: { used: contentUsed, limit: limits.contentGenerations },
  });
}
