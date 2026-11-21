import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Müşteri sırlarını (CMS şifreleri, AI anahtarları) veritabanında şifreli tutar: AES-256-GCM,
 * anahtar = SHA-256(SECRETS_KEY). Biçim: "enc:v1:" + base64(iv(12) | tag(16) | şifreli metin).
 * Eski düz kayıtlar okunmaya devam eder (önek yoksa olduğu gibi döner); yazılan her yeni değer şifrelenir.
 * shortcut: SECRETS_KEY tanımlı değilse düz yazar (geriye uyum); canlıda tanımlanmalı. Anahtar değişirse
 * eski şifreli kayıtlar okunamaz — anahtarı döndürmek için yeniden şifreleme gerekir.
 */

const PREFIX = "enc:v1:";
const key = () => (process.env.SECRETS_KEY ? createHash("sha256").update(process.env.SECRETS_KEY).digest() : null);

export function sealSecret(plain: string): string {
  const k = key();
  if (!k || !plain || plain.startsWith(PREFIX)) return plain;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

export function openSecret(stored: string): string {
  if (!stored?.startsWith(PREFIX)) return stored;
  const k = key();
  if (!k) throw new Error("Şifreli kayıt var ama SECRETS_KEY tanımlı değil.");
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
  const d = createDecipheriv("aes-256-gcm", k, raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
}
