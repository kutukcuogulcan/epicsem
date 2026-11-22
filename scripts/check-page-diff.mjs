// Sayfa İzleme: iki anlık görüntü arasındaki değişiklikler ve kritik olanlar.
// Çalıştır: node --experimental-strip-types scripts/check-page-diff.mjs
import assert from "node:assert/strict";
import { diffSnaps } from "../lib/page-diff.ts";

const base = { ok: true, title: "Fiyatlar", description: "d", h1Count: 1, wordCount: 1200, canonical: "https://x.com/fiyat", schemaTypes: ["FAQPage", "Organization"], noindex: false, blockedBots: [], score: 80 };
assert.deepEqual(diffSnaps(base, { ...base }), [], "değişiklik yoksa boş");

const bad = diffSnaps(base, { ...base, noindex: true, wordCount: 500, schemaTypes: ["Organization"], blockedBots: ["GPTBot"], score: 65 });
assert.ok(bad.find((c) => /noindex eklendi/.test(c.text))?.critical);
assert.ok(bad.find((c) => /İçerik kısaldı: ~1200 → ~500/.test(c.text))?.critical, "%50'den fazla kısalma kritik");
assert.ok(bad.some((c) => /kaldırıldı: FAQPage/.test(c.text) && c.verdict === "kötü"));
assert.ok(bad.find((c) => /GPTBot/.test(c.text))?.critical);
assert.ok(bad.some((c) => /puanı düştü: 80 → 65/.test(c.text)));

const down = diffSnaps(base, { ...base, ok: false, title: null });
assert.equal(down.length, 1, "açılmayan sayfada içerik farkı yazılmaz");
assert.ok(down[0].critical);

const good = diffSnaps({ ...base, noindex: true, description: null }, { ...base, title: "Fiyatlar 2026" });
assert.ok(good.some((c) => c.verdict === "iyi" && /noindex kaldırıldı/.test(c.text)));
assert.ok(good.some((c) => c.verdict === "bilgi" && /Başlık değişti/.test(c.text)));
assert.ok(good.some((c) => c.verdict === "iyi" && /Meta açıklama eklendi/.test(c.text)));
assert.equal(diffSnaps({ ...base, noindex: null }, { ...base, noindex: true }).length, 0, "önceden ölçülmemiş noindex için yanlış alarm yok");
console.log("check-page-diff: ok");
