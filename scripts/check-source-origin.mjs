// Asıl kaynak mı, aktaran mı? Çalıştır: node --experimental-strip-types scripts/check-source-origin.mjs
import assert from "node:assert/strict";
import { isOriginHost } from "../lib/source-origin.ts";

assert.equal(isOriginHost("Pew Research Center", "https://www.pewresearch.org/short-reads/2025/07/22/x"), true);
assert.equal(isOriginHost("Pew Research Center", "https://www.techatom.org/blog/why-isnt-chatgpt-mentioning-my-brand"), false, "aktaran blog");
assert.equal(isOriginHost("Semrush", "https://www.semrush.com/blog/gemini"), true);
assert.equal(isOriginHost("Semrush", "https://digestai.news/story/semrush-guides"), false, "adres yolunda geçmesi yetmez, alan adı olmalı");
assert.equal(isOriginHost("Sprinklr", "https://dev48.org/en/articles/x"), false);
assert.equal(isOriginHost("TÜİK", "https://data.tuik.gov.tr/Bulten/Index?p=1"), true, "Türkçe harf ve tek kelime");
assert.equal(isOriginHost("World Health Organization", "https://www.who.int/news"), true, "baş harfler");
assert.equal(isOriginHost("Bilgi Teknolojileri ve İletişim Kurumu", "https://www.btk.gov.tr/raporlar"), false, "bilinen sınır: kısaltması adından türemiyor");
assert.equal(isOriginHost("", "https://x.com"), true, "kurum bilinmiyorsa iddia yok");
console.log("check-source-origin: ok");
