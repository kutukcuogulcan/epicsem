// Alt marka sonradan eklenince eski cevapların yeniden sayımı. Çalıştır: node --experimental-strip-types scripts/check-alias-recount.mjs
import assert from "node:assert/strict";
import { recountWithAliases } from "../lib/alias-recount.ts";

const run = (text, mentioned) => ({ engine: "openai", model: "m", promptText: text, topic: "", responseText: text, mentioned, position: null, sentiment: null, citations: [], branded: false });
const runs = [run("Pro Plan ve Royal Canin.", false), run("Purina iyi.", true), run("Royal Canin.", false), run("", false)];
const out = recountWithAliases(runs, { name: "Purina", aliases: ["Pro Plan"] });
assert.deepEqual(out.map((r) => r.mentioned), [true, true, false, false]);
assert.equal(out[1], runs[1], "anılmış cevap aynen kalır");
assert.equal(recountWithAliases(runs, { name: "Purina", aliases: [] }), runs);
console.log("check-alias-recount: ok");
