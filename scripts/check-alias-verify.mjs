// Alt marka doğrulama: yalnızca şirketin kendi sitesinde geçenler. Çalıştır: node --experimental-strip-types scripts/check-alias-verify.mjs
import assert from "node:assert/strict";
import { verifyOwnBrands } from "../lib/alias-verify.ts";

const page = "Purina ile tanışın. Pro Plan, Felix ve Gourmet markalarımızla kediniz için en iyisi.";
const urls = ["https://www.purina.com.tr/markalar/friskies", "https://www.purina.com.tr/kedi/kedi-mamasi/cat-chow-yetiskin-tavuklu", "https://www.purina.com.tr/makaleler/kedi"];
const got = verifyOwnBrands(["Pro Plan", "Felix", "Gourmet", "Friskies", "Cat Chow", "Royal Canin", "Purina", "pro plan", "Dog Chow"], "Purina", page, urls);
assert.deepEqual(got, ["Pro Plan", "Felix", "Gourmet", "Friskies", "Cat Chow"], "sitede geçmeyen (Royal Canin, Dog Chow), marka adı ve tekrar girmez");
assert.deepEqual(verifyOwnBrands(["Felixx"], "Purina", page, urls), [], "kelime içinde geçen sayılmaz");
console.log("check-alias-verify: ok");
