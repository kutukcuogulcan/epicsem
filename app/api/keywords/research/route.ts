import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { classifyKeyword, researchKeywords, type KeywordIdea } from "@/lib/keyword-research";
import { adsAvailable, adsKeywordIdeas, serpKeyFor } from "@/lib/integrations";

const schema = z.object({
  seed: z.string().trim().min(2, "Bir anahtar kelime yazın").max(80),
  lang: z.string().trim().max(5).default("tr"),
  country: z.string().trim().max(4).default("TR"),
  depth: z.enum(["quick", "deep"]).default("deep"),
});

/** POST /api/keywords/research — Google önerilerinden anahtar kelime keşfi. AI yok, ücretsiz. */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const rl = rateLimit(`kw-research:${user.id}`, 40, 60 * 60 * 1000);
  if (!rl.allowed) return NextResponse.json({ error: "Çok fazla arama — biraz sonra tekrar dene." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rl.resetAt)) } });
  let p;
  try {
    p = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }
  const [result, hasAds, serpKey] = await Promise.all([
    researchKeywords(p.seed, { lang: p.lang, country: p.country, depth: p.depth }),
    adsAvailable(user.id),
    serpKeyFor(user.id),
  ]);
  let adsError: string | null = null;
  if (hasAds) {
    // Keyword Planner: tohum + en sık önerilen 19 kelime → hacim; Planner'ın kendi fikirleri de eklenir.
    try {
      const seeds = [result.seed, ...result.ideas.slice(0, 19).map((i) => i.keyword)];
      const vols = await adsKeywordIdeas(user.id, seeds, p.lang, p.country);
      const byKw = new Map(vols.map((v) => [v.keyword, v]));
      for (const i of result.ideas) {
        const v = byKw.get(i.keyword);
        i.source = "suggest";
        if (v) Object.assign(i, { volume: v.avgMonthlySearches, competition: v.competition, cpcHigh: v.highBid });
        byKw.delete(i.keyword);
      }
      const extra: KeywordIdea[] = [...byKw.values()]
        .filter((v) => v.keyword && (v.avgMonthlySearches ?? 0) > 0)
        .slice(0, 300)
        .map((v) => ({ keyword: v.keyword, hits: 0, ...classifyKeyword(v.keyword, result.seed), volume: v.avgMonthlySearches, competition: v.competition, cpcHigh: v.highBid, source: "planner" }));
      result.ideas = [...result.ideas, ...extra].sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1) || b.hits - a.hits);
    } catch (e) {
      adsError = e instanceof Error ? e.message : "Keyword Planner hatası";
    }
  }
  return NextResponse.json({ ...result, serpAvailable: !!serpKey, adsAvailable: hasAds, adsError });
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ serpAvailable: false, adsAvailable: false });
  const [serpKey, hasAds] = await Promise.all([serpKeyFor(user.id), adsAvailable(user.id)]);
  return NextResponse.json({ serpAvailable: !!serpKey, adsAvailable: hasAds });
}
