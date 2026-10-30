import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { generateArticleFromTopic } from "@/lib/content-generator";
import { getBrandKnowledge, getLatestCrawlPages, listKnownSites, saveContentDraft } from "@/lib/db";
import { isDemoMode } from "@/lib/geo-providers";
import { checkQuota, consumeQuota, quotaExceededMessage } from "@/lib/usage-guard";
import { rootHost } from "@/lib/backlinks";

export const maxDuration = 120;

/**
 * POST /api/editor/write { topic, keyword?, site?, format?, language?, takeaways?,
 *   title?, outline?, faqQuestions?, length?: short|medium|long, tone?, faq?, table?, internalLinks?, cta? }
 * Konudan tam makale yazar (Autoblog ile aynı "uydurma yok" kuralları + marka bilgi bankası),
 * taslak olarak kaydeder ve { id } döner; editör bu taslağı açar. 1 içerik kotası harcar.
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const lim = rateLimit(`editor-write:${user.id}`, 20, 60 * 60 * 1000);
  if (!lim.allowed) return NextResponse.json({ error: "Saatte en fazla 20 yazı yazılabilir." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(lim.resetAt)) } });

  const b = await req.json().catch(() => ({}));
  const topic = String(b.topic ?? "").trim().slice(0, 200);
  const keyword = String(b.keyword ?? "").trim().slice(0, 100) || topic;
  if (topic.length < 3) return NextResponse.json({ error: "Konu yaz (en az 3 karakter)." }, { status: 400 });
  const format = b.format === "listicle" ? "listicle" : "article";
  const language = ["tr", "en", "de", "fr", "es", "it", "nl", "ar", "ru", "pt"].includes(b.language) ? String(b.language) : "tr";

  const site = rootHost(String(b.site ?? "")) || rootHost((await listKnownSites(user.id))[0] ?? "");
  const label = site ? site.split(".")[0] : "";
  const brand = { name: String(b.brandName ?? "").trim() || (label ? label.charAt(0).toLocaleUpperCase("tr") + label.slice(1) : "Marka"), domain: site || "example.com" };

  const demo = isDemoMode();
  if (!demo) {
    const q = await checkQuota(user.id, "contentGenerations", 1);
    if (!q.allowed) return NextResponse.json({ error: quotaExceededMessage("contentGenerations", q, 1) }, { status: 402 });
  }
  const outline = (Array.isArray(b.outline) ? b.outline : [])
    .filter((x: any) => x && String(x.h2 ?? "").trim())
    .slice(0, 14)
    .map((x: any) => ({ h2: String(x.h2).slice(0, 160), h3: (Array.isArray(x.h3) ? x.h3 : []).map(String).filter((h: string) => h.trim()).slice(0, 5), note: String(x.note ?? "").slice(0, 240) }));
  const faqOn = b.faq !== false;
  const faqQuestions = faqOn ? (Array.isArray(b.faqQuestions) ? b.faqQuestions : []).map(String).filter((q: string) => q.trim()).slice(0, 8) : [];

  const WORDS: Record<string, string> = { short: "about 700-900 words", medium: "about 1200-1500 words", long: "about 1800-2200 words" };
  const TONE: Record<string, string> = {
    friendly: "warm, friendly and conversational (address the reader as 'sen' in Turkish)",
    professional: "professional, clear and trustworthy (address the reader as 'siz' in Turkish)",
    expert: "expert and authoritative, with precise terminology explained simply",
    simple: "very simple, short sentences, easy for beginners",
  };
  const brief: string[] = [`Target length: ${WORDS[b.length] ?? WORDS.medium} in bodyMarkdown.`, `Tone: ${TONE[b.tone] ?? TONE.professional}.`];
  if (!faqOn) brief.push("Do NOT add an FAQ section.");
  if (b.table) brief.push("Include at least one useful markdown table (comparison, checklist or summary) where it genuinely helps.");
  if (b.cta && site) brief.push(`End with a short, non-pushy call to action paragraph that invites the reader to ${brand.name} (https://${site}).`);
  if (b.internalLinks && site) {
    const pages = (await getLatestCrawlPages(user.id, site).catch(() => []))
      .filter((p) => p.title || p.h1)
      .slice(0, 40)
      .map((p) => `- ${p.title || p.h1}: ${p.url}`);
    if (pages.length) brief.push(`Add 2-4 internal links as natural in-sentence markdown links, ONLY to relevant pages from this list (use the exact URLs, skip if none fit):\n${pages.join("\n")}`);
  }

  try {
    const article = await generateArticleFromTopic(topic, brand, {
      format,
      language,
      takeaways: b.takeaways !== false,
      knowledge: (await getBrandKnowledge(user.id)).content,
      title: String(b.title ?? "").trim().slice(0, 200) || undefined,
      outline: outline.length ? outline : undefined,
      faqQuestions,
      brief: brief.join("\n"),
    });
    if (!demo) await consumeQuota(user.id, "contentGenerations", 1);
    const draft = await saveContentDraft(user.id, `keyword:${keyword}`, article);
    return NextResponse.json({ id: draft.id, demo: article.demoMode });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Yazı yazılamadı, tekrar dene." }, { status: 500 });
  }
}
