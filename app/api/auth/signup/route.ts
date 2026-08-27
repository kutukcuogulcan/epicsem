import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { signup, createSessionCookie } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";
import { getClientIp, rateLimit, retryAfterSeconds } from "@/lib/rate-limit";

const bodySchema = z.object({
  email: z.string().min(3),
  password: z.string().min(8),
  name: z.string().optional(),
});

export async function POST(req: NextRequest) {
  // Anti-spam: cap account creation per IP.
  const ip = getClientIp(req);
  const limitResult = rateLimit(`signup:${ip}`, 8, 60 * 60 * 1000);
  if (!limitResult.allowed) {
    return NextResponse.json(
      { error: "Too many accounts created from this network — please try again later." },
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
    const user = signup(parsed.email, parsed.password, parsed.name);
    await createSessionCookie(user.id);
    return NextResponse.json({ user });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kayıt başarısız" },
      { status: 400 }
    );
  }
}
