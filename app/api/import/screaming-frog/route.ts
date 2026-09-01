import { NextRequest, NextResponse } from "next/server";
import { parseScreamingFrogCsv } from "@/lib/screaming-frog-import";
import { getImportRun, listImportRuns, saveImportRun } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";

const MAX_BYTES = 25 * 1024 * 1024; // 25MB — generous for tens of thousands of crawled URLs

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  const limitResult = rateLimit(`import:${user.id}`, 10, 60 * 60 * 1000);
  if (!limitResult.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached — up to 10 CSV imports per hour. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limitResult.resetAt)) } }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data with a 'file' field" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'file' — upload a Screaming Frog CSV export" }, { status: 400 });
  }
  if (!/\.csv$/i.test(file.name)) {
    return NextResponse.json({ error: "Only .csv files are supported (Screaming Frog: Export → Internal → All)" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File too large (${Math.round(file.size / 1024 / 1024)}MB) — 25MB max.` }, { status: 400 });
  }

  try {
    const text = await file.text();
    const result = parseScreamingFrogCsv(text, file.name);
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "No usable rows found in this CSV." }, { status: 400 });
    }
    let id: number | null = null;
    try {
      id = saveImportRun(user.id, result);
    } catch (dbErr) {
      console.error("import run save failed:", dbErr);
    }
    return NextResponse.json({ ...result, id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 400 }
    );
  }
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  const idParam = req.nextUrl.searchParams.get("id");
  if (idParam) {
    const id = Number(idParam);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const run = getImportRun(user.id, id);
    if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(run);
  }

  return NextResponse.json({ runs: listImportRuns(user.id) });
}
