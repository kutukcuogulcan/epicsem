import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { checkEntity } from "@/lib/entity-check";

/** POST /api/geo/entity { brands: [{ name, domain }] } — Wikipedia + Wikidata varlık kontrolü (ücretsiz). */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const rl = rateLimit(`entity:${user.id}`, 30, 60 * 60 * 1000);
  if (!rl.allowed) return NextResponse.json({ error: "Saatlik kontrol sınırına ulaştın." }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  const brands: { name: string; domain: string }[] = (Array.isArray(b.brands) ? b.brands : [])
    .filter((x: any) => x && typeof x.name === "string" && x.name.trim())
    .slice(0, 6)
    .map((x: any) => ({ name: String(x.name).trim().slice(0, 80), domain: String(x.domain ?? "").trim().slice(0, 120) }));
  if (!brands.length) return NextResponse.json({ error: "Marka adı gerekli." }, { status: 400 });
  try {
    const results = await Promise.all(brands.map((x) => checkEntity(x.name, x.domain)));
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Kontrol başarısız" }, { status: 502 });
  }
}
