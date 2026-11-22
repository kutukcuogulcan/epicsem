// 5 katman puanı: ölçülmeyen katman null kalır, en zayıf katman ve en pahalı eksik doğru seçilir.
// Çalıştır: node --experimental-strip-types scripts/check-search-layers.mjs
import assert from "node:assert/strict";
import { searchLayers, weakestLayer } from "../lib/search-layers.ts";

const pillar = (key, score, checks = []) => ({ key, label: key, short: "", description: "", score, checks });
const pillars = [
  pillar("seo", 80, [
    { label: "Title", score: 0.6, weight: 3, found: "72 karakter" },
    { label: "Canonical", score: 0, weight: 1, found: "Yok" },
  ]),
  pillar("aeo", 40, [{ label: "FAQPage şeması", score: 0, weight: 2, found: "Yok" }]),
  pillar("axo", 90, [{ label: "llms.txt", score: null, weight: 1, found: "Ölçülmedi" }]),
];
const l = searchLayers({ pillars, geoVisibility: 0.25, sxoScore: null });
assert.deepEqual(l.map((x) => x.score), [80, 40, 25, 90, null]);
assert.equal(l[0].fix, "Title · şu an: 72 karakter", "ağırlık × kayıp en büyük olan (3×0.4 > 1×1)");
assert.equal(l[3].fix, null, "ölçülmemiş kontrol iş sayılmaz");
assert.match(l[2].fix, /yarısından azında/);
assert.equal(weakestLayer(l).key, "geo");

const empty = searchLayers({ pillars: null, geoVisibility: null, sxoScore: null });
assert.ok(empty.every((x) => x.score === null), "veri yoksa puan uydurulmaz");
assert.equal(weakestLayer(empty), null);
console.log("check-search-layers: ok");
