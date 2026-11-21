// Autoblog zamanlamasının kaymadığını doğrular. Çalıştır: node --experimental-strip-types scripts/check-campaign-schedule.mjs
import assert from "node:assert/strict";
import { computeNextRun } from "../lib/campaign-schedule.ts";

const H = 3600e3, D = 24 * H;
const t0 = Date.parse("2026-11-01T00:00:00Z");
const c = (nextRunAt) => ({ frequency: "daily", nextRunAt, options: { randomMinutes: 0 } });

// Cron 40 dk geç çalıştı: sonraki çalışma planlanan saatten +24 sa (kayma yok).
assert.equal(computeNextRun(c(new Date(t0).toISOString()), t0 + 40 * 60e3).getTime(), t0 + D);
// 30 gün boyunca her gün 40 dk geç çalışsa da plan sabit kalır → 30 çalışma.
let next = new Date(t0).toISOString(), runs = 0;
for (let now = t0; now < t0 + 30 * D; now += 6 * H) {
  if (Date.parse(next) - 30 * 60e3 <= now) { runs++; next = computeNextRun(c(next), now + 40 * 60e3).toISOString(); }
}
assert.equal(runs, 30);
// Manuel erken çalışma (plan gelecekte): şimdiden say.
assert.equal(computeNextRun(c(new Date(t0 + 10 * H).toISOString()), t0).getTime(), t0 + D);
// Plan yok ya da çok eski (2 gün önce): şimdiden say.
assert.equal(computeNextRun(c(null), t0).getTime(), t0 + D);
assert.equal(computeNextRun(c(new Date(t0 - 2 * D).toISOString()), t0).getTime(), t0 + D);
console.log("check-campaign-schedule: ok");
