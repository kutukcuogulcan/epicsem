// E-ticaret kaynak tipi. Çalıştır: node --experimental-strip-types scripts/check-source-type.mjs
import assert from "node:assert/strict";
import { isRetailSource } from "../lib/source-type.ts";

assert.ok(isRetailSource("www.trendyol.com", []), "bilinen pazar yeri");
assert.ok(isRetailSource("akakce.com", ["https://www.akakce.com/kopek-mamasi.html"]));
assert.ok(isRetailSource("petzzshop.com", ["https://www.petzzshop.com/blog/en-iyi-kedi-mamasi-markalari"]), "alan adında shop");
assert.ok(isRetailSource("ornek.com", ["https://ornek.com/x-fiyati", "https://ornek.com/urun/1"]), "adreslerin yarısı mağaza sinyali");
assert.ok(!isRetailSource("mismama.com", ["https://www.mismama.com/blog/icerik/en-iyi-kisirlastirilmis-kedi-mamalari"]), "sinyal yoksa Kurumsal kalır");
assert.ok(!isRetailSource("wsava.org", ["https://wsava.org/global-guidelines/"]));
assert.ok(!isRetailSource("digitalmarketing.com", ["https://digitalmarketing.com/blog"]), "pazarlama ajansı mağaza değil");
assert.ok(isRetailSource("petmarket.com.tr", []));
console.log("check-source-type: ok");
