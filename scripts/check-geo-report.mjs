// "Neden önerilmiyorum?" raporu. Çalıştır: node --experimental-strip-types scripts/check-geo-report.mjs
import assert from "node:assert/strict";
import { buildGeoReport } from "../lib/geo-report.ts";

const run = (engine, promptText, responseText, mentioned, citations = [], searchQueries = []) => ({ engine, model: "m", promptText, topic: promptText.startsWith("kıs") ? "Kısır" : "", responseText, mentioned, position: null, sentiment: null, citations, searchQueries });
const own = { name: "Purina", domain: "purina.com.tr", aliases: ["Pro Plan"] };
const rivals = [{ name: "Royal Canin", domain: "royalcanin.com" }];
const runs = [
  // eski test: alt marka sonradan eklendi, kayıtlı mentioned=false ama Pro Plan geçiyor → anılmış sayılmalı
  run("openai", "en iyi kedi maması", "Royal Canin ve Pro Plan öne çıkar.", false),
  run("anthropic", "en iyi kedi maması", "Pro Plan iyidir.", true),
  run("openai", "kısırlaştırılmış kedi maması", "Royal Canin Sterilised önerilir.", false, [{ url: "https://petlebi.com/x", domain: "petlebi.com" }], ["kısır kedi maması"]),
  run("anthropic", "kısırlaştırılmış kedi maması", "Royal Canin iyi bir seçimdir.", false, [{ url: "https://petlebi.com/y", domain: "petlebi.com" }, { url: "https://www.royalcanin.com/tr/kedi?utm_source=openai", domain: "www.royalcanin.com" }]),
];
const r = buildGeoReport(runs, own, rivals);
assert.equal(r.answers, 4);
assert.equal(r.questions, 2);
assert.equal(r.visibility, 0.5, "alt marka eski cevapta da sayılır");
assert.deepEqual(r.wonQuestions, ["en iyi kedi maması"]);
assert.equal(r.lost.length, 1);
assert.equal(r.lost[0].lost, 2);
assert.deepEqual(r.lost[0].searches, ["kısır kedi maması"]);
assert.deepEqual(r.gapSources, [{ domain: "petlebi.com", count: 2, rivals: ["Royal Canin"] }], "rakip sitesi boşluk kaynağı değil");
assert.equal(r.brands[0].name, "Royal Canin");
assert.equal(r.ownCitedIn, 0);
assert.ok(r.actions.some((a) => a.title.includes("petlebi.com")));
assert.ok(r.actions.some((a) => a.title.includes("kısırlaştırılmış")));
assert.deepEqual(r.topics.map((t) => [t.topic, t.visibility, t.leader?.name]), [["Kısır", 0, "Royal Canin"], ["Genel", 1, "Royal Canin"]], "en zayıf konu önce; konusuz soru Genel");
assert.equal(r.leader.name, "Royal Canin");
assert.equal(r.leader.aheadIn, 3, "Purina'nın önünde ya da Purina yokken anıldığı cevaplar");
assert.equal(r.leader.citedIn, 1);
assert.deepEqual(r.leader.pages, [{ url: "https://www.royalcanin.com/tr/kedi", count: 1 }]);
assert.ok(r.actions[0].title.startsWith("Royal Canin"), "önde olduğu 3 cevap > kaybedilen 2 cevap → ilk iş");
assert.equal(buildGeoReport([], own, rivals).answers, 0);
console.log("check-geo-report: ok");
