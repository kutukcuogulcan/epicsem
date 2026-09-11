import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listAllActiveCampaigns, listCampaigns } from "@/lib/db";
import { isCampaignDue, runCampaign } from "@/lib/campaign";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";

const bodySchema = z.object({ campaignId: z.number().optional(), all: z.boolean().optional() });

/**
 * Same two-caller shape as /api/monitor/check: the shared GitHub Actions cron sweep
 * (CRON_SECRET header, every active campaign across every user, only the ones that
 * are actually due for their frequency), and a signed-in user manually running their
 * own campaign now instead of waiting.
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

  let campaigns;
  if (isCron) {
    const all = await listAllActiveCampaigns();
    campaigns = (parsed.all || !parsed.campaignId ? all : all.filter((c) => c.id === parsed.campaignId)).filter(isCampaignDue);
  } else {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

    const limitResult = rateLimit(`campaign-run:${user.id}`, 20, 60 * 60 * 1000);
    if (!limitResult.allowed) {
      return NextResponse.json(
        { error: "Rate limit reached — up to 20 manual campaign runs per hour. Try again shortly." },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limitResult.resetAt)) } }
      );
    }

    const mine = await listCampaigns(user.id);
    // A manual "run now" click ignores the due-date check — that's the whole point of
    // a manual trigger — but the cron sweep above only ever touches due campaigns.
    campaigns = parsed.all || !parsed.campaignId ? mine : mine.filter((c) => c.id === parsed.campaignId);
  }

  if (campaigns.length === 0) {
    if (parsed.all || !parsed.campaignId) return NextResponse.json({ results: [] });
    return NextResponse.json({ error: "No campaign matches this request" }, { status: 404 });
  }

  const results = [];
  for (const campaign of campaigns) {
    results.push(await runCampaign(campaign));
  }

  return NextResponse.json({ results });
}
