import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";
import { rateLimit } from "@/lib/rate-limit";
import { getImportRun } from "@/lib/db";
import { buildProposalPdf } from "@/lib/proposal-pdf";

const schema = z.object({
  runId: z.number().int(),
  agencyName: z.string().trim().min(1, "Ajans adı gerekli").max(80),
  clientName: z.string().trim().min(1, "Müşteri adı gerekli").max(80),
  contact: z.string().trim().max(300).optional(),
  note: z.string().trim().max(800).optional(),
  validDays: z.number().int().min(1).max(180).default(30),
  packages: z
    .array(z.object({ name: z.string().trim().max(40), price: z.string().trim().max(40), items: z.array(z.string().trim().max(120)).max(10) }))
    .max(3),
});

/** POST /api/proposal — Site Taraması sonucundan müşteri teklifi PDF'i (AI yok). */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const rl = rateLimit(`proposal:${user.id}`, 30, 60 * 60 * 1000);
  if (!rl.allowed) return NextResponse.json({ error: "Saatlik teklif sınırına ulaştın." }, { status: 429 });
  let p;
  try {
    p = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: readableZodError(e) }, { status: 400 });
  }
  const run = await getImportRun(user.id, p.runId);
  if (!run) return NextResponse.json({ error: "Tarama bulunamadı." }, { status: 404 });
  const pdf = await buildProposalPdf({ ...p, run });
  const name = p.clientName.toLocaleLowerCase("tr").replace(/[^a-z0-9ğüşıöç]+/gi, "-").replace(/^-|-$/g, "") || "teklif";
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}-geo-seo-teklif.pdf"` },
  });
}
