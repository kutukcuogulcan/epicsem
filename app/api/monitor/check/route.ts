import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listAllMonitoredPages, listMonitoredPages } from "@/lib/db";
import { checkMonitoredPage } from "@/lib/monitor";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";

const bodySchema = z.object({ pageId: z.number().optional(), all: z.boolean().optional() });

/**
 * Two callers hit this route: a signed-in user clicking "Check now" (scoped to their
 * own pages only), and scripts/check-monitors.mjs running unattended from an external
 * scheduler (no session — authenticates with a shared CRON_SECRET header instead, and
 * is the only caller allowed to sweep every user's pages in one pass).
 */
export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get("x-cron-secret");
  const isCron = !!process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET;

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json().catch(() => ({})));
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }

  let pages;
  if (isCron) {
    const all = await listAllMonitoredPages();
    pages = parsed.all || !parsed.pageId ? all : all.filter((p) => p.id === parsed.pageId);
  } else {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

    // Manual "check now" clicks only — the cron sweep above is exempt since it's
    // the scheduled backbone job, not a user hammering a button.
    const limitResult = rateLimit(`monitor-check:${user.id}`, 40, 60 * 60 * 1000);
    if (!limitResult.allowed) {
      return NextResponse.json(
        { error: "Rate limit reached — up to 40 manual checks per hour. Try again shortly." },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limitResult.resetAt)) } }
      );
    }

    const mine = await listMonitoredPages(user.id);
    pages = parsed.all || !parsed.pageId ? mine : mine.filter((p) => p.id === parsed.pageId);
  }

  if (pages.length === 0) {
    // A "sweep everything" request (cron, or a user's "check all") finding zero pages
    // is a perfectly normal empty state — a brand-new account/instance with nothing
    // added yet — not an error. Only a specific pageId that matches nothing is a 404.
    if (parsed.all || !parsed.pageId) {
      return NextResponse.json({ results: [] });
    }
    return NextResponse.json({ error: "No monitored pages match this request" }, { status: 404 });
  }

  const results = [];
  for (const page of pages) {
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
