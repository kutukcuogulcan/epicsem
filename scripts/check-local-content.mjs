// Yerel içerik: Google İşletme gönderi uzunluğu. Çalıştır: node --experimental-strip-types scripts/check-local-content.mjs
import assert from "node:assert/strict";
const { clampPost } = await import("../lib/clamp-post.ts");

assert.equal(clampPost("Kısa gönderi."), "Kısa gönderi.");
const long = "Bu bir cümle. ".repeat(150);
const c = clampPost(long);
assert.ok(c.length <= 1500, "sınır aşılmaz: " + c.length);
assert.ok(c.endsWith("."), "tam cümlede biter");
assert.ok(!clampPost("a".repeat(1600)).includes("undefined"));
console.log("check-local-content: ok");
