#!/usr/bin/env node
/**
 * Runs an AXO monitoring pass by calling the running app's own API — this is what
 * you point an OS cron / Vercel Cron / GitHub Actions schedule at, since nothing
 * inside a serverless or dev-server process can reliably schedule itself.
 *
 * This checks pages across EVERY signed-up user in one pass (that's the whole point
 * of a background sweep in a multi-tenant app), so it authenticates with a shared
 * CRON_SECRET header instead of a user session — set the same value in the app's
 * CRON_SECRET env var and in whatever runs this script.
 *
 * Usage:
 *   CRON_SECRET=... node scripts/check-monitors.mjs                          # http://localhost:3000
 *   CRON_SECRET=... APP_URL=https://epicsem.example.com node scripts/check-monitors.mjs
 *
 * Example crontab entry (every 6 hours, against a deployed instance):
 *   0 star/6 * * *  CRON_SECRET=... APP_URL=https://epicsem.example.com node /path/to/scripts/check-monitors.mjs >> /var/log/epicsem-monitor.log 2>&1
 *   (replace "star" with an actual asterisk — kept spelled out here so this file
 *   doesn't get misread as a live cron table)
 */

const appUrl = process.env.APP_URL || "http://localhost:3000";
const cronSecret = process.env.CRON_SECRET;

async function main() {
  if (!cronSecret) {
    console.error("[epicsem-monitor] CRON_SECRET is not set — refusing to run (it's what lets this script sweep every user's pages instead of just one signed-in user's).");
    process.exit(1);
  }
  const res = await fetch(`${appUrl}/api/monitor/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": cronSecret },
    body: JSON.stringify({ all: true }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(`[epicsem-monitor] check failed: ${data.error ?? res.statusText}`);
    process.exit(1);
  }
  const results = data.results ?? [];
  const alerted = results.filter((r) => r.alertRaised);
  console.log(`[epicsem-monitor] ${new Date().toISOString()} — checked ${results.length} page(s), ${alerted.length} new alert(s)`);
  for (const r of results) {
    if (r.error) {
      console.error(`  ✗ ${r.url}: ${r.error}`);
    } else if (r.newlyBlocked?.length) {
      console.warn(`  ⚠ ${r.url}: newly blocked — ${r.newlyBlocked.join(", ")}`);
    } else {
      console.log(`  ✓ ${r.url}: SEO ${r.score} / AXO ${r.aiCrawlScore}, ${r.blockedBots.length} blocked`);
    }
  }
  if (alerted.length > 0) process.exitCode = 2; // non-zero so cron mail/alerting notices something happened
}

main().catch((err) => {
  console.error("[epicsem-monitor] fatal:", err);
  process.exit(1);
});
