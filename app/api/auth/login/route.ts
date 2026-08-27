import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { login, createSessionCookie } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";
import { getClientIp, rateLimit, retryAfterSeconds } from "@/lib/rate-limit";

const bodySchema = z.object({
  email: z.string().min(3),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  // Brute-force protection: cap login attempts per IP, not per email, so an
  // attacker can't spray many emails to dodge a per-account limit.
  const ip = getClientIp(req);
  const limitResult = rateLimit(`login:${ip}`, 20, 15 * 60 * 1000);
  if (!limitResult.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts — please wait a few minutes and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limitResult.resetAt)) } }
    );
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: readableZodError(err, "Geçersiz istek") },
      { status: 400 }
    );
  }

  try {
    const user = login(parsed.email, parsed.password);
    await createSessionCookie(user.id);
    return NextResponse.json({ user });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Giriş başarısız" },
      { status: 401 }
    );
  }
}
