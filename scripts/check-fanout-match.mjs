// npx tsx scripts/check-fanout-match.mjs — AI aramaları ↔ site adresi eşleştirme öz-denetimi
import assert from "node:assert";
const { aggregateFanout, matchUrls } = await import("../lib/fanout.ts");
const run = (engine, q, mentioned) => ({ engine, promptText: "p", mentioned, searchQueries: q });
const a = aggregateFanout([run("chatgpt", ["En iyi ön muhasebe programı", "e-fatura nasıl kesilir"], true), run("gemini", ["en iyi ön muhasebe programı"], false)]);
assert.equal(a[0].count, 2); assert.deepEqual(a[0].engines, ["chatgpt", "gemini"]); assert.equal(a[0].ownMentionRate, 0.5);
const m = matchUrls(["e-fatura nasıl kesilir", "kobi kredisi faiz oranları", "Paraşüt fiyatları"], ["https://x.com/blog/e-fatura-nasil-kesilir", "https://x.com/fiyatlar", "https://x.com/kobi"], ["paraşüt"]);
assert.ok(m[0]?.url.endsWith("e-fatura-nasil-kesilir")); assert.equal(m[1], null); assert.ok(m[2]?.url.endsWith("/fiyatlar"));
console.log("fanout ok");
