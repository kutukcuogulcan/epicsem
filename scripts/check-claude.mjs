// Claude API anahtarını test eder: `node scripts/check-claude.mjs`
// .env.local içindeki ANTHROPIC_API_KEY ile Anthropic'e bağlanır, erişilebilen modelleri listeler.
// Anahtarın kendisini ekrana yazmaz.
import fs from "node:fs";

function readEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs.readFileSync(file, "utf8").split(/\r?\n/)
      .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")])
  );
}

const key = process.env.ANTHROPIC_API_KEY || readEnv(".env.local").ANTHROPIC_API_KEY || readEnv(".env").ANTHROPIC_API_KEY;
if (!key) {
  console.error("✗ ANTHROPIC_API_KEY bulunamadı. .env.local dosyasına yapıştırıp kaydet.");
  process.exit(1);
}
console.log(`Anahtar bulundu (…${key.slice(-4)}). Anthropic'e bağlanılıyor…`);
const res = await fetch("https://api.anthropic.com/v1/models", {
  headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
});
if (!res.ok) {
  const body = await res.text();
  console.error(`✗ Bağlantı başarısız: HTTP ${res.status}`);
  if (res.status === 401) console.error("  Anahtar geçersiz ya da eksik kopyalanmış.");
  else if (res.status === 403) console.error("  Anahtarın bu işlem için yetkisi yok.");
  else console.error("  " + body.slice(0, 300));
  process.exit(1);
}
const data = await res.json();
console.log("✓ Bağlantı başarılı. Erişilebilen modeller:");
for (const m of data.data ?? []) console.log("  - " + m.id);
