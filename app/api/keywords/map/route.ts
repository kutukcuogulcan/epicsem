import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { sitePagesForLinks } from "@/lib/article-enrich";
import { listContentDrafts, listRankKeywords } from "@/lib/db";

export const maxDuration = 60;

const schema = z.object({
  domain: z.string().trim().min(3).max(120),
  clusters: z.array(z.object({ name: z.string().max(80), keywords: z.array(z.string().max(120)).max(30) })).max(40),
});

export interface MapRow {
  cluster: string;
  status: "covered" | "cannibal" | "draft" | "missing";
  pages: { url: string; title: string; score: number }[];
  drafts: { id: number; title: string }[];
  ranking: { keyword: string; position: number | null; url: string | null } | null;
}

const STOP = new Set("ve ile için bir bu ne nedir nasıl en mi mı mu mü da de ki gibi olan hangi neden kadar daha çok the a an of for to in on and or is are what how best with vs".split(" "));
const fold = (s: string) =>
  s
    .toLocaleLowerCase("tr")
    .replace(/[çc]/g, "c")
    .replace(/[ğg]/g, "g")
    .replace(/[ıi]/g, "i")
    .replace(/[öo]/g, "o")
    .replace(/[şs]/g, "s")
    .replace(/[üu]/g, "u");
const toks = (s: string) => [...new Set(fold(s).replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w.length > 2 && !STOP.has(w)))];
const host = (s: string) => s.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase();

/** Kelime/kök eşleşmesi: tam ya da ilk 5 harf (Türkçe ekleri tolere eder). */
function overlap(need: string[], have: string[]): number {
  if (!need.length) return 0;
  const hit = need.filter((w) => have.some((h) => h === w || (w.length > 4 && h.length > 4 && h.slice(0, 5) === w.slice(0, 5))));
  return hit.length / need.length;
}

/**
 * POST /api/keywords/map — İçerik haritası: her konu kümesi için sitede karşılık gelen sayfa var mı?
 * Sitenin taraması/sitemap'i, Epicsem taslakları ve Sıralama Takibi verisiyle eşleştirir. AI kullanmaz.
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const rl = rateLimit(`kw-map:${user.id}`, 30, 60 * 60 * 1000);
  if (!rl.allowed) return NextResponse.json({ error: "Çok fazla istek." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rl.resetAt)) } });
  let b: z.infer<typeof schema>;
  try {
    b = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: readableZodError(e) }, { status: 400 });
  }
  const site = host(b.domain);
  const [pages, drafts, ranks] = await Promise.all([
    sitePagesForLinks(user.id, site, 300).catch(() => [] as { title: string; url: string }[]),
    listContentDrafts(user.id, 300).catch(() => []),
    listRankKeywords(user.id).catch(() => []),
  ]);
  const pageToks = pages.map((p) => ({ ...p, t: toks(`${p.title} ${decodeURIComponent(p.url.replace(/^https?:\/\/[^/]+/, "")).replace(/[-_/]/g, " ")}`) }));
  const draftToks = drafts
    .filter((d) => !d.publishedPostUrl && (!d.site || d.site === site))
    .map((d) => ({ id: d.id, title: d.article.title, t: toks(d.article.title) }));
  const siteRanks = ranks.filter((r) => host(r.domain) === site);

  const rows: MapRow[] = b.clusters.map((c) => {
    const need = toks(c.name).slice(0, 4);
    const scored = pageToks
      .map((p) => ({ url: p.url, title: p.title, score: Math.round(overlap(need, p.t) * 100) }))
      .filter((p) => p.score >= 60)
      .sort((a, z) => z.score - a.score)
      .slice(0, 4);
    const dr = draftToks.filter((d) => overlap(need, d.t) >= 0.6).slice(0, 3).map(({ id, title }) => ({ id, title }));
    const kwSet = new Set([c.name, ...c.keywords].map((k) => fold(k)));
    const rk = siteRanks.find((r) => kwSet.has(fold(r.keyword))) ?? siteRanks.find((r) => overlap(need, toks(r.keyword)) >= 0.99);
    const strong = scored.filter((p) => p.score >= 75);
    const status: MapRow["status"] = strong.length >= 2 ? "cannibal" : scored.length ? "covered" : dr.length ? "draft" : "missing";
    return { cluster: c.name, status, pages: scored, drafts: dr, ranking: rk ? { keyword: rk.keyword, position: rk.lastPosition, url: rk.lastUrl } : null };
  });
  return NextResponse.json({ rows, pagesScanned: pages.length, source: pages.length ? "site" : "none" });
}
