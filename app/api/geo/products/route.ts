import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getGeoOpportunities, getLatestGeoRunFull, saveGeoOpportunities } from "@/lib/db";
import { getActiveProject } from "@/lib/project-context";
import { countProducts, productExcerpts, productPrompt, type ProductRow } from "@/lib/product-visibility";
import { QuotaError, runSmallAiJson } from "@/lib/ai-small";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 120;
const keyOf = (at: string) => `products:${at}`;

async function latest(userId: number) {
  const p = await getActiveProject(userId);
  const geo = p ? ((await getLatestGeoRunFull(userId, p.domain)) ?? (await getLatestGeoRunFull(userId, `www.${p.domain}`))) : null;
  return geo && !geo.demoMode && geo.runs.length ? { p: p!, geo } : null;
}

/** GET — son test için kayıtlı ürün görünürlüğü (yoksa null). */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const l = await latest(user.id);
  if (!l) return NextResponse.json({ products: null });
  return NextResponse.json({ products: await getGeoOpportunities<ProductRow[]>(user.id, l.geo.brand.domain, keyOf(l.geo.createdAt)), answers: l.geo.runs.length, brand: l.geo.brand.name });
}

/** POST — cevaplardan ürünleri çıkar (1 AI sorgusu, test başına bir kez), kodla say ve kaydet. */
export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  if (!rateLimit(`products:${user.id}`, 10, 60 * 60 * 1000).allowed) return NextResponse.json({ error: "Saatte en fazla 10 analiz yapılabilir." }, { status: 429 });
  const l = await latest(user.id);
  if (!l) return NextResponse.json({ error: "Önce gerçek bir GEO testi çalıştır." }, { status: 400 });
  const key = keyOf(l.geo.createdAt);
  const cached = await getGeoOpportunities<ProductRow[]>(user.id, l.geo.brand.domain, key);
  if (cached) return NextResponse.json({ products: cached, answers: l.geo.runs.length, brand: l.geo.brand.name });
  const competitors = (l.p.competitors.length ? l.p.competitors : l.geo.competitors).map((c) => c.name);
  const excerpts = productExcerpts(l.geo.runs, [l.geo.brand.name, ...l.p.aliases, ...competitors]);
  if (!excerpts) return NextResponse.json({ products: [], answers: l.geo.runs.length, brand: l.geo.brand.name });
  try {
    const raw = await runSmallAiJson(user.id, productPrompt(l.geo.brand.name, l.p.aliases, competitors, excerpts));
    const products = countProducts(raw, l.geo.runs, l.geo.brand.name);
    await saveGeoOpportunities(user.id, l.geo.brand.domain, key, products);
    return NextResponse.json({ products, answers: l.geo.runs.length, brand: l.geo.brand.name });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ürünler çıkarılamadı" }, { status: e instanceof QuotaError ? 402 : 500 });
  }
}
