import { generateArticleFromBrief, generateArticleFromTopic } from "./content-generator";
import { fetchPageSummary } from "./content-fetch";
import {
  getBrandKnowledge,
  getLatestGapRunBriefs,
  listUsedContentUrls,
  markCampaignRun,
  saveContentDraft,
  type Campaign,
} from "./db";
import { isDemoMode } from "./geo-providers";
import { fetchFeed, matchesFilter } from "./rss";
import { checkQuota, consumeQuota } from "./usage-guard";
import type { GeneratedArticle } from "@/types";

/**
 * Autoblog — "kur ve unut" içerik üretimi. Üç konu kaynağı:
 *  - gap:      o domainin son Gap Analysis'indeki, henüz taslağa dönmemiş content brief'ler
 *  - rss:      bir RSS/Atom beslemesindeki, henüz kullanılmamış yeni öğeler
 *  - keywords: kullanıcının yazdığı anahtar kelime kuyruğu, sırayla
 * Her çalışmada postsPerRun kadar taslak üretilir. Hiçbir şey kendiliğinden yayınlanmaz —
 * her çıktı Content Studio'da gözden geçirilecek bir taslaktır. AI yalnızca makale yazarken
 * kullanılır; konu seçimi, besleme okuma ve zamanlama tamamen kural tabanlıdır.
 */

const FREQUENCY_DAYS: Record<Campaign["frequency"], number> = { daily: 1, weekly: 7, monthly: 30 };

export function frequencyDays(f: Campaign["frequency"]): number {
  return FREQUENCY_DAYS[f] ?? 7;
}

export function isCampaignDue(campaign: Campaign): boolean {
  if (campaign.status !== "active") return false;
  if (!campaign.lastRunAt) return true;
  // 6 saatlik cron penceresi yüzünden "günlük" bir kampanya 24 saati birkaç dakika
  // kaçırıp bir gün atlamasın diye küçük bir tolerans bırakıyoruz.
  const dueAt = new Date(campaign.lastRunAt).getTime() + frequencyDays(campaign.frequency) * 864e5 - 30 * 60 * 1000;
  return Date.now() >= dueAt;
}

export interface CampaignRunResult {
  campaignId: number;
  status: "generated" | "skipped-no-topic" | "skipped-quota" | "error";
  message: string;
  draftId?: number;
  url?: string;
  draftIds?: number[];
}

export const keywordKey = (kw: string) => `keyword:${kw.trim().toLocaleLowerCase("tr")}`;

interface Topic {
  key: string; // content_drafts.source_url — aynı konunun ikinci kez yazılmasını engeller
  label: string;
  write: (knowledge: string) => Promise<GeneratedArticle>;
}

