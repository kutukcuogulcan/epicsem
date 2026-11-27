// Alt marka sonradan eklenince eski testlerin yeniden sayımı. Çalıştır: node --experimental-strip-types scripts/check-alias-recount.mjs
import assert from "node:assert/strict";
import { recountWithAliases } from "../lib/alias-recount.ts";

const run = (topic, text, mentioned) => ({ engine: "openai", model: "m", promptText: text, topic, responseText: text, mentioned, position: null, sentiment: null, citations: [], branded: false });
const stored = {
  runs: [run("Kedi", "Pro Plan ve Royal Canin.", false), run("Kedi", "Purina iyi.", true), run("Köpek", "Royal Canin.", false), run("Köpek", "", false)],
  summaries: [{ brand: "Purina", domain: "purina.com.tr", visibility: 0.25, shareOfVoice: 0.2, avgPosition: 2, avgSentiment: 70, citationCount: 0 }, { brand: "Royal Canin", domain: "royalcanin.com", visibility: 0.5, shareOfVoice: 0.5, avgPosition: 1, avgSentiment: 70, citationCount: 0 }],
  topics: [{ topic: "Kedi", visibility: 0.5, mentionedCount: 1, totalCount: 2 }, { topic: "Köpek", visibility: 0, mentionedCount: 0, totalCount: 2 }],
};
const out = recountWithAliases(stored, { name: "Purina", domain: "purina.com.tr", aliases: ["Pro Plan"] });
assert.equal(out.runs.filter((r) => r.mentioned).length, 2);
assert.equal(out.summaries[0].visibility, 0.5);
assert.equal(out.summaries[1].visibility, 0.5, "rakip özeti değişmez");
assert.deepEqual(out.topics[0], { topic: "Kedi", visibility: 1, mentionedCount: 2, totalCount: 2 });
assert.deepEqual(out.topics[1], stored.topics[1]);
assert.equal(recountWithAliases(stored, { name: "Purina", domain: "purina.com.tr", aliases: ["Felix"] }), null, "değişiklik yoksa yazma");
console.log("check-alias-recount: ok");
