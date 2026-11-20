// Rakip görünürlüğü hatasının geri gelmediğini doğrular. Çalıştır: node --experimental-strip-types scripts/check-geo-rank.mjs
import assert from "node:assert/strict";
import { rankTrackedBrands } from "../lib/text-match.ts";

const brands = [{ name: "Paraşüt" }, { name: "BizimHesap" }, { name: "Mikro" }];

// Rakip anıldı, sen anılmadın: rakip sayılır, sen sayılmazsın (eski hata: rakip de sayılmıyordu).
let r = rankTrackedBrands("En iyisi BizimHesap, sonra Mikro.", brands, false);
assert.equal(r.get("BizimHesap"), 1);
assert.equal(r.get("Mikro"), 2);
assert.equal(r.has("Paraşüt"), false);

// Hepsi anıldı: sıra metindeki ilk geçişe göre.
r = rankTrackedBrands("Mikro iyi, Paraşüt daha iyi, BizimHesap da var.", brands, true);
assert.deepEqual([...r.entries()], [["Mikro", 1], ["Paraşüt", 2], ["BizimHesap", 3]]);

// Türkçe ek: "BizimHesap'ı" da anılma sayılır.
assert.equal(rankTrackedBrands("BizimHesap'ı öneririm.", brands, false).get("BizimHesap"), 1);

console.log("check-geo-rank: ok");
