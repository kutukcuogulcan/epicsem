import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, deleteClient, listClients } from "@/lib/db";

export async function GET() {
  return NextResponse.json({ clients: listClients() });
}

const brandSchema = z.object({ name: z.string().min(1), domain: z.string().min(1) });
const createSchema = z.object({
  name: z.string().min(1),
  domain: z.string().min(1),
  competitors: z.array(brandSchema).max(8).default([]),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = createSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid body" }, { status: 400 });
  }
  const client = createClient(parsed);
  return NextResponse.json({ client });
}

const deleteSchema = z.object({ id: z.number() });

export async function DELETE(req: NextRequest) {
  let parsed;
  try {
    parsed = deleteSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid body" }, { status: 400 });
  }
  deleteClient(parsed.id);
  return NextResponse.json({ ok: true });
}
