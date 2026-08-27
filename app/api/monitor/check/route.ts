import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listMonitoredPages } from "@/lib/db";
import { checkMonitoredPage } from "@/lib/monitor";

const bodySchema = z.object({ pageId: z.number().optional(), all: z.boolean().optional() });

export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = bodySchema.parse(await req.json().catch(() => ({})));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid body" }, { status: 400 });
  }

  const pages = listMonitoredPages();
  const targets = parsed.all || !parsed.pageId ? pages : pages.filter((p) => p.id === parsed.pageId);

  if (targets.length === 0) {
    return NextResponse.json({ error: "No monitored pages match this request" }, { status: 404 });
  }

  const results = [];
  for (const page of targets) {
    try {
      results.push(await checkMonitoredPage(page));
    } catch (err) {
      results.push({
        pageId: page.id,
        url: page.url,
        error: err instanceof Error ? err.message : "Check failed",
      });
    }
  }

  return NextResponse.json({ results });
}
