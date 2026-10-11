#!/usr/bin/env node
/** Günlük sıralama kontrolü — GitHub Actions cron'dan çağrılır (bkz. scripts/check-monitors.mjs). */
const appUrl = process.env.APP_URL || "http://localhost:3000";
const cronSecret = process.env.CRON_SECRET;
if (!cronSecret) {
  console.error("[epicsem-rankings] CRON_SECRET is not set");
  process.exit(1);
}
const res = await fetch(`${appUrl}/api/rankings/check`, { method: "POST", headers: { "Content-Type": "application/json", "x-cron-secret": cronSecret }, body: "{}" });
const data = await res.json().catch(() => ({}));
if (!res.ok) {
  // Anahtar tanımlı değilse sessizce geç — özellik kapalı.
  if (data.needsKey) {
    console.log("[epicsem-rankings] SerpApi key not configured — skipped");
    process.exit(0);
  }
  console.error(`[epicsem-rankings] failed: ${data.error ?? res.statusText}`);
  process.exit(1);
}
console.log(`[epicsem-rankings] ${new Date().toISOString()} — ${data.checked} keyword(s) checked`, data.errors?.length ? data.errors : "");
