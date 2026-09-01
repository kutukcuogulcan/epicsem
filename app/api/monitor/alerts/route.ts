import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { acknowledgeAlert, listAlerts } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  return NextResponse.json({ alerts: await listAlerts(user.id) });
}

const bodySchema = z.object({ id: z.number() });

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }
  await acknowledgeAlert(user.id, parsed.id);
  return NextResponse.json({ ok: true });
}
