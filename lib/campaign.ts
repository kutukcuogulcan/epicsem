import { generateArticleFromBrief } from "./content-generator";
import {
  getLatestGapRunBriefs,
  listUsedContentUrls,
  markCampaignRun,
  saveContentDraft,
  type Campaign,
} from "./db";
import { isDemoMode } from "./geo-providers";
import { checkQuota, consumeQuota } from "./usage-guard";

/**
 * "Set it and forget it" content generation — the one Arvow-style piece deliberately
 * left out of the rest of this app's automation (real cron monitoring, the Overview
 * dashboard). Kept narrower than Arvow's own autoblog on purpose: a campaign never
 * invents a topic. Every run picks the next real, not-yet-drafted content gap from
 * this domain's most recent actual Gap Analysis result — never a bare keyword typed
 * into a form — and always lands as a review-first draft (lib/content-generator.ts's
 * existing [NEEDS: ...] placeholder rule and draft-only publish policy apply
 * unchanged). The only thing "automatic" here is WHEN it runs, not WHAT it writes.
 */

const FREQUENCY_DAYS: Record<Campaign["frequency"], number> = { weekly: 7, monthly: 30 };

export function isCampaignDue(campaign: Campaign): boolean {
  if (campaign.status !== "active") return false;
  if (!campaign.lastRunAt) return true;
  const days = FREQUENCY_DAYS[campaign.frequency] ?? 7;
  const dueAt = new Date(campaign.lastRunAt).getTime() + days * 24 * 60 * 60 * 1000;
  return Date.now() >= dueAt;
}

export interface CampaignRunResult {
  campaignId: number;
  status: "generated" | "skipped-no-topic" | "skipped-quota" | "error";
  message: string;
  draftId?: number;
  url?: string;
}

export async function runCampaign(campaign: Campaign): Promise<CampaignRunResult> {
  try {
    const latest = await getLatestGapRunBriefs(campaign.userId, campaign.brandDomain);
    if (!latest || latest.contentBriefs.length === 0) {
      const message = "Bu domain için hiç Gap Analysis sonucu yok — kampaniyanın konu üretebilmesi için önce Gap Analysis çalıştırılmalı.";
      await markCampaignRun(campaign.id, message);
      return { campaignId: campaign.id, status: "skipped-no-topic", message };
    }

    const used = await listUsedContentUrls(campaign.userId);
    const nextBrief = latest.contentBriefs.find((b) => !used.has(b.url));
    if (!nextBrief) {
      const message = "Son Gap Analysis'teki tüm konular zaten bir taslağa dönüştürülmüş — yeni konu için Gap Analysis'i tekrar çalıştır.";
      await markCampaignRun(campaign.id, message);
      return { campaignId: campaign.id, status: "skipped-no-topic", message };
    }

    const demoMode = isDemoMode();
    if (!demoMode) {
      const quota = await checkQuota(campaign.userId, "contentGenerations", 1);
      if (!quota.allowed) {
        const message = `Aylık içerik üretim kotası doldu (${quota.used}/${quota.limit}) — bu dönem için kampanya atlandı, bir sonraki ayda tekrar denenecek.`;
        await markCampaignRun(campaign.id, message);
        return { campaignId: campaign.id, status: "skipped-quota", message };
      }
    }

    const article = await generateArticleFromBrief(nextBrief, { name: campaign.brandName, domain: campaign.brandDomain });
    if (!demoMode) await consumeQuota(campaign.userId, "contentGenerations", 1);
    const draft = await saveContentDraft(campaign.userId, nextBrief.url, article);

    const message = `"${nextBrief.url}" için yeni bir taslak üretildi — Content Studio'da inceleyip yayınlayabilirsin.`;
    await markCampaignRun(campaign.id, message);
    return { campaignId: campaign.id, status: "generated", message, draftId: draft.id, url: nextBrief.url };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Kampanya çalıştırma sırasında beklenmeyen bir hata oluştu";
    await markCampaignRun(campaign.id, message).catch(() => {});
    return { campaignId: campaign.id, status: "error", message };
  }
}
