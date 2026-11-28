// Peec tarzı soru önerisi. Çalıştır: node --experimental-strip-types scripts/check-prompt-suggest.mjs
import assert from "node:assert/strict";
import { suggestionPrompt, parseSuggestions } from "../lib/prompt-suggest.ts";

const runs = [{ promptText: "En iyi kedi maması hangisi?", topic: "Kedi", searchQueries: ["kısırlaştırılmış kedi maması fiyat", "tahılsız kedi maması"] }];
const p = suggestionPrompt("Purina", runs, ["Royal Canin"]);
assert.match(p, /tahılsız kedi maması/);
assert.match(p, /En iyi kedi maması hangisi\?/);
const out = parseSuggestions(
  { suggestions: [
    { text: "Tahılsız kedi maması gerçekten daha sağlıklı mı?", topic: "Kedi", why: "AI 'tahılsız kedi maması' aradı" },
    { text: "en iyi kedi maması hangisi", topic: "Kedi" },
    { text: "Purina Pro Plan iyi mi?", topic: "Marka" },
    { text: "kısa?", topic: "x" },
    { text: "Tahılsız kedi maması gerçekten daha sağlıklı mı?", topic: "Kedi" },
  ] },
  "Purina",
  ["En iyi kedi maması hangisi?"]
);
assert.deepEqual(out.map((x) => x.text), ["Tahılsız kedi maması gerçekten daha sağlıklı mı?"], "takip edilen, markalı, kısa ve tekrar edenler atılır");
assert.equal(parseSuggestions({ suggestions: [{ text: "Royal Canin, Pro Plan ve Brit arasında fark var mı?", topic: "Köpek" }] }, "Purina", [], ["Pro Plan"]).length, 0, "alt marka geçen soru markasız değildir");
console.log("check-prompt-suggest: ok");
