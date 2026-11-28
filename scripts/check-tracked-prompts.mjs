// Otomatik izlemenin sabit soru seti. Çalıştır: node --experimental-strip-types scripts/check-tracked-prompts.mjs
import assert from "node:assert/strict";
import { buildGeoReport } from "../lib/geo-report.ts";
import { pickTrackedPrompts } from "../lib/tracked-prompts.ts";

const run = (q, text, topic = "Genel") => ({ engine: "openai", model: "m", promptText: q, topic, responseText: text, mentioned: /Purina/.test(text), position: null, sentiment: null, citations: [], branded: false });
const runs = [
  run("kazanılan", "Purina en iyisi."),
  run("geride", "Royal Canin önce, sonra Purina.", "Kedi"),
  run("kaybedilen", "Royal Canin iyidir.", "Köpek"),
  run("boş", "Hiçbir marka yok."),
];
const r = buildGeoReport(runs, { name: "Purina", domain: "purina.com.tr" }, [{ name: "Royal Canin", domain: "royalcanin.com" }]);
const picked = pickTrackedPrompts(runs, r, 3);
assert.deepEqual(picked.map((p) => p.text), ["kaybedilen", "boş", "geride"], "önce kaybedilen, sonra rakibin önde olduğu");
assert.equal(picked[0].topic, "Köpek", "konu korunur");
assert.equal(pickTrackedPrompts(runs, r, 10).length, 4, "soru sayısından fazlası istenemez");
console.log("check-tracked-prompts: ok");
