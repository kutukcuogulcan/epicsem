import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { signup, createSessionCookie } from "@/lib/auth";

const bodySchema = z.object({
  email: z.string().min(3),
  password: z.string().min(8),
  name: z.string().optional(),
});

export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Geçersiz istek" },
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
