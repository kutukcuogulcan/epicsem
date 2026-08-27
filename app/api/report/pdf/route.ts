import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildReportPdf } from "@/lib/pdf-report";

const bodySchema = z.object({
  agencyName: z.string().optional(),
  clientName: z.string().min(1),
  clientDomain: z.string().min(1),
  audit: z.any().optional().nullable(),
  geo: z.object({ summaries: z.array(z.any()) }).optional().nullable(),
  gap: z.object({ gapMatrix: z.array(z.any()), contentBriefs: z.array(z.any()).optional() }).optional().nullable(),
});

export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid body" }, { status: 400 });
  }

  const doc = buildReportPdf({
    agencyName: parsed.agencyName,
    clientName: parsed.clientName,
    clientDomain: parsed.clientDomain,
    generatedAt: new Date().toISOString(),
    audit: parsed.audit ?? null,
    geo: parsed.geo ?? null,
    gap: parsed.gap ?? null,
  });

  const chunks: Buffer[] = [];
  const pdfBuffer: Buffer = await new Promise((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });

  const filename = `${parsed.clientName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-epicsem-report.pdf`;
  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
