// Yazıdaki bozuk kaynak linklerinin düzeltildiğini doğrular. Çalıştır: node --experimental-strip-types scripts/check-link-check.mjs
import assert from "node:assert/strict";
import { planLinks, unlink, appendSources } from "../lib/link-check.ts";

const good = "https://data.tuik.gov.tr/Bulten/Index?p=Girisimlerde-Bilisim-Teknolojileri-Kullanim-Arastirmasi-2025-54012";
const bad = "https://data.tuik.gov.tr/Bulten/Index?p=Girisimlerde-Bilisim-Teknolojileri-Kullanalim-Arastirmasi-2025-54012";
const md = `A %28,3 ([TÜİK](${good})). B %54,3 ([TÜİK](${bad})). [e-fatura](https://www.parasut.com/e-fatura) ![g](https://img.example.com/a.jpg)`;

const plan = planLinks(md, [good, "https://t24.com.tr/haber/x,1"]);
// Gerçek adres kalır; aynı sitenin bozuk yazılmış adresi gerçeğiyle değişir; bilinmeyen site açılıp kontrol edilir; görsel linki sayılmaz.
assert.deepEqual(plan.find((p) => p.url === good).action, "keep");
assert.deepEqual(plan.find((p) => p.url === bad), { url: bad, action: "replace", to: good });
assert.equal(plan.find((p) => p.url.includes("parasut")).action, "probe");
assert.equal(plan.some((p) => p.url.includes("img.example")), false);

// Kaldırılan linkin metni kalır.
assert.equal(unlink("x ([TÜİK](https://a.com/y)) z", "https://a.com/y"), "x (TÜİK) z");

// Kaynaklar: kendi sitesi ve YouTube hariç, tekrarsız; "kaynak" gibi genel metin yerine alan adı.
const s = appendSources(`[TÜİK](${good}) [TÜİK](${good}) [kaynak](https://www.gib.gov.tr/a) [ürün](https://parasut.com/x) [v](https://youtube.com/watch?v=1)`, "parasut.com");
assert.match(s, /## Kaynaklar\n\n- \[TÜİK\]\(.+\)\n- \[gib\.gov\.tr\]\(https:\/\/www\.gib\.gov\.tr\/a\)\n$/);
assert.equal(appendSources("metin\n\n## Kaynaklar\n\n- x", "a.com"), "metin\n\n## Kaynaklar\n\n- x");

console.log("check-link-check: ok");
