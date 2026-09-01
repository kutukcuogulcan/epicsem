import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runSeoAudit } from "@/lib/seo-audit";
import { getPreviousAuditRun, saveAuditRun } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";

const bodySchema = z.object({ url: z.string().min(3) });

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  const limitResult = rateLimit(`audit:${user.id}`, 30, 60 * 60 * 1000);
  if (!limitResult.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached — up to 30 audits per hour. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limitResult.resetAt)) } }
    );
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Body must be { url: string }" }, { status: 400 });
  }

  try {
    const result = await runSeoAudit(parsed.url);
    let previousRun = null;
    try {
      await saveAuditRun(user.id, result);
      previousRun = await getPreviousAuditRun(user.id, result.url);
    } catch (dbErr) {
      // Persistence is a bonus layer — a DB hiccup should never fail the audit itself.
      console.error("audit history write failed:", dbErr);
    }
    return NextResponse.json({ ...result, previousRun });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Audit failed" },
      { status: 500 }
    );
  }
}
