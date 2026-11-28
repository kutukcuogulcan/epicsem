// Ürün görünürlüğü. Çalıştır: node --experimental-strip-types scripts/check-product-visibility.mjs
import assert from "node:assert/strict";
import { productExcerpts, countProducts } from "../lib/product-visibility.ts";

const run = (engine, t) => ({ engine, model: "m", promptText: "q", topic: "", responseText: t, mentioned: false, position: null, sentiment: null, citations: [] });
const runs = [
  run("openai", "Royal Canin Renal böbrek için iyidir. Pro Plan Sterilised da öne çıkar. Hava güzel."),
  run("anthropic", "Royal Canin Renal veteriner onaylıdır."),
];
const ex = productExcerpts(runs, ["Royal Canin", "Pro Plan"]);
assert.ok(ex.includes("Royal Canin Renal böbrek") && !ex.includes("Hava güzel"), "yalnızca marka cümleleri");
const rows = countProducts(
  { products: [
    { name: "Royal Canin Renal", brand: "Royal Canin" },
    { name: "Pro Plan Sterilised", brand: "Purina" },
    { name: "Hill's k/d", brand: "Hill's" },
    { name: "royal canin renal", brand: "Royal Canin" },
  ] },
  runs,
  "Purina"
);
assert.deepEqual(rows.map((r) => [r.name, r.answers, r.own]), [["Royal Canin Renal", 2, false], ["Pro Plan Sterilised", 1, true]], "cevaplarda geçmeyen (Hill's k/d) ve tekrar eden atılır");
assert.deepEqual(rows[0].engines, ["openai", "anthropic"]);
console.log("check-product-visibility: ok");
