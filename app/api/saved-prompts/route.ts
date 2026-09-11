import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isBrandedPrompt } from "@/lib/geo-engine";
import { createSavedPrompts, deleteSavedPrompt, listSavedPrompts } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";

/** GET /api/saved-prompts?brandDomain=... — this brand's persistent GEO prompt library
 * (the Prompts tab's table), independent from any one-off batch test run. */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  const brandDomain = req.nextUrl.searchParams.get("brandDomain");
  if (!brandDomain) return NextResponse.json({ error: "brandDomain query param is required" }, { status: 400 });

  const prompts = await listSavedPrompts(user.id, brandDomain);
  return NextResponse.json({ prompts });
}

const brandSchema = z.object({ name: z.string().min(1), domain: z.string().min(1) });

const createSchema = z.object({
  brand: brandSchema,
  competitors: z.array(brandSchema).max(6).default([]),
  prompts: z
    .array(z.object({ text: z.string().min(3), topic: z.string().min(1).max(60).default("Genel") }))
    .min(1)
    .max(20),
});

/** POST — adds one or more prompts to the library at once (the "Add Prompts" modal's Manual
 * rows or Import textarea both collapse to this same batch shape). No LLM call here — saving
 * a prompt is free; a saved prompt only costs a query once you actually run it. */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  let parsed;
  try {
    parsed = createSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }

  const { brand, competitors, prompts } = parsed;
  const created = await createSavedPrompts(user.id, {
    brandName: brand.name,
    brandDomain: brand.domain,
    competitors,
    prompts: prompts.map((p) => ({ text: p.text, topic: p.topic, branded: isBrandedPrompt(p.text, brand.name) })),
  });
  return NextResponse.json({ prompts: created });
}

const deleteSchema = z.object({ id: z.number() });

export async function DELETE(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  let parsed;
  try {
    parsed = deleteSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }
  await deleteSavedPrompt(user.id, parsed.id);
  return NextResponse.json({ ok: true });
}
