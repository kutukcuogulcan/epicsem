// Marka algısı: ürünün çözdüğü sorun ("sindirim sorunu olan kediler için") olumsuz sayılmaz;
// "yüksek protein", "eksiksiz", "sorunsuz" olumsuz değil; "fiyatı yüksek", "yavaş destek" olumsuz.
// Çalıştır: node --experimental-strip-types scripts/check-brand-perception.mjs
import assert from "node:assert/strict";
import { isNegativeUse } from "../lib/brand-perception.ts";

const s1 = ["Pro Plan, sindirim sorunu olan kediler için özel formül sunar.", "Pro Plan sindirim sorunu yaşayan köpeklere iyi gelir."];
assert.equal(isNegativeUse("sindirim sorunu", s1), false, "çözdüğü sorun olumsuz değil");
assert.equal(isNegativeUse("yüksek protein", ["Pro Plan yüksek protein içerir."]), false);
assert.equal(isNegativeUse("eksiksiz beslenme", ["Pro Plan eksiksiz beslenme sağlar."]), false);
assert.equal(isNegativeUse("sorunsuz", ["Paraşüt sorunsuz çalışır."]), false);
assert.equal(isNegativeUse("fiyatı yüksek", ["Pro Plan'ın fiyatı yüksek bulunabilir."]), true);
assert.equal(isNegativeUse("yavaş destek", ["X'in yavaş destek ekibi kullanıcıları zorluyor."]), true);
assert.equal(isNegativeUse("sorun yaşanıyor", ["X ile entegrasyonda sorun yaşanıyor.", "X'te senkronizasyon sorunları sık görülür."]), true, "markaya yönelik sorun olumsuz");
// Gerçek Purina cevaplarındaki koşul kalıbı (sorun varsa / oluyorsa: önerilen ürün).
assert.equal(isNegativeUse("sindirim sorunu", ["- Hassas mide / yumuşak dışkı / sindirim sorunu varsa: Royal Canin Digestive Care veya Purina Sensitive."]), false);
assert.equal(isNegativeUse("sorunu varsa", ["- Sindirim sorunu varsa: Purina Sensitive."]), false);
assert.equal(isNegativeUse("birlikte sorun", ["- Tüy + deri birlikte sorun oluyorsa: Purina Sensitive Skin & Stomach."]), false);
// Rakip cümleleri: parantez arası ve bölünmüş ek; gerçek eleştiri olumsuz kalır.
assert.equal(isNegativeUse("yolu sorunu", ["Royal Canin üriner pH kontrolü sağlıyor ve idrar yolu sorunu (FLUTD) geçmişi olan kedilerde ilk tercih."]), false);
const hills = ["Hill's Sensitive Skin & Stomach: Deri, tüy ve sindirim hassasiyeti olan kediler için üretilmiştir ve gaz ile şişkinlik gibi sorunları en aza indirmeyi hedefler."];
assert.equal(isNegativeUse("sorunları aza", hills), false);
assert.equal(isNegativeUse("şişkinlik sorunları", ["Hill's şişkinlik sorunları için formüle edilmiştir."]), false);
assert.equal(isNegativeUse("pahalı seçeneklerden", ["Royal Canin ırka özel; fakat bu grupta en pahalı seçeneklerden."]), true);
assert.equal(isNegativeUse("tokluk zayıf", ["Hill's Science Plan Kısırlaştırılmış: Lif düşük, tokluk için en zayıf seçenek."]), true, "gerçek eleştiri olumsuz kalır");
console.log("check-brand-perception: ok");
