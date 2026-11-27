// Rakip sayfa karşılaştırması. Çalıştır: node --experimental-strip-types scripts/check-page-compare.mjs
import assert from "node:assert/strict";
import { outline, missingHeadings, suggestOwnUrls, covered } from "../lib/page-compare.ts";

const rival = outline(
  `<html><head><title>RENAL | Royal Canin</title><script type="application/ld+json">{"@type":"Product","name":"Renal"}</script></head><body>
  <nav><h2>Menü</h2></nav><main><h1>RENAL</h1><h2>FAYDALARI</h2><h3>BÖBREK SAĞLIĞINI DESTEKLER</h3><h3>MÜKEMMEL LEZZET</h3><h2>FAYDALARI</h2>
  <h2>Ürünlerimiz ile ilgili sorularınız mı var?</h2><h3>Analitik bileşenler</h3><table><tr><td>Protein</td></tr></table><ul><li>a</li></ul><p>Böbrek dostu formül.</p></main></body></html>`,
  "https://www.royalcanin.com/tr/cats/products/vet-products/renal-3900"
);
assert.equal(rival.h1, "RENAL");
assert.deepEqual(rival.schemaTypes, ["Product"]);
assert.equal(rival.headings.filter((h) => h.text === "FAYDALARI").length, 1, "tekrar eden başlık bir kez");
assert.ok(!rival.headings.some((h) => h.text === "Menü"), "menü başlıkları sayılmaz");
assert.equal(rival.faqs, 1, "şemada SSS yoksa soru başlıkları");
assert.equal(rival.tables, 1);

const own = outline(`<html><body><main><h1>NF Kidney Function</h1><p>Böbreğin sağlığını destekleyen, lezzetli mama. Faydaları: ...</p></main></body></html>`, "https://www.purina.com.tr/x");
assert.ok(covered("BÖBREK SAĞLIĞINI DESTEKLER", own.text), "ekli biçimler sayılır");
assert.deepEqual(missingHeadings(rival, own), ["MÜKEMMEL LEZZET", "Ürünlerimiz ile ilgili sorularınız mı var?", "Analitik bileşenler"].filter((h) => !covered(h, own.text)));
assert.ok(missingHeadings(rival, own).includes("Analitik bileşenler"));

const urls = ["https://www.purina.com.tr/sozlesme/renal-kedi.pdf", "https://www.purina.com.tr/kedi/urunler", "https://www.purina.com.tr/pro-plan-veterinary-diets/kedi/nf-renal-function", "https://www.purina.com.tr/blog/kedi-oyunlari"];
assert.equal(suggestOwnUrls(rival, urls)[0], urls[1]);
console.log("check-page-compare: ok");
