import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getBrandKnowledge, getCitationProfile, saveCitationProfile } from "@/lib/db";
import { isDemoMode, runFast } from "@/lib/geo-providers";
import { runForJsonObject } from "@/lib/llm-json";
import { checkQuota, consumeQuota, quotaExceededMessage } from "@/lib/usage-guard";
import { rootHost } from "@/lib/backlinks";
import { BIZ_LABEL, type BizType } from "@/lib/citation-directories";

/**
 * POST { site } — kayıt formlarına yapıştırılacak metinler: slogan, kısa/uzun açıklama,
 * kategoriler, anahtar kelimeler (TR + EN). Bilgi bankası ve profildeki bilgilere dayanır,
 * uydurmaz. 1 içerik üretimi kotası harcar.
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const rl = rateLimit(`citation-texts:${user.id}`, 10, 60 * 60 * 1000);
  if (!rl.allowed) return NextResponse.json({ error: "Saatlik sınıra ulaştın." }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  const site = rootHost(String(b.site ?? ""));
  if (!site) return NextResponse.json({ error: "Site gerekli." }, { status: 400 });
  const profile = await getCitationProfile(user.id, site);
  if (!profile.name) return NextResponse.json({ error: "Önce işletme adını kaydet." }, { status: 400 });

  const fallback = {
    tagline: { tr: `${profile.name} — ${profile.category || "resmi site"}`.slice(0, 60), en: `${profile.name} — official website`.slice(0, 60) },
    short: { tr: (profile.description || `${profile.name}, ${profile.category || "işletme"}.`).slice(0, 160), en: `${profile.name} — ${site}`.slice(0, 160) },
    long: { tr: profile.description || "", en: "" },
    categories: profile.category ? [profile.category] : [],
    keywords: [],
  };
  if (isDemoMode()) {
    await saveCitationProfile(user.id, site, { ...profile, texts: { ...fallback, demo: true } });
    return NextResponse.json({ texts: { ...fallback, demo: true } });
  }
  const quota = await checkQuota(user.id, "contentGenerations", 1);
  if (!quota.allowed) return NextResponse.json({ error: quotaExceededMessage("contentGenerations", quota, 1) }, { status: 402 });

  const kb = (await getBrandKnowledge(user.id).catch(() => ({ content: "" }))).content.slice(0, 4000);
  const prompt = `You write business listing texts for directory/profile sign-up forms (Google Business Profile, Bing Places, Trustpilot, LinkedIn, Product Hunt etc.).
Use ONLY the facts below. Never invent awards, numbers, years, prices, locations or claims. If a fact is missing, leave it out.

Business: ${profile.name}
Website: https://${site}
Type: ${BIZ_LABEL[(profile.bizType as BizType) ?? "ecommerce"]}
Category: ${profile.category || "-"}
Address: ${profile.address || "-"}
Description from owner: ${profile.description || "-"}
Brand knowledge base:
${kb || "-"}

Return ONE JSON object:
{
  "tagline": { "tr": "max 60 chars", "en": "max 60 chars" },
  "short": { "tr": "max 160 chars, what the business is + main benefit", "en": "max 160 chars" },
  "long": { "tr": "450-750 chars, 2 short paragraphs, natural, no hype, no emojis", "en": "450-750 chars" },
  "categories": ["3-5 directory category names in Turkish, most specific first"],
  "keywords": ["6-10 Turkish search phrases customers would use"]
}`;
  try {
    const { parsed } = await runForJsonObject(async (extra) => {
      const r = await runFast(prompt + extra, 0.4);
      if (!r) throw new Error("Yapay zekâ sağlayıcısı yok.");
      return r;
    });
    const texts = {
      tagline: { tr: String(parsed.tagline?.tr ?? "").slice(0, 80), en: String(parsed.tagline?.en ?? "").slice(0, 80) },
      short: { tr: String(parsed.short?.tr ?? "").slice(0, 200), en: String(parsed.short?.en ?? "").slice(0, 200) },
      long: { tr: String(parsed.long?.tr ?? "").slice(0, 1000), en: String(parsed.long?.en ?? "").slice(0, 1000) },
      categories: (Array.isArray(parsed.categories) ? parsed.categories : []).map(String).slice(0, 6),
      keywords: (Array.isArray(parsed.keywords) ? parsed.keywords : []).map(String).slice(0, 12),
    };
    await consumeQuota(user.id, "contentGenerations", 1);
    await saveCitationProfile(user.id, site, { ...profile, texts });
    return NextResponse.json({ texts });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Metinler yazılamadı" }, { status: 502 });
  }
}
