// Yanlış bilgi tespitinde uydurma bulgunun elendiğini doğrular. Çalıştır: node --experimental-strip-types scripts/check-fact-check.mjs
import assert from "node:assert/strict";
import { keepVerified } from "../lib/fact-check.ts";

const kb = "Paraşüt 2013'te kuruldu. Ücretsiz deneme süresi 14 gündür.";
const answers = [{ engine: "openai", prompt: "paraşüt deneme", text: "Paraşüt'ün ücretsiz deneme süresi 7 gündür. Arayüzü sade." }];

// Gerçek çelişki: iki alıntı da birebir geçiyor → tutulur (büyük/küçük harf ve boşluk farkı önemsiz).
let r = keepVerified([{ answer: 0, claim: "ücretsiz deneme süresi 7  gündür", truth: "Ücretsiz deneme süresi 14 gündür.", why: "7 değil 14 gün." }], answers, kb);
assert.equal(r.length, 1);
assert.equal(r[0].engine, "openai");

// Model cevapta olmayan cümle uydurdu → atılır.
r = keepVerified([{ answer: 0, claim: "Paraşüt 2010'da kuruldu", truth: "Paraşüt 2013'te kuruldu.", why: "" }], answers, kb);
assert.equal(r.length, 0);

// Bilgi bankasında olmayan "doğru" → atılır.
r = keepVerified([{ answer: 0, claim: "deneme süresi 7 gündür", truth: "Deneme 30 gündür.", why: "" }], answers, kb);
assert.equal(r.length, 0);

// Olmayan cevap numarası ve bozuk girdi → atılır, hata vermez.
assert.equal(keepVerified([{ answer: 5, claim: "deneme süresi 7 gündür", truth: "Paraşüt 2013'te kuruldu." }], answers, kb).length, 0);
assert.equal(keepVerified(null, answers, kb).length, 0);

console.log("check-fact-check: ok");
