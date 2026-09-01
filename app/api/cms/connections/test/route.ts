import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";
import { testWpConnection } from "@/lib/wordpress";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";

const bodySchema = z.object({
  siteUrl: z.string().url(),
  wpUsername: z.string().min(1).max(200),
  wpAppPassword: z.string().min(1).max(200),
});

/** Tests credentials WITHOUT saving them — used by the "Test connection" button before Save. */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  const limitResult = rateLimit(`wp-test:${user.id}`, 20, 60 * 60 * 1000);
  if (!limitResult.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limitResult.resetAt)) } }
    );
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }

  const result = await testWpConnection(parsed.siteUrl, parsed.wpUsername, parsed.wpAppPassword);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
