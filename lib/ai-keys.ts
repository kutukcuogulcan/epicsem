/**
 * Uygulama geneli AI anahtarları — Entegrasyonlar sayfasından uygulama sahibi girer, DB'de saklanır
 * ve sunucu sürecinin ortam değişkenlerine yüklenir. Böylece anahtar sohbet/mesaj ile paylaşılmadan
 * Render'daki ortam değişkeni gibi çalışır. DB'deki anahtar, Render'daki değerin önüne geçer;
 * silinirse Render'daki orijinal değere dönülür.
 */
import { getAppOwnerId, getIntegration } from "@/lib/db";
import { resetAnthropicModelCache } from "@/lib/geo-providers";

export const AI_KEY_ENV: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google_ai: "GOOGLE_AI_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
};

const original: Record<string, string | undefined> = {};
let captured = false;

export async function isAppOwner(userId: number): Promise<boolean> {
  return (await getAppOwnerId()) === userId;
}

/** Sahibin kaydettiği (ve testi geçen) anahtarları process.env'e uygular. */
export async function applyAiKeys(): Promise<void> {
  if (!captured) {
    for (const env of Object.values(AI_KEY_ENV)) original[env] = process.env[env];
    captured = true;
  }
  const before = process.env.ANTHROPIC_API_KEY;
  const owner = await getAppOwnerId();
  for (const [provider, env] of Object.entries(AI_KEY_ENV)) {
    const row = owner ? await getIntegration(owner, provider) : null;
    const key = row?.config._status === "ok" ? row.secrets.apiKey : "";
    if (key) process.env[env] = key;
    else if (original[env] !== undefined) process.env[env] = original[env];
    else delete process.env[env];
  }
  if (process.env.ANTHROPIC_API_KEY !== before) resetAnthropicModelCache();
}
