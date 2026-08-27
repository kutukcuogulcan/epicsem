import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, deleteClient, listClients } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  return NextResponse.json({ clients: listClients(user.id) });
}

const brandSchema = z.object({ name: z.string().min(1), domain: z.string().min(1) });
const createSchema = z.object({
  name: z.string().min(1),
  domain: z.string().min(1),
  competitors: z.array(brandSchema).max(8).default([]),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  let parsed;
  try {
    parsed = createSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid body" }, { status: 400 });
  }
  const client = createClient(user.id, parsed);
  return NextResponse.json({ client });
}

const deleteSchema = z.object({ id: z.number() });

export async function DELETE(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  let parsed;
  try {
    parsed = deleteSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid body" }, { status: 400 });
  }
  deleteClient(user.id, parsed.id);
  return NextResponse.json({ ok: true });
}
