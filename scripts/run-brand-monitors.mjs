#!/usr/bin/env node
/** Marka Monitörleri otomatik çalıştırma — GitHub Actions cron'dan çağrılır. */
const appUrl = process.env.APP_URL || "http://localhost:3000";
const cronSecret = process.env.CRON_SECRET;
if (!cronSecret) {
  console.error("[epicsem-brand-monitors] CRON_SECRET is not set");
  process.exit(1);
}
const res = await fetch(`${appUrl}/api/brand-monitors/run`, { method: "POST", headers: { "Content-Type": "application/json", "x-cron-secret": cronSecret }, body: "{}" });
const data = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`[epicsem-brand-monitors] failed: ${data.error ?? res.statusText}`);
  process.exit(1);
}
const failed = (data.results ?? []).filter((r) => !r.ok);
console.log(`[epicsem-brand-monitors] ${new Date().toISOString()} — ${data.checked} monitor(s) due, ${failed.length} failed`, failed.length ? failed : "");
