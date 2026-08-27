#!/usr/bin/env node
/**
 * Runs an AXO monitoring pass by calling the running app's own API — this is what
 * you point an OS cron / Vercel Cron / GitHub Actions schedule at, since nothing
 * inside a serverless or dev-server process can reliably schedule itself.
 *
 * Usage:
 *   node scripts/check-monitors.mjs                          # http://localhost:3000
 *   APP_URL=https://epicsem.example.com node scripts/check-monitors.mjs
 *
 * Example crontab entry (every 6 hours, against a deployed instance):
 *   0 star/6 * * *  APP_URL=https://epicsem.example.com node /path/to/scripts/check-monitors.mjs >> /var/log/epicsem-monitor.log 2>&1
 *   (replace "star" with an actual asterisk — kept spelled out here so this file
 *   doesn't get misread as a live cron table)
 */

const appUrl = process.env.APP_URL || "http://localhost:3000";

async function main() {
  const res = await fetch(`${appUrl}/api/monitor/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
