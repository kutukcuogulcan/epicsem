// "Bu sayfaya ne eklemeli": AI cevaplarında sık geçip sayfada geçmeyen kavramlar. Çalıştır: node --experimental-strip-types scripts/check-page-terms.mjs
import assert from "node:assert/strict";
import { answerTerms, missingOnPage } from "../lib/page-terms.ts";

const answers = [
  "Paraşüt ile e-fatura kesebilir, stok takibi yapabilirsiniz. Banka entegrasyonu da var.",
  "Logo İşbaşı e-fatura ve e-arşiv destekler; stok takibi ve mobil uygulama sunar.",
  "BizimHesap mobil uygulama ile e-fatura keser, banka entegrasyonu sağlar.",
];
const terms = answerTerms(answers, ["Paraşüt", "Logo İşbaşı", "BizimHesap"]);
const names = terms.map((t) => t.term);
assert.ok(names.includes("stok takibi") && names.includes("banka entegrasyonu") && names.includes("mobil uygulama"), names.join(", "));
assert.ok(!names.some((n) => /paraşüt|bizimhesap|işbaşı/.test(n)), "marka adları kavram değil");
assert.ok(!names.includes("stok"), "ifadenin parçası tek kelime tekrar edilmez");
assert.equal(terms.find((t) => t.term === "e-fatura").docs, 3);

const miss = missingOnPage(terms, "Paraşüt ile e-fatura kesin, stok takibini kolayca yapın.").map((t) => t.term);
assert.ok(miss.includes("banka entegrasyonu") && miss.includes("mobil uygulama"));
assert.ok(!miss.includes("e-fatura") && !miss.includes("stok takibi"), "ekli hali (takibini) de 'var' sayılır");
const k = answerTerms(["KOBİ'ler için bulut tabanlı çözüm --- özet", "KOBİ'lere bulut tabanlı yazılım ---"], []).map((t) => t.term);
assert.ok(k.includes("bulut tabanlı") && !k.some((x) => /---|kobi ler/.test(x)), k.join(", "));
console.log("check-page-terms: ok");
