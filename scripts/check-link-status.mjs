// Kırık link sınıflandırması. Çalıştır: node --experimental-strip-types scripts/check-link-status.mjs
import assert from "node:assert/strict";
import { isBrokenStatus } from "../lib/link-status.ts";

for (const s of [404, 410, 500, 503]) assert.equal(isBrokenStatus(s), true, `${s} kırık`);
for (const s of [200, 301, 302, 401, 403, 429, 999, 0, undefined, null]) assert.equal(isBrokenStatus(s), false, `${s} kırık sayılmaz (bot koruması/zaman aşımı doğrulanamaz)`);
console.log("check-link-status: ok");
