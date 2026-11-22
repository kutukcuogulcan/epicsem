// Görünürlük güven aralığı (Wilson). Çalıştır: node --experimental-strip-types scripts/check-sample-size.mjs
import assert from "node:assert/strict";
import { confidenceOf } from "../lib/sample-size.ts";

assert.equal(confidenceOf(0, 0), null);
const small = confidenceOf(4, 4);
assert.equal(small.level, "çok az veri");
assert.ok(small.margin >= 20, "4/4 bile kesin değil: " + small.margin);
assert.match(small.text, /Yalnızca 4 cevaba/);
assert.equal(confidenceOf(15, 30).level, "yeterli");
assert.ok(confidenceOf(15, 30).margin < confidenceOf(5, 10).margin, "daha çok cevap = daha dar aralık");
assert.ok(Math.abs(confidenceOf(500, 1000).margin - 3) <= 1, "1000 cevapta ~±3 puan");
console.log("check-sample-size: ok");
