// Sıralama değişimi açıklaması: kim geçti, kim yeni girdi, ilk 10'dan çıkış, AI Overview.
// Çalıştır: node --experimental-strip-types scripts/check-rank-explain.mjs
import assert from "node:assert/strict";
import { explainMove } from "../lib/rank-explain.ts";

const r = (p, d) => ({ p, d, u: `https://${d}/x`, t: d });
const prev = { top: [r(1, "a.com"), r(2, "b.com"), r(3, "www.ben.com"), r(4, "c.com")], ai: false, paa: [] };
const cur = { top: [r(1, "a.com"), r(2, "yeni.com"), r(3, "c.com"), r(4, "b.com"), r(5, "ben.com")], ai: true, paa: [] };
const e = explainMove("ben.com", 3, 5, prev, cur);
assert.deepEqual(e.above.map((x) => [x.d, x.was]), [["a.com", 1], ["yeni.com", null], ["c.com", 4], ["b.com", 2]]);
assert.match(e.lines[0], /2 sıra düştün \(3\. → 5\.\)/);
assert.ok(e.lines.some((l) => l === "Üstüne yeni giren: yeni.com (2.)."));
assert.ok(e.lines.some((l) => l === "Seni geçen: c.com (4. → 3.)."));
assert.ok(e.lines.some((l) => /AI Overview gösteriyor/.test(l)));

const out = explainMove("ben.com", 8, null, prev, cur);
assert.ok(out.lines.some((l) => /İlk 100'ün dışına/.test(l)) && out.lines.some((l) => /İlk sayfadan/.test(l)));
assert.equal(out.above.length, 4, "sıralanmıyorsan ilk 10 (kendi siten hariç) üstünde");

const first = explainMove("ben.com", null, 5, null, cur);
assert.match(first.lines[0], /bir sonraki kontrol/);
assert.ok(first.above.every((x) => x.was === null));
console.log("check-rank-explain: ok");
