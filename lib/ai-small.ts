import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { runFast } from "@/lib/geo-providers";
import { runForJsonObject } from "@/lib/llm-json";
import { checkQuota, consumeQuota, quotaExceededMessage } from "@/lib/usage-guard";

/**
 * Küçük, tek seferlik AI çağrıları için ortak koruma: giriş, saatlik sınır, kota kontrolü
 * (1 AI motor sorgusu) ve JSON çıktısı. Başarılı olursa kotadan düşer.
 */
export async function guardSmallAi(key: string, perHour = 20): Promise<{ userId: number } | NextResponse> {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const lim = rateLimit(`${key}:${user.id}`, perHour, 60 * 60 * 1000);
  if (!lim.allowed) return NextResponse.json({ error: "Saatlik sınıra ulaşıldı." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(lim.resetAt)) } });
  return { userId: user.id };
}

export async function runSmallAiJson(userId: number, prompt: string): Promise<Record<string, any>> {
  const quota = await checkQuota(userId, "engineQueries", 1);
  if (!quota.allowed) throw new QuotaError(quotaExceededMessage("engineQueries", quota, 1));
  const { parsed } = await runForJsonObject(async (extra) => {
    const r = await runFast(prompt + extra, 0.4);
    if (!r) throw new Error("Yapay zekâ sağlayıcısı bağlı değil.");
    return r;
  });
  await consumeQuota(userId, "engineQueries", 1);
  return parsed;
}

export class QuotaError extends Error {}

export const str = (v: unknown, n: number) => (typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null" ? v.trim().slice(0, n) : null);
