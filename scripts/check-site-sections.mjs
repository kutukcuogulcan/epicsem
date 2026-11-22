// Site bölümleri: adresleri bölümlere ayırma ve GEO konu tohumları. Çalıştır: node --experimental-strip-types scripts/check-site-sections.mjs
import assert from "node:assert/strict";
import { sectionSeeds, sectionsFromUrls } from "../lib/site-sections.ts";

const u = (p) => `https://www.purina.com.tr${p}`;
const urls = [
  u("/"),
  ...Array.from({ length: 30 }, (_, i) => u(`/kedi/kedi-mamasi/urun-${i}`)),
  ...Array.from({ length: 12 }, (_, i) => u(`/kopek/kopek-mamasi/urun-${i}`)),
  ...Array.from({ length: 8 }, (_, i) => u(`/makaleler/kedi-bakimi-${i}`)),
  u("/gizlilik"), u("/tag/x"), "https://baska.com/kedi/a", u("/e-fatura"),
];
const { total, sections } = sectionsFromUrls(urls, "purina.com.tr");
assert.equal(total, 53, "başka site ve etiket sayfaları sayılmaz, ana sayfa sayılır");
assert.equal(sections[0].label, "kedi / kedi mamasi");
assert.equal(sections[0].count, 30);
assert.ok(sections.some((s) => s.label === "makaleler" && s.count === 8));
const seeds = sectionSeeds(sections);
assert.ok(seeds.includes("kedi / kedi mamasi") && seeds.includes("e fatura") && !seeds.some((x) => /gizlilik/.test(x)), seeds.join(", "));
assert.ok(seeds.indexOf("kedi / kedi mamasi") < seeds.indexOf("e fatura"), "kalabalık bölümler önce");
console.log("check-site-sections: ok");
