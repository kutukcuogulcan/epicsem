import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { acknowledgeAlert, listAlerts } from "@/lib/db";

export async function GET() {
  return NextResponse.json({ alerts: listAlerts() });
}

const bodySchema = z.object({ id: z.number() });

export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid body" }, { status: 400 });
  }
  acknowledgeAlert(parsed.id);
  return NextResponse.json({ ok: true });
}
