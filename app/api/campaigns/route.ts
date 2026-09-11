import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createCampaign, deleteCampaign, listCampaigns, setCampaignStatus } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  return NextResponse.json({ campaigns: await listCampaigns(user.id) });
}

const createSchema = z.object({
  brandName: z.string().min(1),
  brandDomain: z.string().min(1),
  frequency: z.enum(["weekly", "monthly"]).default("weekly"),
});

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  let parsed;
  try {
    parsed = createSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }
  const campaign = await createCampaign(user.id, parsed);
  return NextResponse.json({ campaign });
}

const statusSchema = z.object({ id: z.number(), status: z.enum(["active", "paused"]) });

export async function PATCH(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  let parsed;
  try {
    parsed = statusSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }
  await setCampaignStatus(user.id, parsed.id, parsed.status);
  return NextResponse.json({ ok: true });
}

const deleteSchema = z.object({ id: z.number() });

export async function DELETE(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  let parsed;
  try {
    parsed = deleteSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }
  await deleteCampaign(user.id, parsed.id);
  return NextResponse.json({ ok: true });
}
