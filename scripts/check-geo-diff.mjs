// İki GEO testi arasındaki farkın doğru sayıldığını doğrular. Çalıştır: node --experimental-strip-types scripts/check-geo-diff.mjs
import assert from "node:assert/strict";
import { diffRuns } from "../lib/geo-diff.ts";

const c = (prompt, engine, status, rivals = [], sources = []) => ({ prompt, engine, status, ownRank: null, rivals, sources });
const prev = [c("A", "openai", "lost", ["Mikro"], ["x.com"]), c("B", "openai", "won"), c("C", "google", "mentioned", ["Logo"], ["y.com"]), c("ESKİ", "openai", "won")];
const cur = [c("A", "openai", "won"), c("B", "openai", "lost", ["BizimHesap"]), c("C", "google", "mentioned", ["Logo", "BizimHesap"], ["y.com", "z.com"]), c("YENİ", "openai", "lost")];

const d = diffRuns(prev, cur);
// Yalnızca iki testte de olan çiftler (ESKİ / YENİ sayılmaz).
assert.equal(d.compared, 3);
assert.deepEqual(d.gained.map((g) => g.prompt), ["A"]);
assert.deepEqual(d.lost.map((l) => [l.prompt, l.rivals]), [["B", ["BizimHesap"]]]);
// Görünürlük aynı çiftler üzerinden: önce 2/3 (B, C), sonra 2/3 (A, C).
assert.equal(d.visibilityBefore, 2 / 3);
assert.equal(d.visibilityAfter, 2 / 3);
// BizimHesap 0 → 2 cevap, Mikro 1 → 0; Logo değişmedi.
assert.deepEqual(d.rivals, [{ name: "BizimHesap", before: 0, after: 2 }, { name: "Mikro", before: 1, after: 0 }]);
assert.deepEqual(d.newSources, ["z.com"]);
assert.deepEqual(d.goneSources, ["x.com"]);
assert.equal(diffRuns([], cur).compared, 0);

console.log("check-geo-diff: ok");
