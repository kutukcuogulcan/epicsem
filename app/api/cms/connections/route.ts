import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createCmsConnection, deleteCmsConnection, listCmsConnections } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";

const bodySchema = z
  .object({
    platform: z.enum(["wordpress", "shopify"]).default("wordpress"),
    label: z.string().min(1).max(100),
    siteUrl: z.string().min(1).max(200),
    authIdentifier: z.string().max(200).default(""),
    authSecret: z.string().min(1).max(300),
  })
  .superRefine((val, ctx) => {
    if (val.platform === "wordpress") {
      if (val.authIdentifier.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "WordPress kullanıcı adı gerekli", path: ["authIdentifier"] });
      }
      if (!/^https?:\/\//.test(val.siteUrl)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Site adresi https:// ile başlamalı", path: ["siteUrl"] });
      }
    }
  });

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  return NextResponse.json({ connections: await listCmsConnections(user.id) });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }

  const connection = await createCmsConnection(user.id, parsed);
  return NextResponse.json({ connection });
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  const idParam = req.nextUrl.searchParams.get("id");
  const id = Number(idParam);
  if (!idParam || !Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  await deleteCmsConnection(user.id, id);
  return NextResponse.json({ ok: true });
}
