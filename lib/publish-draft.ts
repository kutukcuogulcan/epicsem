import { getCmsConnectionSecret, getDraftCover, markDraftPublished, markDraftPublishError, type CmsConnectionSecret } from "./db";
import { publishDraftToWordpress } from "./wordpress";
import { publishDraftToShopify } from "./shopify";
import { publishDraftToWebhook } from "./webhook-publish";
import type { ContentDraft } from "@/types";
import { pingIndexNow } from "./indexnow-keys";
import { addTableOfContents, buildArticleSchema, slugify } from "./article-post";

export function appBaseUrl(): string {
  return (process.env.APP_URL || "https://epicsem-web.onrender.com").replace(/\/+$/, "");
}

export type PublishMode = "draft" | "publish" | "future";
export interface PublishOptions {
  /** mode "future" iken yayın zamanı (ISO). */
  scheduleAt?: string | null;
  /** Başa içindekiler listesi ekle. */
  toc?: boolean;
  /** URL kısa adı; boşsa başlıktan üretilir. */
  slug?: string;
  /** JSON-LD (BlogPosting + SSS) gönder. Varsayılan açık. */
  schema?: boolean;
  brandName?: string;
}
export interface PublishResult {
  postUrl: string;
  editUrl: string;
  state: "remote-draft" | "scheduled" | "published";
  /** Yazıda doldurulmamış [NEEDS: …] alanı olduğu için canlıya değil taslak olarak gönderildi. */
  downgraded?: boolean;
}

/**
 * Bir taslağı bağlı siteye gönderir — editördeki "Yayınla" ve Autoblog bunu kullanır.
 * Varsayılan her zaman sitede taslaktır; "publish"/"future" yalnız kullanıcı seçtiyse.
 * Güvenlik: yazıda doldurulmamış [NEEDS: …] varsa canlıya çıkmaz, taslak olarak gider.
 */
export async function publishDraftToConnection(
  userId: number,
  draft: ContentDraft,
  connectionOrId: number | CmsConnectionSecret,
  mode: PublishMode = "draft",
  opts: PublishOptions = {}
): Promise<PublishResult> {
  const connection = typeof connectionOrId === "number" ? await getCmsConnectionSecret(userId, connectionOrId) : connectionOrId;
  if (!connection) throw new Error("CMS bağlantısı bulunamadı");

  let status: PublishMode = mode;
  if (status === "future" && !opts.scheduleAt) status = "draft";
  const downgraded = status !== "draft" && /\[NEEDS:/i.test(draft.article.bodyMarkdown);
  if (downgraded) status = "draft";

  // Başlık sitede zaten yazı başlığı olarak görünür; gövdedeki ilk "# Başlık" tekrar etmesin.
  const noH1 = draft.article.bodyMarkdown.replace(/^\s*#\s+[^\n]*\n+/, "");
  const body = opts.toc ? addTableOfContents(noH1) : noH1;
  const slug = slugify(opts.slug?.trim() || draft.article.title);
  const scheduleAt = status === "future" ? new Date(opts.scheduleAt as string).toISOString() : null;

  const cover = await getDraftCover(draft.id).catch(() => null);
  const coverBin = cover && cover.userId === userId ? { mime: cover.mime, data: cover.data } : null;
  const coverUrl = cover ? `${appBaseUrl()}/api/cover/${draft.id}?t=${cover.token}` : null;
  const site = draft.site ? `https://${draft.site}` : undefined;
  const schemaJson =
    opts.schema === false
      ? undefined
      : buildArticleSchema({
          title: draft.article.title,
          description: draft.article.metaDescription,
          markdown: body,
          brandName: opts.brandName,
          siteUrl: site,
          datePublished: scheduleAt ?? new Date().toISOString(),
          imageUrl: coverUrl,
        });

  try {
    const result =
      connection.platform === "webhook"
        ? await publishDraftToWebhook({
            url: connection.siteUrl,
            secret: connection.authSecret,
            title: draft.article.title,
            bodyMarkdown: body,
            excerpt: draft.article.metaDescription,
            sourceUrl: draft.sourceUrl,
            draftId: draft.id,
            status,
            scheduledAt: scheduleAt,
            slug,
            schemaJson,
            coverImageUrl: coverUrl,
          })
        : connection.platform === "shopify"
          ? await publishDraftToShopify({
              shopDomain: connection.siteUrl,
              accessToken: connection.authSecret,
              title: draft.article.title,
              bodyMarkdown: body,
              excerpt: draft.article.metaDescription,
              status,
              scheduleAt,
              slug,
              metaDescription: draft.article.metaDescription,
              cover: coverBin,
            })
          : await publishDraftToWordpress({
              siteUrl: connection.siteUrl,
              username: connection.authIdentifier,
              appPassword: connection.authSecret,
              title: draft.article.title,
              bodyMarkdown: body,
              excerpt: draft.article.metaDescription,
              status,
              scheduleAt,
              slug,
              metaDescription: draft.article.metaDescription,
              schemaJson,
              cover: coverBin,
            });
    const state = status === "publish" ? "published" : status === "future" ? "scheduled" : "remote-draft";
    await markDraftPublished(userId, draft.id, { connectionId: connection.id, postUrl: result.postUrl, editUrl: result.editUrl, state, scheduledAt: scheduleAt });
    // Yayınlandıysa arama motorlarına bildir. WordPress'te Epicsem Connector 1.2 bunu kendisi yapar.
    if (status === "publish" && connection.platform !== "wordpress" && result.postUrl) await pingIndexNow(userId, result.postUrl);
    return { postUrl: result.postUrl, editUrl: result.editUrl, state, downgraded };
  } catch (err) {
    await markDraftPublishError(userId, draft.id, err instanceof Error ? err.message : "Gönderilemedi").catch(() => {});
    throw err;
  }
}
