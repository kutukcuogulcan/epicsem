import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getLatestGeoRunFull } from "@/lib/db";
import { fetchPageSummary } from "@/lib/content-fetch";
import { answerTerms, missingOnPage } from "@/lib/page-terms";
import { rateLimit } from "@/lib/rate-limit";

/** GET /api/geo/page-terms?domain=&url= — AI cevaplarında sık geçen ama sayfada geçmeyen kavramlar (ücretsiz, AI yok). */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  if (!rateLimit(`page-terms:${user.id}`, 30, 60 * 60 * 1000).allowed) return NextResponse.json({ error: "Saatlik sınıra ulaştın." }, { status: 429 });
  const domain = (req.nextUrl.searchParams.get("domain") ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const url = req.nextUrl.searchParams.get("url") || `https://${domain}`;
  const geo = (await getLatestGeoRunFull(user.id, domain)) ?? (await getLatestGeoRunFull(user.id, `www.${domain}`));
  if (!geo || geo.demoMode) return NextResponse.json({ needsGeo: true });
  const answers = geo.runs.map((r) => r.responseText).filter(Boolean);
  const terms = answerTerms(answers, [geo.brand.name, ...geo.competitors.map((c) => c.name)]);
  let page;
  try {
    page = await fetchPageSummary(url);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sayfa açılamadı" }, { status: 502 });
  }
  const missing = missingOnPage(terms, `${page.title ?? ""} ${page.bodyText}`);
  return NextResponse.json({ url: page.url, answers: answers.length, checked: terms.length, missing, geoAt: geo.createdAt });
}
