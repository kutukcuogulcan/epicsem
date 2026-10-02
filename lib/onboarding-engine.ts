import {
  failRemainingOnboardingSteps,
  getOnboardingSession,
  updateOnboardingStep,
  type OnboardingStepName,
} from "./db";
import { runCrawlStep, runProfileStep, runCompetitorsStep, domainFromUrl, type BrandProfileResult, type DiscoveredCompetitor } from "./brand-discovery";
import { normalizeUrl } from "./content-fetch";
import { generateTopicsForBrand } from "./topic-generator";
import { getSectorPack, matchSectorPack, renderTopicSeeds, PERSONA_ORDER } from "./sector-packs";
import { planSlotsForTopics } from "./slot-planner";
import { fillAllSlots, generateBrandedTopicPrompts } from "./prompt-suggestions";
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
 */
export async function runOnboardingChain(sessionId: number, userId: number): Promise<void> {
  const demo = isDemoMode();
  const session = await getOnboardingSession(userId, sessionId);
  if (!session) return;
  const { url, language, country } = session;

  // 1. Tarama — demo modda (hiçbir LLM API anahtarı yokken) gerçek bir ağ isteği atmaya hiç
  // gerek yok: hiçbir sonraki adım gerçek sayfa içeriğine bakmayacak zaten (hepsi demo
  // placeholder döner), bu da eski discoverBrandFromUrl'ün demo modda fetch'i tamamen atlayan
  // davranışıyla eşleşiyor — demo modda ağ erişimi yavaş/engelli olsa bile zincir hep çalışır.
  await updateOnboardingStep(sessionId, "crawl", { status: "running" });
  let page: { url: string; title: string | null; metaDescription: string | null; bodyText: string };
  let domain: string;
  if (demo) {
    domain = domainFromUrl(url);
    page = { url: normalizeUrl(url), title: null, metaDescription: null, bodyText: "" };
    await updateOnboardingStep(sessionId, "crawl", { status: "ready", result: { domain, page, demoMode: true } });
  } else {
    try {
      const crawl = await runCrawlStep(url);
      page = crawl.page;
      domain = crawl.domain;
      await updateOnboardingStep(sessionId, "crawl", { status: "ready", result: { domain, page } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Tarama başarısız oldu — site erişilemiyor olabilir";
      await updateOnboardingStep(sessionId, "crawl", { status: "error", error: msg });
      await failRemainingOnboardingSteps(sessionId, "profile", "Tarama başarısız olduğu için devam edilemedi");
      return;
    }
  }

  // 2+3. Marka profili ‖ Rakipler — aynı sayfaya bakan iki bağımsız LLM çağrısı, Promise.all
  // ile gerçekten paralel (biri diğerinin içine gömülü değil).
  await updateOnboardingStep(sessionId, "profile", { status: "running" });
  await updateOnboardingStep(sessionId, "competitors", { status: "running" });

  const [profileSettled, competitorsSettled] = await Promise.allSettled([
    runProfileStep(page, domain, language),
    runCompetitorsStep(page, domain, language),
  ]);

  let profile: BrandProfileResult | null = null;
  if (profileSettled.status === "fulfilled") {
    profile = profileSettled.value;
    await updateOnboardingStep(sessionId, "profile", { status: "ready", result: profile });
    if (!demo && !profile.demoMode) await consumeQuota(userId, "onboardingSetup", 1).catch(() => {});
  } else {
    const msg = profileSettled.reason instanceof Error ? profileSettled.reason.message : "Marka profili çıkarılamadı";
    await updateOnboardingStep(sessionId, "profile", { status: "error", error: msg });
  }

  let competitors: DiscoveredCompetitor[] = [];
  if (competitorsSettled.status === "fulfilled") {
    competitors = competitorsSettled.value.competitors;
    await updateOnboardingStep(sessionId, "competitors", { status: "ready", result: competitorsSettled.value });
  } else {
    const msg = competitorsSettled.reason instanceof Error ? competitorsSettled.reason.message : "Rakip önerisi başarısız oldu";
    await updateOnboardingStep(sessionId, "competitors", { status: "error", error: msg });
  }

  if (!profile) {
    // Topics/Prompts need the brand profile (name/industry/products) — can't proceed without
    // it. Competitors failing alone does NOT stop the chain (see below — prompts just runs
    // with an empty competitor list, same as the manual wizard already tolerates).
    await failRemainingOnboardingSteps(sessionId, "topics", "Marka profili olmadan devam edilemedi");
    return;
  }

  // 4. Topic'ler (10) — kullanıcı seçimi beklemeden en iyi 10 aday otomatik kullanılır
  // (lib/topic-generator.ts zaten skora göre top-10'a kırpıyor).
  await updateOnboardingStep(sessionId, "topics", { status: "running" });
  let topicNames: string[] = [];
  let topicDescriptions = new Map<string, string>();
  try {
    const sectorSeeds = renderTopicSeeds(matchSectorPack(profile.industry, profile.description), profile.industry);
    const brandInput = {
      name: profile.brand.name,
      domain,
      description: profile.description,
      industry: profile.industry,
      identityAdjectives: profile.identityAdjectives,
      productTags: profile.productTags,
    };
    const topicResult = await generateTopicsForBrand(brandInput, country, language, sectorSeeds);
    topicNames = topicResult.candidates.map((c) => c.name);
    topicDescriptions = new Map(topicResult.candidates.map((c) => [c.name, c.description]));
    await updateOnboardingStep(sessionId, "topics", { status: "ready", result: topicResult });
    if (!demo && !topicResult.demoMode) await consumeQuota(userId, "onboardingSetup", 1).catch(() => {});
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Topic üretimi başarısız oldu";
    await updateOnboardingStep(sessionId, "topics", { status: "error", error: msg });
    await failRemainingOnboardingSteps(sessionId, "prompts", "Topic üretimi başarısız olduğu için devam edilemedi");
    return;
  }

  // 5. Promptlar (10 topic × 8 slot = 80 prompt) — slot planı tamamen kod (lib/slot-planner.ts),
  // LLM sadece her slotun cümlesini yazıyor (lib/prompt-suggestions.ts'teki fillAllSlots).
  await updateOnboardingStep(sessionId, "prompts", { status: "running" });
  try {
    const pack = matchSectorPack(profile.industry, profile.description);
    const rawTotal = PERSONA_ORDER.reduce((sum, k) => sum + Math.max(0, profile.personas[k] || 0), 0);
    const audience =
      rawTotal > 0
        ? (Object.fromEntries(PERSONA_ORDER.map((k) => [k, Math.max(0, profile.personas[k] || 0) / rawTotal])) as Record<(typeof PERSONA_ORDER)[number], number>)
        : { simple: 1 / 3, informed: 1 / 3, researcher: 1 / 3 };

    const slots = planSlotsForTopics(topicNames, pack, audience, 8, profile.productTags);
    const slotsByTopic = new Map<string, typeof slots>();
    for (const slot of slots) {
      const list = slotsByTopic.get(slot.topic) ?? [];
      list.push(slot);
      slotsByTopic.set(slot.topic, list);
    }

    const brandForPrompts = {
      name: profile.brand.name,
      domain,
      description: profile.description,
      industry: profile.industry,
      productTags: profile.productTags,
    };

    const activeCompetitors = competitors.filter((c) => c.name && c.domain);
    const { prompts, demoMode: fillDemoMode, model } = await fillAllSlots({
      brand: brandForPrompts,
      competitors: activeCompetitors,
      slotsByTopic,
      topicDescriptions,
      pack,
      language,
      country,
      limit: undefined,
    });

    // Branded-topic prompts ("X güvenilir mi?" etc.) are pure template text, no LLM call —
    // generated here too so toggling "X Hakkında'yı da ekle" in the wizard is instant client-
    // side filtering instead of a second round trip, consistent with "zaten üretilmiş olsun".
    const brandedPrompts = generateBrandedTopicPrompts(brandForPrompts, activeCompetitors);

    await updateOnboardingStep(sessionId, "prompts", {
      status: "ready",
      result: { prompts, brandedPrompts, demoMode: fillDemoMode, model, sectorPackId: pack.id },
    });
    if (!demo && !fillDemoMode) await consumeQuota(userId, "onboardingSetup", 1).catch(() => {});
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Prompt üretimi başarısız oldu";
    await updateOnboardingStep(sessionId, "prompts", { status: "error", error: msg });
  }
}

export const ONBOARDING_STEP_ORDER: OnboardingStepName[] = ["crawl", "profile", "competitors", "topics", "prompts"];
