import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addMonitoredPage, getLatestMonitorCheck, listMonitoredPages, removeMonitoredPage } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  const pages = await Promise.all(
    (await listMonitoredPages(user.id)).map(async (page) => ({
      ...page,
      latestCheck: await getLatestMonitorCheck(page.id),
    }))
  );
  return NextResponse.json({ pages });
}

const addSchema = z.object({
  url: z.string().min(3),
  label: z.string().optional(),
  slackWebhook: z.string().url().optional().or(z.literal("")),
});

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  let parsed;
  try {
    parsed = addSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }
  const page = await addMonitoredPage(user.id, parsed.url, parsed.label, parsed.slackWebhook || undefined);
  return NextResponse.json({ page });
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
  await removeMonitoredPage(user.id, parsed.id);
  return NextResponse.json({ ok: true });
}
