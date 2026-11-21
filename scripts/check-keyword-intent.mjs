// Türkçe anahtar kelime niyet sınıflandırmasını doğrular. Çalıştır: node --experimental-strip-types scripts/check-keyword-intent.mjs
import assert from "node:assert/strict";
import { intentOf } from "../lib/keyword-research.ts";

const cases = {
  "ön muhasebe programı fiyatları": "commercial",
  "ön muhasebe programı ücretsiz": "commercial",
  "en iyi ön muhasebe programı": "commercial",
  "ön muhasebe programı nedir": "question",
  "ön muhasebe programı nasıl kullanılır": "question",
  "paraşüt mü logo mu": "question",
  "paraşüt alternatifleri": "comparison",
  "logo veya mikro": "comparison",
  "ön muhasebe programı istanbul": "local",
  "ön muhasebe programı excel": "informational",
  "fiyatlandırmacı": "informational", // "fiyat" kelimenin içinde geçiyor: ticari sayılmamalı
  "ne kadar tutar": "question",
};
for (const [k, want] of Object.entries(cases)) assert.equal(intentOf(k), want, k);
console.log("check-keyword-intent: ok");
