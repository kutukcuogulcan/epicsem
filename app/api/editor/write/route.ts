import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { generateArticleFromTopic } from "@/lib/content-generator";
import { getBrandKnowledge, listKnownSites, saveContentDraft } from "@/lib/db";
import { isDemoMode } from "@/lib/geo-providers";
import { checkQuota, consumeQuota, quotaExceededMessage } from "@/lib/usage-guard";
import { rootHost } from "@/lib/backlinks";

export const maxDuration = 120;

/**
 * POST /api/editor/write { topic, keyword?, site?, format?, language?, takeaways? }
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
  try {
    const article = await generateArticleFromTopic(topic, brand, {
      format,
      language,
      takeaways: b.takeaways !== false,
      knowledge: (await getBrandKnowledge(user.id)).content,
    });
    if (!demo) await consumeQuota(user.id, "contentGenerations", 1);
    const draft = await saveContentDraft(user.id, `keyword:${keyword}`, article);
    return NextResponse.json({ id: draft.id, demo: article.demoMode });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Yazı yazılamadı, tekrar dene." }, { status: 500 });
  }
}
