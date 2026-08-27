import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addMonitoredPage, getLatestMonitorCheck, listMonitoredPages, removeMonitoredPage } from "@/lib/db";

export async function GET() {
  const pages = listMonitoredPages().map((page) => ({
    ...page,
    latestCheck: getLatestMonitorCheck(page.id),
  }));
  return NextResponse.json({ pages });
}

const addSchema = z.object({
  url: z.string().min(3),
  label: z.string().optional(),
  slackWebhook: z.string().url().optional().or(z.literal("")),
});

export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = addSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid body" }, { status: 400 });
  }
  const page = addMonitoredPage(parsed.url, parsed.label, parsed.slackWebhook || undefined);
  return NextResponse.json({ page });
}

const deleteSchema = z.object({ id: z.number() });

export async function DELETE(req: NextRequest) {
  let parsed;
  try {
    parsed = deleteSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid body" }, { status: 400 });
  }
  removeMonitoredPage(parsed.id);
  return NextResponse.json({ ok: true });
}
