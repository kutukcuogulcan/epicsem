// Sırların şifreli saklandığını ve eski düz kayıtların okunduğunu doğrular. Çalıştır: node --experimental-strip-types scripts/check-secret-box.mjs
import assert from "node:assert/strict";
import { sealSecret, openSecret } from "../lib/secret-box.ts";

delete process.env.SECRETS_KEY;
assert.equal(sealSecret("abc"), "abc"); // anahtar yoksa düz (geriye uyum)
process.env.SECRETS_KEY = "test-anahtari";
const s = sealSecret("wp-app-şifre 123");
assert.ok(s.startsWith("enc:v1:") && !s.includes("123"));
assert.notEqual(sealSecret("wp-app-şifre 123"), s); // her seferinde farklı (rastgele iv)
assert.equal(openSecret(s), "wp-app-şifre 123");
assert.equal(openSecret("eski düz kayıt"), "eski düz kayıt"); // eski kayıt okunur
assert.equal(sealSecret(s), s); // iki kez şifrelenmez
process.env.SECRETS_KEY = "baska-anahtar";
assert.throws(() => openSecret(s)); // yanlış anahtarla açılmaz (sessizce bozuk veri dönmez)
const tampered = s.slice(0, -4) + (s.endsWith("AAAA") ? "BBBB" : "AAAA");
process.env.SECRETS_KEY = "test-anahtari";
assert.throws(() => openSecret(tampered)); // değiştirilmiş kayıt reddedilir
console.log("check-secret-box: ok");
