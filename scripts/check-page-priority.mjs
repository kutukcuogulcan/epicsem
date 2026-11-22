// Site Gezgini sayfa önceliği: aynı sorunda önemli sayfa (çok iç link, sığ) önce; sorunsuz sayfa listede yok.
// Çalıştır: node --experimental-strip-types scripts/check-page-priority.mjs
import assert from "node:assert/strict";
import { prioritizedPages, pagePriority } from "../lib/page-priority.ts";

const row = (url, issues, inlinks, depth, inSitemap = true) => ({ url, issues, statusCode: 200, indexable: true, title: null, titleLength: null, metaDescription: null, metaDescriptionLength: null, h1: null, h1Count: 1, wordCount: 500, canonical: null, metaRobots: null, metrics: { inlinks, depth, inSitemap } });
const list = prioritizedPages([
  row("https://x.com/derin/sayfa", ["missing-title"], 1, 4, false),
  row("https://x.com/fiyatlar", ["missing-title"], 40, 1),
  row("https://x.com/", ["missing-meta-description"], 0, 0),
  row("https://x.com/temiz", [], 50, 1),
]);
assert.equal(list.length, 3, "sorunsuz sayfa listelenmez");
assert.equal(list.at(-1).url, "https://x.com/derin/sayfa", "aynı sorunda derin, az linkli sayfa en sonda");
assert.ok(list.findIndex((p) => p.url === "https://x.com/fiyatlar") < 2);
assert.match(pagePriority(row("https://x.com/fiyatlar", ["missing-title"], 40, 1)).why, /40 iç link alıyor · ana sayfadan 1 tık/);
assert.match(pagePriority(row("https://x.com/", [], 0, 0)).why, /^Ana sayfa/);
console.log("check-page-priority: ok");
