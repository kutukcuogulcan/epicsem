// Site Denetimi ek kontrolleri: lastmod, Content-Signal, soft 404. Çalıştır: node --experimental-strip-types scripts/check-audit-signals.mjs
import assert from "node:assert/strict";
import { contentSignalVerdict, lastmodVerdict, soft404Verdict } from "../lib/audit-signals.ts";

assert.equal(lastmodVerdict([], 2), null, "çok küçük haritada karar yok");
assert.match(lastmodVerdict([], 10).title, /lastmod\) yok/);
assert.match(lastmodVerdict(Array(8).fill("2026-11-22T10:00:00+00:00"), 8).title, /gerçek değil/);
assert.equal(lastmodVerdict(["2026-01-02", "2026-03-04", "2026-11-01", "2025-12-12", "2026-05-05"], 5).ok, true);
assert.equal(contentSignalVerdict(null), null);
assert.equal(contentSignalVerdict("User-agent: *\nContent-Signal: search=yes, ai-train=no").ok, true);
assert.equal(contentSignalVerdict("User-agent: *\nDisallow:").ok, false);
assert.equal(soft404Verdict(404, "/x").ok, true);
assert.equal(soft404Verdict(200, "/x").ok, false);
assert.match(soft404Verdict(200, "/x", "/").title, /yönleniyor/);
assert.equal(soft404Verdict(200, "/x", "/x/").title.includes("soft 404"), true, "yalnızca sonuna / eklenmesi yönlendirme sayılmaz");
assert.equal(soft404Verdict(404, "/x", "/404").ok, true, "404 sayfasına yönlenip 404 dönmek doğru");
assert.match(soft404Verdict(500, "/x").title, /sunucu hatası \(500\)/);
assert.equal(soft404Verdict(null, "/x"), null, "ulaşılamadıysa karar yok");
console.log("check-audit-signals: ok");
