// Autoblog kuyruğu bitince yeni anahtar kelimeler. Çalıştır: node --experimental-strip-types scripts/check-keyword-refill.mjs
import assert from "node:assert/strict";
import { refillPrompt, parseRefill } from "../lib/keyword-refill.ts";

assert.match(refillPrompt("arabam.com", "arabam.com", ["araba tamiri"]), /araba tamiri/);
const out = parseRefill({ keywords: ["Araba tamiri", "fren balatası değişim ücreti", "fren balatası değişim ücreti", "motor", "  ikinci el araç   ekspertiz nasıl yapılır ", 5] }, ["araba tamiri"]);
assert.deepEqual(out, ["fren balatası değişim ücreti", "ikinci el araç ekspertiz nasıl yapılır"], "kullanılmış, tekrar eden, tek kelimelik ve bozuk değerler atılır");
assert.deepEqual(parseRefill({}, []), []);
console.log("check-keyword-refill: ok");
