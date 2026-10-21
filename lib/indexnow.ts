import { randomBytes } from "node:crypto";

/**
 * IndexNow — yeni/güncellenen URL'leri katılımcı arama motorlarına (Bing, Yandex, Seznam,
 * Naver, Yep) tek istekle bildirir. Ücretsiz, hesap yok; sitenin kökünde <anahtar>.txt olmalı.
 */

export function newIndexNowKey(): string {
  return randomBytes(16).toString("hex");
}

export const validKey = (k: string) => /^[a-zA-Z0-9-]{8,128}$/.test(k);

/** Anahtar dosyası sitede yayında mı? */
export async function verifyKeyFile(siteUrl: string, key: string): Promise<{ ok: boolean; url: string; detail: string }> {
  const origin = new URL(siteUrl).origin;
  const url = `${origin}/${key}.txt`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(12_000), redirect: "follow", headers: { "User-Agent": "EpicsemIndexNow/1.0" } });
    if (!r.ok) return { ok: false, url, detail: `Anahtar dosyası bulunamadı (HTTP ${r.status}).` };
    const t = (await r.text()).trim();
    return t.includes(key) ? { ok: true, url, detail: "Anahtar dosyası doğrulandı." } : { ok: false, url, detail: "Dosya var ama içinde anahtar yazmıyor." };
  } catch {
    return { ok: false, url, detail: "Anahtar dosyasına ulaşılamadı." };
  }
}

export async function submitIndexNow(siteUrl: string, key: string, urls: string[]): Promise<{ status: number; ok: boolean; detail: string; count: number }> {
  const u = new URL(siteUrl);
  const list = [...new Set(urls)].filter((x) => {
    try {
      return new URL(x).host === u.host;
    } catch {
      return false;
    }
  }).slice(0, 10_000);
  if (!list.length) return { status: 0, ok: false, detail: "Bu siteye ait URL yok.", count: 0 };
  let r: Response;
  try {
    r = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: u.host, key, keyLocation: `${u.origin}/${key}.txt`, urlList: list }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return { status: 0, ok: false, detail: "IndexNow sunucusuna ulaşılamadı — biraz sonra tekrar dene.", count: 0 };
  }
  const detail: Record<number, string> = {
    200: "Gönderildi.",
    202: "Alındı; anahtar doğrulaması bekleniyor.",
    400: "Geçersiz istek.",
    403: "Anahtar geçersiz — anahtar dosyası sitede bulunamadı.",
    422: "URL'ler bu siteye ait değil ya da anahtar uyuşmuyor.",
    429: "Çok sık gönderim — biraz sonra tekrar dene.",
  };
  return { status: r.status, ok: r.status === 200 || r.status === 202, detail: detail[r.status] ?? `HTTP ${r.status}`, count: list.length };
}
