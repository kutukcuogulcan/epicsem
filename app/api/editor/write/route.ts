import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { generateArticleFromTopic, reviseArticle } from "@/lib/content-generator";
import { finalizeArticleBody, needsRevision, polishMarkdown, qualityReport } from "@/lib/article-quality";
import { listKnownSites, saveContentDraft } from "@/lib/db";
import { getActiveProject, projectContextBlock } from "@/lib/project-context";
import { isDemoMode } from "@/lib/geo-providers";
import { checkQuota, consumeQuota, quotaExceededMessage } from "@/lib/usage-guard";
import { rootHost } from "@/lib/backlinks";
import { checkLinks, comparisonBrief, wantsComparison, findImages, insertMedia, internalLinkBrief, researchBrief, researchTopic, sitePagesForLinks, type ResearchResult } from "@/lib/article-enrich";

export const maxDuration = 180;

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
  if (typeof b.note === "string" && b.note.trim()) brief.push(`EDITOR NOTE: ${b.note.trim().slice(0, 700)}`);
  if (b.table) brief.push("Include at least one useful markdown table (comparison, checklist or summary) where it genuinely helps.");
  if (b.cta && site) brief.push(`End with a short, non-pushy call to action paragraph that invites the reader to ${brand.name} (https://${site}).`);
  if (b.internalLinks && site) {
    const ib = internalLinkBrief(await sitePagesForLinks(user.id, site).catch(() => []));
    if (ib) brief.push(ib);
  }
  // Kaynak araştırması (web araması, +1 AI sorgusu): doğrulanmış istatistikler + ilgili YouTube videosu.
  let research: ResearchResult | null = null;
  const project = demo ? null : await getActiveProject(user.id, site).catch(() => null);
  if (!demo && b.research !== false) {
    const q = await checkQuota(user.id, "engineQueries", 1);
    if (q.allowed) {
      research = await researchTopic(String(b.title ?? "").trim() || topic, language, { brand: brand.name, competitors: project?.competitors ?? [] }).catch(() => null);
      if (research) {
        await consumeQuota(user.id, "engineQueries", 1).catch(() => {});
        const rb = researchBrief(research, language);
        if (rb) brief.push(rb);
      }
    }
  }
  // "Nasıl seçilir / en iyi / X mi Y mi" konularında rakiplerin kendi sitelerinden karşılaştırma tablosu.
  if (!demo && wantsComparison(topic, research?.intent)) {
    const cb = await comparisonBrief(brand, project?.competitors ?? [], language).catch(() => "");
    if (cb) brief.push(cb);
  }

  try {
    const article = await generateArticleFromTopic(topic, brand, {
      format,
      language,
      takeaways: b.takeaways !== false,
      knowledge: (await projectContextBlock(user.id, site || null)).trim(),
      title: String(b.title ?? "").trim().slice(0, 200) || undefined,
      outline: outline.length ? outline : undefined,
      faqQuestions,
      brief: brief.join("\n"),
    });
    if (!demo) await consumeQuota(user.id, "contentGenerations", 1);
    // Kalite kapısı: dolgu temizliği (ücretsiz) → puan → düşükse bir kez AI düzeltmesi (+1 AI sorgusu, yalnızca gerekirse).
    article.bodyMarkdown = polishMarkdown(article.bodyMarkdown);
    let quality = qualityReport(article, keyword, { hasSources: !!research?.facts.length });
    let revised = false;
    if (!demo && b.quality !== false && !article.incomplete && needsRevision(quality)) {
      const q = await checkQuota(user.id, "engineQueries", 1);
      if (q.allowed) {
        const better = await reviseArticle(article, quality.issues, { keyword, language, knowledge: (await projectContextBlock(user.id, site || null)).trim() });
        if (better) {
          await consumeQuota(user.id, "engineQueries", 1).catch(() => {});
          better.bodyMarkdown = polishMarkdown(better.bodyMarkdown);
          const q2 = qualityReport(better, keyword, { hasSources: !!research?.facts.length });
          if (q2.overall > quality.overall) {
            Object.assign(article, { title: better.title, metaDescription: better.metaDescription, bodyMarkdown: better.bodyMarkdown, openPlaceholders: better.openPlaceholders });
            quality = q2;
            revised = true;
          }
        }
      }
    }
    // Bozuk/uydurma kaynak linklerini düzelt ya da kaldır, sona "Kaynaklar" listesi ekle (görseller eklenmeden önce).
    if (!demo) article.bodyMarkdown = (await checkLinks(article.bodyMarkdown, { known: research?.facts.map((f) => f.url) ?? [], labels: Object.fromEntries((research?.facts ?? []).map((f) => [f.url, f.source])), ownHost: site, language }).catch(() => null))?.markdown ?? article.bodyMarkdown;
    // Görseller (Openverse, ücretsiz) + video
    if (!demo && b.media !== false) {
      const images = await findImages([...(research?.imageQueries ?? []), ...(article.imageQueries ?? []), keyword], 2).catch(() => []);
      article.bodyMarkdown = insertMedia(article.bodyMarkdown, { images, youtube: research?.youtube ?? null, alt: article.title, language });
    }
    article.bodyMarkdown = finalizeArticleBody(article.title, article.bodyMarkdown);
    const draft = await saveContentDraft(user.id, `keyword:${keyword}`, article, null, site || null);
    return NextResponse.json({ id: draft.id, demo: article.demoMode, incomplete: Boolean(article.incomplete), quality: { seo: quality.seo, geo: quality.geo, overall: quality.overall, revised } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Yazı yazılamadı, tekrar dene." }, { status: 500 });
  }
}
