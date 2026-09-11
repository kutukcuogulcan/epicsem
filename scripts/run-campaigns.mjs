#!/usr/bin/env node
/**
 * Runs a Campaign sweep by calling the running app's own API — same shape as
 * scripts/check-monitors.mjs (see that file's header for why an external scheduler
 * has to be the one hitting this, not the app itself). This checks every active
 * campaign across every signed-up user, but /api/campaigns/run only actually
 * generates a draft for the ones due for their frequency (weekly/monthly) — most
 * calls to this script do nothing at all, which is expected, not a bug.
 *
 * Usage:
 *   CRON_SECRET=... node scripts/run-campaigns.mjs                          # http://localhost:3000
 *   CRON_SECRET=... APP_URL=https://epicsem.example.com node scripts/run-campaigns.mjs
 */

const appUrl = process.env.APP_URL || "http://localhost:3000";
const cronSecret = process.env.CRON_SECRET;

async function main() {
  if (!cronSecret) {
    console.error("[epicsem-campaigns] CRON_SECRET is not set — refusing to run (it's what lets this script sweep every user's campaigns instead of just one signed-in user's).");
    process.exit(1);
  }
  const res = await fetch(`${appUrl}/api/campaigns/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": cronSecret },
    body: JSON.stringify({ all: true }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(`[epicsem-campaigns] sweep failed: ${data.error ?? res.statusText}`);
    process.exit(1);
  }
  const results = data.results ?? [];
  const generated = results.filter((r) => r.status === "generated");
  console.log(`[epicsem-campaigns] ${new Date().toISOString()} — ${results.length} campaign(s) due, ${generated.length} new draft(s) generated`);
  for (const r of results) {
    console.log(`  campaign #${r.campaignId}: ${r.status} — ${r.message}`);
  }
}

main().catch((err) => {
  console.error("[epicsem-campaigns] fatal:", err);
  process.exit(1);
});
