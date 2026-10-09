import { createHash } from "crypto";
import {
  failRemainingOnboardingSteps,
  getOnboardingDomainCache,
  getOnboardingSession,
  setOnboardingDomainCache,
  setOnboardingTopicsInputSnapshot,
  updateOnboardingStep,
  type OnboardingStepName,
} from "./db";
import { runCrawlStep, runProfileStep, runCompetitorsStep, domainFromUrl, activeCompetitorsOf, type BrandProfileResult, type DiscoveredCompetitor } from "./brand-discovery";
import type { SiteCrawlResult } from "./site-crawler";
import { normalizeUrl } from "./content-fetch";
import { generateTopicsForBrand, type TopicCandidate, type TopicGenerationResult } from "./topic-generator";
import { matchSectorPack, renderTopicSeeds, PERSONA_ORDER, type PersonaKey } from "./sector-packs";
import { planSlotsForTopics } from "./slot-planner";
import { fillAllSlots, generateBrandedTopicPrompts, type SlotFilledPrompt } from "./prompt-suggestions";
import { isDemoMode } from "./geo-providers";
import { consumeQuota } from "./usage-guard";

/**
 * Kart: Otomatik onboarding zinciri ("Adımlar arasında bekleme olmaması").
 *
 * URL girildiği anda (blur'da) /api/onboarding/sessions bir onboarding_sessions satırı açar
 * ve bu fonksiyonu ÇAĞIRIP BEKLEMEDEN (fire-and-forget) hemen 202 döner. Render'da bu web
 * service kalıcı bir Node process olarak çalıştığı için (Vercel-tipi serverless gibi
 * response sonrası process öldürülmüyor), burada await edilmeyen bu promise HTTP yanıtı
 * döndükten sonra da arka planda çalışmayı sürdürür — gerçek bir job kuyruğu (BullMQ/Redis)
 * kurmadan "Next'e basmadan otomatik ilerleme" davranışını verir. Tek instance'ta tam
 * güvenilir; instance çoğaltılırsa (birden fazla Render instance) bu modelin tek zayıf
 * noktası budur — aynı onboarding_sessions şeması gerçek bir kuyruğa (örn. BullMQ) geçişte
 * de kullanılabilir, o yüzden bu kısıt ileride kuyruk eklemeyi engellemiyor.
 *
 * Zincir: Tarama → (Marka profili ‖ Rakipler, paralel) → Topic'ler (10) → Promptlar (10×8).
 * Her adımın durumu (pending/running/ready/error) onboarding_sessions satırında tutulur;
 * GET /api/onboarding/sessions/:id bu satırı okuyup döner — sayfa yenilense de wizard aynı
 * id'yi URL'den okuyup pollamaya devam eder, zincirin kendisi tamamen sunucu tarafında.
 *
 * Kart: Değişiklikte yeniden üretim (hash kontrolü) — adım 4+5'in asıl üretim mantığı artık
 * aşağıdaki generateTopicsAndPrompts()'a taşındı, çünkü app/api/onboarding/sessions/[id]/
 * regenerate/route.ts kullanıcı profili sonradan düzenlediğinde AYNI üretimi tekrar
 * çalıştırabilmeli — iki ayrı (ve zamanla birbirinden sapabilecek) implementasyon yerine tek
 * paylaşılan fonksiyon.
 *
 * Kart: Domain bazlı önbellek — domain, URL'den sıfır ağ isteğiyle çıkarılabildiği için (bkz.
 * domainFromUrl) gerçek tarama adımı başlamadan ÖNCE önbellek kontrol edilir. Önbellekte (7 gün
 * içinde) bu domain için daha önce TAM başarılı bir zincir sonucu varsa, aşağıdaki 5 adımın
 * hiçbiri çalışmaz — ne ağ isteği ne LLM çağrısı ne de kota tüketimi olur, session doğrudan o
 * sonuçlarla "ready" işaretlenir. Önbellek sadece zincirin SONUNDA, beş adımın hepsi gerçekten
 * başarıyla bitince yazılır (bkz. aşağıdaki setOnboardingDomainCache çağrısı).
 */
