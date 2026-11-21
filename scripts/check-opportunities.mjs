// GEO analist çıktısında kanıta dayanmayan fırsatların atıldığını doğrular. Çalıştır: node --experimental-strip-types scripts/check-opportunities.mjs
import assert from "node:assert/strict";
import { validateOpportunities, impactOf } from "../lib/opportunity-check.ts";

const ev = {
  prompts: [{ i: 0, text: "en iyi ön muhasebe programı", answers: 3, lost: 2 }, { i: 1, text: "e-fatura nasıl kesilir", answers: 3, lost: 0 }],
  sources: [{ domain: "izibiz.com.tr", count: 3, urls: ["https://izibiz.com.tr/a"] }, { domain: "reddit.com", count: 1, urls: ["https://reddit.com/r/x"] }],
  totalAnswers: 6,
};

const r = validateOpportunities([
  { category: "outreach", title: "izibiz karşılaştırmasına gir", why: "AI 3 cevapta bu listeyi gösterdi.", prompts: [0], sources: ["www.izibiz.com.tr", "uydurma.com"] },
  { category: "creation", title: "Uydurma soru için yazı", why: "Kanıtta olmayan soru numarası.", prompts: [9] },
  { category: "social", title: "Kaynaksız topluluk işi", why: "Kaynak verilmemiş dış site işi.", prompts: [0], sources: [] },
  { category: "bilinmeyen", title: "Geçersiz tür", why: "Tür listede yok.", prompts: [0] },
  { category: "creation", title: "e-Fatura rehberi yaz", why: "Kaybedilmeyen soru; düşük etki.", prompts: [1] },
  { category: "outreach", title: "İZİBİZ karşılaştırmasına gir", why: "Aynı başlık (büyük harf) tekrar.", prompts: [0], sources: ["izibiz.com.tr"] },
], ev);

assert.equal(r.length, 2);
// Kanıttaki kaynak kalır, uydurma alan adı atılır; www. temizlenir.
assert.deepEqual(r[0].sources.map((s) => s.domain), ["izibiz.com.tr"]);
// Etki bandı kodla: 2/6 kayıp (≥%30) → yüksek, önce gelir; kaybı olmayan soru → düşük.
assert.equal(r[0].impact, "high");
assert.equal(r[1].impact, "low");
assert.equal(impactOf(1, 10, 2), "medium");
assert.equal(validateOpportunities(null, ev).length, 0);

console.log("check-opportunities: ok");
