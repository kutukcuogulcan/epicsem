// Backlinkler: AI kaynak siteleri toplama + ulaşma planı. Çalıştır: node --experimental-strip-types scripts/check-ai-source-outreach.mjs
import assert from "node:assert/strict";
import { aggregateSources, outreachPlan } from "../lib/ai-source-outreach.ts";

const run = (promptText, mentioned, urls) => ({ engine: "openai", model: "m", promptText, topic: "", branded: false, mentioned, position: null, sentiment: null, responseText: "", citations: urls.map((url) => ({ url, domain: new URL(url).hostname, isOwnDomain: url.includes("ben.com") })) });
const src = aggregateSources(
  [
    run("en iyi program?", false, ["https://www.rehber.com/liste?utm=x", "https://ben.com/a", "https://logo.com.tr/x"]),
    run("e-fatura?", true, ["https://rehber.com/liste", "https://eksisozluk.com/t"]),
    run("e-fatura?", false, ["https://eksisozluk.com/t"]),
  ],
  "ben.com",
  ["logo.com.tr"],
  (d) => (d.includes("eksi") ? "UGC" : "Editorial")
);
assert.equal(src.length, 2, "kendi ve rakip siteleri hariç; aynı sayfa (www, sorgu) tek kayıt");
assert.ok(src.every((s) => s.cites === 2 && s.withoutYou === 1));
assert.deepEqual(src.find((s) => s.domain === "rehber.com").prompts, ["en iyi program?", "e-fatura?"]);

assert.equal(outreachPlan("Editorial", { rivals: ["Logo"], you: false, linksYou: false }).status, "rakip-var-sen-yok");
assert.match(outreachPlan("UGC", { rivals: [], you: false, linksYou: false }).action, /marka hesabıyla/);
assert.match(outreachPlan("Editorial", { rivals: [], you: true, linksYou: false }).label, /link yok/);
assert.equal(outreachPlan("Other", null).status, "okunamadi");
assert.doesNotMatch(outreachPlan("Retail", { rivals: [], you: true, linksYou: false }).action, /yazar/i, "mağazada yazara ulaş denmez");
assert.match(outreachPlan("Retail", { rivals: [], you: true, linksYou: false }).label, /listede/);
console.log("check-ai-source-outreach: ok");
