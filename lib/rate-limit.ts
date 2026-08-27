import type { NextRequest } from "next/server";

/**
 * Simple in-memory sliding-window rate limiter. Good enough for a single
 * Railway instance — it resets on every deploy/restart and doesn't share
 * state across horizontally-scaled instances, so if this app ever runs on
 * more than one instance at once this needs to move to something shared
 * (Redis, Railway KV, etc). Documented as a known limitation, not a bug.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Opportunistic cleanup so the map doesn't grow forever — runs at most
// once a minute, triggered by whichever request happens to land after
// the interval elapses.
let lastCleanup = 0;
function cleanup(now: number) {
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

/**
 * key should already include a namespace, e.g. `login:${ip}` or `audit:${userId}`,
 * so different endpoints don't share the same counter.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  cleanup(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, limit, remaining: limit - 1, resetAt };
  }

  if (existing.count >= limit) {
    return { allowed: false, limit, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return { allowed: true, limit, remaining: limit - existing.count, resetAt: existing.resetAt };
}

/**
 * Best-effort client IP for rate limiting unauthenticated endpoints (login/signup)
 * where there's no user id yet. Railway (and most PaaS reverse proxies) set
 * x-forwarded-for; NextRequest.ip was removed in recent Next.js versions.
 */
export function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

export function retryAfterSeconds(resetAt: number): number {
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
}
