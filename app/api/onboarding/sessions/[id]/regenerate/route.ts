import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOnboardingSession, setOnboardingTopicsInputSnapshot, updateOnboardingStep } from "@/lib/db";
import {
  computeTopicsInputHash,
  generateTopicForProduct,
  generateTopicsAndPrompts,
  type GenerationProfile,
} from "@/lib/onboarding-engine";
import type { TopicCandidate } from "@/lib/topic-generator";
import type { SlotFilledPrompt } from "@/lib/prompt-suggestions";
import { isDemoMode } from "@/lib/geo-providers";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { checkQuota, consumeQuota, quotaExceededMessage } from "@/lib/usage-guard";

const bodySchema = z.object({
  description: z.string().min(1),
  industry: z.string().min(1),
  productTags: z.array(z.string()).default([]),
  brandName: z.string().min(1),
  brandDomain: z.string().min(1),
  identityAdjectives: z.array(z.string()).default([]),
  competitors: z.array(z.object({ name: z.string(), domain: z.string() })).default([]),
  audience: z.object({ simple: z.number(), informed: z.number(), researcher: z.number() }),
});

/**
 * POST /api/onboarding/sessions/:id/regenerate — Kart: Değişiklikte yeniden üretim (hash
 * kontrolü).
 *
 * Called by the wizard right before it shows the topics step (components/OnboardingWizard.tsx's
 * handleEnterTopics), but ONLY when its own cheap client-side check already found that
 * description/industry/productTags differ from what topics were last generated from — when
 * nothing changed, the wizard skips this call entirely and the step opens with zero network
 * round-trip ("Adım 3 anında açılır"). This endpoint re-derives the same decision server-side
 * (never trusts the client's "nothing changed" belief for what it actually DOES — only for
 * whether to call at all) by comparing a hash of (description, industry) against the hash
 * stamped the last time topics/prompts were generated (topics_input_hash), and diffing
 * productTags against the list stamped then (topics_input_products_json):
 *
 *   - hash unchanged, product list unchanged → "none" (should not normally be reached, since
 *     the client already filters this case — a defensive no-op if it's ever reached anyway).
 *   - hash changed (description or industry/"sektör" edited) → "full": topics AND prompts are
 *     regenerated from scratch, same generateTopicsAndPrompts() runOnboardingChain's own
 *     topics+prompts steps call — the product list diff is irrelevant here since a full
 *     regeneration already uses the complete new productTags list.
 *   - hash unchanged but productTags differ → "partial": one generateTopicForProduct() call per
 *     newly added product (exactly 1 topic + its 8 prompts, appended), and topics/prompts
 *     belonging to a removed product are simply filtered out — no LLM call for removals.
 *   - identityAdjectives/brandName/competitors/audience are NEVER part of the change decision
 *     (per the card: "Marka sıfatları değiştiyse → yeniden üretme yok") — they're only used AS
 *     CONTEXT inside whichever regeneration (full/partial) a description/industry/product
 *     change already triggered, never a trigger by themselves.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  const { id } = await params;
  const sessionId = Number(id);
  if (!Number.isInteger(sessionId)) return NextResponse.json({ error: "Geçersiz oturum id" }, { status: 400 });

  const limitResult = rateLimit(`onboarding-regen:${user.id}`, 40, 60 * 60 * 1000);
  if (!limitResult.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached — up to 40 calls per hour. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limitResult.resetAt)) } }
    );
  }

  let body;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }

  const session = await getOnboardingSession(user.id, sessionId);
  if (!session) return NextResponse.json({ error: "Oturum bulunamadı" }, { status: 404 });
  if (session.topicsStatus !== "ready" || !session.topicsResult || !session.promptsResult) {
    return NextResponse.json({ error: "Henüz ilk topic/prompt üretimi tamamlanmadı — lütfen bekleyin." }, { status: 400 });
  }

  const newHash = computeTopicsInputHash(body.description, body.industry);
  const oldHash = session.topicsInputHash;
  const oldProducts = session.topicsInputProducts;
  const newProducts = body.productTags;
  const added = newProducts.filter((p) => !oldProducts.includes(p));
  const removed = oldProducts.filter((p) => !newProducts.includes(p));

  // Nothing that matters changed — defensive no-op, the wizard's own client-side pre-check
  // already skips calling this endpoint in this case.
  if (newHash === oldHash && added.length === 0 && removed.length === 0) {
    return NextResponse.json({ changed: false, mode: "none", topicsResult: session.topicsResult, promptsResult: session.promptsResult });
  }

  const demo = isDemoMode();
  const genProfile: GenerationProfile = {
    brand: { name: body.brandName, domain: body.brandDomain },
    description: body.description,
    industry: body.industry,
    identityAdjectives: body.identityAdjectives,
    productTags: newProducts,
    personas: body.audience,
    competitors: body.competitors,
    country: session.country,
    language: session.language,
  };

  try {
    if (newHash !== oldHash) {
      // Açıklama ya da sektör değişti → topic ve promptlar baştan üretilir. Ürün ekle/sil farkı
      // zaten bu tam üretimin kapsadığı yeni productTags listesine dahil, ayrıca ele almaya
      // gerek yok.
      if (!demo) {
        const quota = await checkQuota(user.id, "onboardingSetup", 2);
        if (!quota.allowed) {
          return NextResponse.json({ error: quotaExceededMessage("onboardingSetup", quota, 2) }, { status: 402 });
        }
      }

      const { topicsResult, promptsResult } = await generateTopicsAndPrompts(genProfile);
      await updateOnboardingStep(sessionId, "topics", { status: "ready", result: topicsResult });
      await updateOnboardingStep(sessionId, "prompts", { status: "ready", result: promptsResult });
      await setOnboardingTopicsInputSnapshot(sessionId, newHash, newProducts);
      if (!demo) {
        if (!topicsResult.demoMode) await consumeQuota(user.id, "onboardingSetup", 1).catch(() => {});
        if (!promptsResult.demoMode) await consumeQuota(user.id, "onboardingSetup", 1).catch(() => {});
      }

      return NextResponse.json({ changed: true, mode: "full", topicsResult, promptsResult });
    }

    // Hash aynı, sadece ürün eklendi/silindi → kısmi (cerrahi) güncelleme.
    if (!demo && added.length > 0) {
      const quota = await checkQuota(user.id, "onboardingSetup", added.length);
      if (!quota.allowed) {
        return NextResponse.json({ error: quotaExceededMessage("onboardingSetup", quota, added.length) }, { status: 402 });
      }
    }

    let topics: TopicCandidate[] = [...session.topicsResult.candidates];
    let autoSelected: string[] = [...session.topicsResult.autoSelected];
    let prompts: SlotFilledPrompt[] = [...session.promptsResult.prompts];
    let anyDemoMode = Boolean(session.topicsResult.demoMode) || Boolean(session.promptsResult.demoMode);

    // Bir ürün silindiyse → ilgili topic (ve promptları) kaldırılır. "İlgili" = o ürünü
    // linkedProducts içinde taşıyan herhangi bir topic. Topic NESNELERİ üzerinden (isme göre
    // değil) filtrelenir — iki farklı topic aynı adı taşıyabilir (demo modda demoCandidates()
    // her zaman aynı 5 sabit adı döndürür; gerçek üretimde de garanti tekil değildir), isme göre
    // filtrelemek ilgisiz bir ürüne bağlı, sadece adı aynı olan başka bir topic'i de yanlışlıkla
    // silebilirdi. promptsResult.prompts ise topic adı dışında bir bağlantı taşımıyor (bkz.
    // SlotFilledPrompt) — bu yüzden promptlar hâlâ ada göre filtrelenir; aynı isimli iki topic'ten
    // biri silinirken bu nadir çakışmada hayatta kalan kopyanın promptları da (yanlışlıkla)
    // süzülebilir. Kabul edilen, dokümante edilmiş bir sınır — tıpkı rakip önerilerinin "doğru
    // olmayabilir" uyarısı gibi, isim çakışması pratikte neredeyse hep demo moda özgü.
    let removedTopicNames: string[] = [];
    if (removed.length > 0) {
      const before = topics;
      topics = topics.filter((t) => !t.linkedProducts.some((p) => removed.includes(p)));
      removedTopicNames = before.filter((t) => !topics.includes(t)).map((t) => t.name);
      // Filtering prompts/autoSelected by "does this name still belong to a surviving topic"
      // (not "was this name ever removed") is what keeps a same-named surviving duplicate's
      // own prompts intact in the rare collision case described above.
      const survivingNames = new Set(topics.map((t) => t.name));
      autoSelected = autoSelected.filter((name) => survivingNames.has(name));
      prompts = prompts.filter((p) => survivingNames.has(p.topic));
    }

    // Bir ürün eklendiyse → sadece o ürün için 1 topic ve promptları üretilir.
    const addedTopicNames: string[] = [];
    for (const product of added) {
      const generated = await generateTopicForProduct(genProfile, product);
      topics.push(generated.topic);
      autoSelected.push(generated.topic.name); // yeni eklenen topic varsayılan olarak seçili
      prompts.push(...generated.prompts);
      addedTopicNames.push(generated.topic.name);
      anyDemoMode = anyDemoMode || generated.demoMode;
      if (!demo && !generated.demoMode) await consumeQuota(user.id, "onboardingSetup", 1).catch(() => {});
    }

    const topicsResult = { ...session.topicsResult, candidates: topics, autoSelected, demoMode: anyDemoMode };
    const promptsResult = { ...session.promptsResult, prompts, demoMode: anyDemoMode };

    await updateOnboardingStep(sessionId, "topics", { status: "ready", result: topicsResult });
    await updateOnboardingStep(sessionId, "prompts", { status: "ready", result: promptsResult });
    await setOnboardingTopicsInputSnapshot(sessionId, newHash, newProducts);

    return NextResponse.json({
      changed: true,
      mode: "partial",
      topicsResult,
      promptsResult,
      addedTopics: addedTopicNames,
      removedTopics: removedTopicNames,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Yeniden üretim başarısız oldu";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
