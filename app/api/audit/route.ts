import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runSeoAudit } from "@/lib/seo-audit";
import { getPreviousAuditRun, saveAuditRun } from "@/lib/db";

const bodySchema = z.object({ url: z.string().min(3) });

export async function POST(req: NextRequest) {
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
      saveAuditRun(result);
      previousRun = getPreviousAuditRun(result.url);
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