async function nextTopics(campaign: Campaign, used: Set<string>, count: number): Promise<{ topics: Topic[]; emptyReason: string }> {
  const brand = { name: campaign.brandName, domain: campaign.brandDomain };
  const format = campaign.format;

  if (campaign.source === "keywords") {
    const list = (campaign.config.keywords ?? []).map((k) => k.trim()).filter(Boolean);
    const fresh = list.filter((k) => !used.has(keywordKey(k)));
    return {
      topics: fresh.slice(0, count).map((kw) => ({
        key: keywordKey(kw),
        label: kw,
        write: (knowledge) => generateArticleFromTopic(kw, brand, { format, knowledge }),
      })),
      emptyReason:
        list.length === 0
          ? "Bu kampanyanın anahtar kelime listesi boş — Düzenle'den anahtar kelime ekle."
          : "Kuyruktaki tüm anahtar kelimeler taslağa dönüştü — Düzenle'den yeni anahtar kelime ekle.",
    };
  }

  if (campaign.source === "rss") {
    if (!campaign.config.rssUrl) return { topics: [], emptyReason: "Bu kampanyada RSS adresi tanımlı değil." };
    const feed = await fetchFeed(campaign.config.rssUrl);
    const fresh = feed.items.filter((it) => !used.has(it.link) && matchesFilter(it, campaign.config.rssFilter));
    return {
      topics: fresh.slice(0, count).map((it) => ({
        key: it.link,
        label: it.title,
        write: async (knowledge) => {
          // Öğenin kendi sayfasını okumayı dene; olmazsa beslemedeki özetle yetin.
          const page = await fetchPageSummary(it.link).catch(() => null);
          const context = page?.bodyText && page.bodyText.length > 300 ? page.bodyText : `${it.title}\n${it.summary}`;
          return generateArticleFromTopic(it.title, brand, { format, knowledge, context, sourceUrl: it.link });
        },
      })),
      emptyReason:
        feed.items.length === 0
          ? "Beslemede hiç öğe yok."
          : "Beslemede kullanılmamış yeni bir öğe yok — yeni yazı yayınlandığında bir sonraki çalışmada alınacak.",
    };
  }

  // gap (varsayılan)
  const latest = await getLatestGapRunBriefs(campaign.userId, campaign.brandDomain);
  if (!latest || latest.contentBriefs.length === 0) {
    return { topics: [], emptyReason: "Bu domain için hiç Gap Analysis sonucu yok — önce Gap Analysis çalıştır ya da kaynağı RSS / anahtar kelime yap." };
  }
  const fresh = latest.contentBriefs.filter((b) => !used.has(b.url));
  return {
    topics: fresh.slice(0, count).map((b) => ({
      key: b.url,
      label: b.url,
      write: (knowledge) => generateArticleFromBrief(b, brand, format, knowledge),
    })),
    emptyReason: "Son Gap Analysis'teki tüm konular taslağa dönüştü — yeni konu için Gap Analysis'i tekrar çalıştır.",
  };
}

export async function runCampaign(campaign: Campaign): Promise<CampaignRunResult> {
  try {
    const used = await listUsedContentUrls(campaign.userId);
    const want = Math.max(1, Math.min(3, campaign.postsPerRun || 1));
    const { topics, emptyReason } = await nextTopics(campaign, used, want);
    if (topics.length === 0) {
      await markCampaignRun(campaign.id, emptyReason);
      return { campaignId: campaign.id, status: "skipped-no-topic", message: emptyReason };
    }

    const demoMode = isDemoMode();
    const knowledge = (await getBrandKnowledge(campaign.userId).catch(() => ({ content: "" }))).content;
    const made: { id: number; label: string }[] = [];
    const errors: string[] = [];
    let quotaHit: string | null = null;

    for (const t of topics) {
      if (!demoMode) {
        const quota = await checkQuota(campaign.userId, "contentGenerations", 1);
        if (!quota.allowed) {
          quotaHit = `Aylık içerik üretim kotası doldu (${quota.used}/${quota.limit}).`;
          break;
        }
      }
      try {
        const article = await t.write(knowledge);
        if (!demoMode) await consumeQuota(campaign.userId, "contentGenerations", 1);
        const draft = await saveContentDraft(campaign.userId, t.key, article, campaign.id);
        made.push({ id: draft.id, label: t.label });
      } catch (err) {
        errors.push(`"${t.label}": ${err instanceof Error ? err.message : "üretilemedi"}`);
      }
    }

    if (made.length === 0) {
      const message = quotaHit ? `${quotaHit} Bu dönem atlandı, kota yenilenince devam edecek.` : `Taslak üretilemedi — ${errors.join(" · ")}`;
      await markCampaignRun(campaign.id, message);
      return { campaignId: campaign.id, status: quotaHit ? "skipped-quota" : "error", message };
    }

    const parts = [`${made.length} yeni taslak: ${made.map((m) => `"${m.label}"`).join(", ")} — Content Studio'da inceleyip yayınlayabilirsin.`];
    if (quotaHit) parts.push(quotaHit);
    if (errors.length) parts.push(`Hata: ${errors.join(" · ")}`);
    const message = parts.join(" ");
    await markCampaignRun(campaign.id, message);
    return { campaignId: campaign.id, status: "generated", message, draftId: made[0].id, url: topics[0].key, draftIds: made.map((m) => m.id) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Kampanya çalıştırma sırasında beklenmeyen bir hata oluştu";
    await markCampaignRun(campaign.id, message).catch(() => {});
    return { campaignId: campaign.id, status: "error", message };
  }
}
