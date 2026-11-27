// Maya/Peec tarzı GEO özeti: olgular ve AI cevabının doğrulanması. Çalıştır: node --experimental-strip-types scripts/check-geo-summary.mjs
import assert from "node:assert/strict";
import { buildGeoReport } from "../lib/geo-report.ts";
import { summaryFacts, summaryPrompt, parseSummary } from "../lib/geo-summary.ts";

const run = (engine, q, text, cites = []) => ({ engine, model: "m", promptText: q, topic: "Genel", responseText: text, mentioned: /Purina/.test(text), position: null, sentiment: null, citations: cites, branded: false });
const runs = [
  run("openai", "en iyi kedi maması", "Royal Canin ve Purina öne çıkar.", [{ url: "https://akakce.com/a", domain: "akakce.com" }]),
  run("anthropic", "en iyi kedi maması", "Royal Canin iyidir.", [{ url: "https://akakce.com/b", domain: "akakce.com" }]),
];
const r = buildGeoReport(runs, { name: "Purina", domain: "purina.com.tr" }, [{ name: "Royal Canin", domain: "royalcanin.com" }]);
const facts = summaryFacts("Purina", r, null, ["Royal Canin iyidir."]);
assert.match(facts, /Görünürlük %50/);
assert.match(facts, /akakce\.com \(1\)/);
assert.match(facts, /Karşılaştırılacak önceki test yok/);
assert.match(summaryPrompt(facts), /uydurma/);

const ok = parseSummary({ headline: "Purina 2 cevabın 1'inde anılıyor.", cause: "null", urgentAction: "Akakce listelemesini güncelle.", actions: [{ action: "Soruyu cevaplayan sayfa yayınla", why: "1/2 motorda yok", impact: "çok", effort: "düşük" }, { action: "", why: "boş iş atılır" }] });
assert.equal(ok.cause, null, '"null" metni boş sayılır');
assert.equal(ok.actions.length, 1);
assert.equal(ok.actions[0].impact, "orta", "bilinmeyen etiket varsayılana düşer");
assert.equal(parseSummary({ actions: [] }), null, "başlıksız özet geçersiz");
console.log("check-geo-summary: ok");