export async function runOnboardingChain(sessionId: number, userId: number): Promise<void> {
  const demo = isDemoMode();
  const session = await getOnboardingSession(userId, sessionId);
  if (!session) return;
  const { url, language, country } = session;

  const domain = domainFromUrl(url);
  const cached = await getOnboardingDomainCache(domain);
  if (cached) {
    await updateOnboardingStep(sessionId, "crawl", { status: "ready", result: cached.crawlResult });
    await updateOnboardingStep(sessionId, "profile", { status: "ready", result: cached.profileResult });
    await updateOnboardingStep(sessionId, "competitors", { status: "ready", result: cached.competitorsResult });
    await updateOnboardingStep(sessionId, "topics", { status: "ready", result: cached.topicsResult });
    await setOnboardingTopicsInputSnapshot(sessionId, cached.topicsInputHash, cached.topicsInputProducts);
    await updateOnboardingStep(sessionId, "prompts", { status: "ready", result: cached.promptsResult });
    return;
  }

  // 1. Tarama — demo modda (hiçbir LLM API anahtarı yokken) gerçek bir ağ isteği atmaya hiç
  // gerek yok: hiçbir sonraki adım gerçek sayfa içeriğine bakmayacak zaten (hepsi demo
  // placeholder döner), bu da eski discoverBrandFromUrl'ün demo modda fetch'i tamamen atlayan
  // davranışıyla eşleşiyor — demo modda ağ erişimi yavaş/engelli olsa bile zincir hep çalışır.
  await updateOnboardingStep(sessionId, "crawl", { status: "running" });
  let page: { url: string; title: string | null; metaDescription: string | null; bodyText: string };
  // Kart: Hızlı ve kapsamlı tarama — demo modda hâlâ sıfır ağ isteği atılır (siteCrawl undefined
  // kalır); gerçek modda runCrawlStep artık tek sayfa değil, tam çok-sayfalı bir tarama
  // (lib/site-crawler.ts) döner — siteCrawl, aşağıdaki profil/rakip adımlarına ve crawl
  // sonucunun kendisine taşınır ki hem LLM daha zengin bir metinle beslensin hem de (ileride
  // gösterilmek istenirse) hangi sayfaların tarandığı/hangi yöntemle (fetch/jina-reader)
  // okunduğu session satırında saklanmış olsun.
  let siteCrawl: SiteCrawlResult | undefined;
  if (demo) {
    page = { url: normalizeUrl(url), title: null, metaDescription: null, bodyText: "" };
    await updateOnboardingStep(sessionId, "crawl", { status: "ready", result: { domain, page, demoMode: true } });
  } else {
    try {
      // runCrawlStep derives its own domain internally (domainFromUrl is pure/deterministic),
      // so it's always identical to the `domain` already computed above for the cache check —
      // reused rather than reassigned.
      const crawl = await runCrawlStep(url);
      page = crawl.page;
      siteCrawl = crawl.siteCrawl;
      await updateOnboardingStep(sessionId, "crawl", { status: "ready", result: { domain, page, siteCrawl } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Tarama başarısız oldu — site erişilemiyor olabilir";
      await updateOnboardingStep(sessionId, "crawl", { status: "error", error: msg });
      await failRemainingOnboardingSteps(sessionId, "profile", "Tarama başarısız olduğu için devam edilemedi");
      return;
    }
  }

  // 2+3. Marka profili ‖ Rakipler — aynı taramaya bakan iki bağımsız LLM çağrısı, Promise.all
  // ile gerçekten paralel (biri diğerinin içine gömülü değil).
  await updateOnboardingStep(sessionId, "profile", { status: "running" });
  await updateOnboardingStep(sessionId, "competitors", { status: "running" });

  // Kart: Topic üretimi — profil hazır olduğu AN topic'ler başlar; web aramalı rakip adımı
  // (20-40 sn sürebilir) beklenmez. Rakipler sadece promptlar (markalı/rakipli slotlar) için
  // gerekli, o yüzden promptlar topic'ler + rakipler ikisi de bitince başlar.
  const competitorsPromise = runCompetitorsStep(page, domain, language, siteCrawl, country).then(
    (value) => ({ status: "fulfilled" as const, value }),
    (reason) => ({ status: "rejected" as const, reason })
  );
  const competitorsDone = competitorsPromise.then(async (settled) => {
    if (settled.status === "fulfilled") {
      await updateOnboardingStep(sessionId, "competitors", { status: "ready", result: settled.value });
    } else {
      const msg = settled.reason instanceof Error ? settled.reason.message : "Rakip önerisi başarısız oldu";
      await updateOnboardingStep(sessionId, "competitors", { status: "error", error: msg });
    }
    return settled;
  });

  let profile: BrandProfileResult | null = null;
  try {
    profile = await runProfileStep(page, domain, language, siteCrawl);
    await updateOnboardingStep(sessionId, "profile", { status: "ready", result: profile });
    if (!demo && !profile.demoMode) await consumeQuota(userId, "onboardingSetup", 1).catch(() => {});
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Marka profili çıkarılamadı";
    await updateOnboardingStep(sessionId, "profile", { status: "error", error: msg });
  }

  if (!profile) {
    // Topics/Prompts need the brand profile (name/industry/products) — can't proceed without
    // it. Rakip adımı kendi başına bitsin diye beklenir (durumu yazılsın), sonra çıkılır.
    await competitorsDone;
    await failRemainingOnboardingSteps(sessionId, "topics", "Marka profili olmadan devam edilemedi");
    return;
  }

  // 4. Topic'ler (10) — rakipler hâlâ aranırken.
  await updateOnboardingStep(sessionId, "topics", { status: "running" });
  await updateOnboardingStep(sessionId, "prompts", { status: "running" });
  const baseProfile: GenerationProfile = {
    brand: { name: profile.brand.name, domain },
    description: profile.description,
    industry: profile.industry,
    identityAdjectives: profile.identityAdjectives,
    productTags: profile.productTags,
    personas: profile.personas,
    competitors: [],
    country,
    language,
  };

  let topicsResult: TopicGenerationResult;
  try {
    topicsResult = await generateTopics(baseProfile);
    await updateOnboardingStep(sessionId, "topics", { status: "ready", result: topicsResult });
    await setOnboardingTopicsInputSnapshot(sessionId, computeTopicsInputHash(profile.description, profile.industry), profile.productTags);
    if (!demo && !topicsResult.demoMode) await consumeQuota(userId, "onboardingSetup", 1).catch(() => {});
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Topic üretimi başarısız oldu";
    await updateOnboardingStep(sessionId, "topics", { status: "error", error: msg });
    await competitorsDone;
    await failRemainingOnboardingSteps(sessionId, "prompts", "Topic üretimi başarısız olduğu için devam edilemedi");
    return;
  }

  // 5. Promptlar (10×8) — topic'ler hazır + rakip adımı bitti (başarısızsa boş listeyle).
  const competitorsSettled = await competitorsDone;
  const competitors: DiscoveredCompetitor[] = competitorsSettled.status === "fulfilled" ? competitorsSettled.value.competitors : [];
  try {
    const promptsResult = await generatePromptsForTopics({ ...baseProfile, competitors }, topicsResult);
    await updateOnboardingStep(sessionId, "prompts", { status: "ready", result: promptsResult });
    if (!demo && !promptsResult.demoMode) await consumeQuota(userId, "onboardingSetup", 1).catch(() => {});

    // Kart: Domain bazlı önbellek — sadece zincir (rakipler dahil) tamamen başarılıysa yazılır.
    if (competitorsSettled.status === "fulfilled") {
      await setOnboardingDomainCache(domain, {
        crawlResult: demo ? { domain, page, demoMode: true } : { domain, page, siteCrawl },
        profileResult: profile,
        competitorsResult: competitorsSettled.value,
        topicsResult,
        promptsResult,
        topicsInputHash: computeTopicsInputHash(profile.description, profile.industry),
        topicsInputProducts: profile.productTags,
      }).catch(() => {});
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Prompt üretimi başarısız oldu";
    await updateOnboardingStep(sessionId, "prompts", { status: "error", error: msg });
  }
}

export const ONBOARDING_STEP_ORDER: OnboardingStepName[] = ["crawl", "profile", "competitors", "topics", "prompts"];

// ---------------------------------------------------------------------------------------
// Kart: Değişiklikte yeniden üretim (hash kontrolü)
// ---------------------------------------------------------------------------------------

/**
 * topics_result_json is only ever worth trusting as "still matches the brand profile" when
 * nothing the topic-generation prompt actually reads (description, industry) has changed
 * since it ran. identityAdjectives/brandName/competitors are deliberately NOT part of this
 * hash — the card is explicit that an adjective edit alone must never trigger regeneration.
 * productTags is tracked separately as a list (topics_input_products_json), not folded into
 * this hash, because it needs add/remove DIFFING rather than a plain changed/unchanged flag
 * — see app/api/onboarding/sessions/[id]/regenerate/route.ts, which is the only caller that
 * compares this hash against a freshly-edited profile.
 */
export function computeTopicsInputHash(description: string, industry: string): string {
  const normalized = `${description.trim().toLowerCase()}\u0000${industry.trim().toLowerCase()}`;
  return createHash("sha256").update(normalized).digest("hex");
}

export interface GenerationProfile {
  brand: { name: string; domain: string };
  description: string;
  industry: string;
  identityAdjectives: string[];
  productTags: string[];
  /** Raw (not-necessarily-normalized) shares, same shape as BrandProfileResult.personas. */
  personas: Record<PersonaKey, number>;
  competitors: DiscoveredCompetitor[];
  country: string;
  language: "tr" | "en";
}

function normalizedAudience(personas: Record<PersonaKey, number>): Record<PersonaKey, number> {
  const rawTotal = PERSONA_ORDER.reduce((sum, k) => sum + Math.max(0, personas[k] || 0), 0);
  if (rawTotal <= 0) return { simple: 1 / 3, informed: 1 / 3, researcher: 1 / 3 };
  return Object.fromEntries(
    PERSONA_ORDER.map((k) => [k, Math.max(0, personas[k] || 0) / rawTotal])
  ) as Record<PersonaKey, number>;
}

/**
 * Topic'ler (10) + Promptlar (10×8) — runOnboardingChain'in adım 4/5'i, artık burada: hem ilk
 * çalıştırma hem de description/industry değiştiğinde yapılan TAM yeniden üretim
 * (app/api/onboarding/sessions/[id]/regenerate/route.ts) aynı bu fonksiyonu çağırır, böylece
 * ikisi arasında davranış asla sapmaz.
 */
type PromptsResult = { prompts: SlotFilledPrompt[]; brandedPrompts: SlotFilledPrompt[]; demoMode: boolean; model: string; sectorPackId: string };

/** Kart: Topic üretimi — sadece 10 topic (en alakalı 5'i otomatik seçili). Rakip gerektirmez,
 * o yüzden onboarding zincirinde profil hazır olur olmaz çağrılır. */
export async function generateTopics(profile: GenerationProfile): Promise<TopicGenerationResult> {
  const pack = matchSectorPack(profile.industry, profile.description);
  const sectorSeeds = renderTopicSeeds(pack, profile.industry);
  return generateTopicsForBrand(
    {
      name: profile.brand.name,
      domain: profile.brand.domain,
      description: profile.description,
      industry: profile.industry,
      identityAdjectives: profile.identityAdjectives,
      productTags: profile.productTags,
    },
    profile.country,
    profile.language,
    sectorSeeds
  );
}

/** Kart 14 — 10 topic'in hepsi için 8'er slot planlanır ve doldurulur. */
export async function generatePromptsForTopics(profile: GenerationProfile, topicsResult: TopicGenerationResult): Promise<PromptsResult> {
  const pack = matchSectorPack(profile.industry, profile.description);
  const topicNames = topicsResult.candidates.map((c) => c.name);
  const topicDescriptions = new Map(topicsResult.candidates.map((c) => [c.name, c.description]));

  const audience = normalizedAudience(profile.personas);
  const slots = planSlotsForTopics(topicNames, pack, audience, 8, profile.productTags);
  const slotsByTopic = new Map<string, typeof slots>();
  for (const slot of slots) {
    const list = slotsByTopic.get(slot.topic) ?? [];
    list.push(slot);
    slotsByTopic.set(slot.topic, list);
  }

  const brandForPrompts = {
    name: profile.brand.name,
    domain: profile.brand.domain,
    description: profile.description,
    industry: profile.industry,
    productTags: profile.productTags,
  };
  const activeCompetitors = activeCompetitorsOf(profile.competitors);
  const { prompts, demoMode: fillDemoMode, model } = await fillAllSlots({
    brand: brandForPrompts,
    competitors: activeCompetitors,
    slotsByTopic,
    topicDescriptions,
    pack,
    language: profile.language,
    country: profile.country,
    limit: undefined,
  });
  const brandedPrompts = generateBrandedTopicPrompts(brandForPrompts, activeCompetitors);
  return { prompts, brandedPrompts, demoMode: fillDemoMode, model, sectorPackId: pack.id };
}

/**
 * Topic'ler + Promptlar tek seferde — description/industry değiştiğinde yapılan TAM yeniden
 * üretim (app/api/onboarding/sessions/[id]/regenerate/route.ts) kullanır; ilk zincir ise
 * ikisini ayrı ayrı çağırır (topic'ler rakipleri beklemeden başlasın diye).
 */
export async function generateTopicsAndPrompts(
  profile: GenerationProfile
): Promise<{ topicsResult: TopicGenerationResult; promptsResult: PromptsResult }> {
  const topicsResult = await generateTopics(profile);
  const promptsResult = await generatePromptsForTopics(profile, topicsResult);
  return { topicsResult, promptsResult };
}

/** Kart: Değişiklikte yeniden üretim — "bir ürün eklendiyse → sadece o ürün için 1 topic ve
 * promptları üretilir". Reuses generateTopicsForBrand (no new prompt to write/validate)
 * scoped to just the new product so the model's candidate pool is biased toward it, then
 * keeps whichever candidate it tagged source:"product" (falling back to its top-scored
 * candidate if none came back that way — demo mode in particular never tags a source
 * meaningfully, see lib/topic-generator.ts's demoCandidates). Plans+fills exactly 8 slots for
 * that one topic, same as every other topic gets. */
export async function generateTopicForProduct(
  profile: GenerationProfile,
  product: string
): Promise<{ topic: TopicCandidate; prompts: SlotFilledPrompt[]; demoMode: boolean }> {
  const pack = matchSectorPack(profile.industry, profile.description);
  const brandInput = {
    name: profile.brand.name,
    domain: profile.brand.domain,
    description: profile.description,
    industry: profile.industry,
    identityAdjectives: profile.identityAdjectives,
    productTags: [product],
  };
  const scoped = await generateTopicsForBrand(brandInput, profile.country, profile.language, []);
  const topic = scoped.candidates.find((c) => c.source === "product") ?? scoped.candidates[0];
  if (!topic) throw new Error(`"${product}" için topic üretilemedi`);
  // The scoped call above only ever saw this one product — make sure the topic is actually
  // linked to it even if the model's own linked_products list came back empty/off.
  if (!topic.linkedProducts.includes(product)) topic.linkedProducts = [...topic.linkedProducts, product];

  const audience = normalizedAudience(profile.personas);
  const slots = planSlotsForTopics([topic.name], pack, audience, 8, profile.productTags);
  const brandForPrompts = {
    name: profile.brand.name,
    domain: profile.brand.domain,
    description: profile.description,
    industry: profile.industry,
    productTags: profile.productTags,
  };
  const activeCompetitors = activeCompetitorsOf(profile.competitors);
  const { prompts, demoMode } = await fillAllSlots({
    brand: brandForPrompts,
    competitors: activeCompetitors,
    slotsByTopic: new Map([[topic.name, slots]]),
    topicDescriptions: new Map([[topic.name, topic.description]]),
    pack,
    language: profile.language,
    country: profile.country,
    limit: undefined,
  });

  return { topic, prompts, demoMode: scoped.demoMode || demoMode };
}
