import { getCmsConnectionSecret, getDraftCover, markDraftPublished, type CmsConnectionSecret } from "./db";
import { publishDraftToWordpress } from "./wordpress";
import { publishDraftToShopify } from "./shopify";
import { publishDraftToWebhook } from "./webhook-publish";
import type { ContentDraft } from "@/types";

export function appBaseUrl(): string {
  return (process.env.APP_URL || "https://epicsem-web.onrender.com").replace(/\/+$/, "");
}

/**
 * Bir taslağı bağlı CMS'e gönderir (Content Studio'daki "Yayınla" ve Autoblog'un
 * "sitede taslak" / "tam otomatik" modları bunu kullanır). Varsayılan her zaman taslaktır;
 * status: "publish" yalnızca kullanıcı tam otomatik modu bilerek seçtiyse geçilir.
 */
export async function publishDraftToConnection(
  userId: number,
  draft: ContentDraft,
  connectionOrId: number | CmsConnectionSecret,
  status: "draft" | "publish" = "draft"
): Promise<{ postUrl: string; editUrl: string }> {
  const connection = typeof connectionOrId === "number" ? await getCmsConnectionSecret(userId, connectionOrId) : connectionOrId;
  if (!connection) throw new Error("CMS bağlantısı bulunamadı");
  const cover = await getDraftCover(draft.id).catch(() => null);
  const coverBin = cover && cover.userId === userId ? { mime: cover.mime, data: cover.data } : null;

  const result =
    connection.platform === "webhook"
      ? await publishDraftToWebhook({
          url: connection.siteUrl,
          secret: connection.authSecret,
          title: draft.article.title,
          bodyMarkdown: draft.article.bodyMarkdown,
          excerpt: draft.article.metaDescription,
          sourceUrl: draft.sourceUrl,
          draftId: draft.id,
          status,
          coverImageUrl: cover ? `${appBaseUrl()}/api/cover/${draft.id}?t=${cover.token}` : null,
        })
      : connection.platform === "shopify"
        ? await publishDraftToShopify({
            shopDomain: connection.siteUrl,
            accessToken: connection.authSecret,
            title: draft.article.title,
            bodyMarkdown: draft.article.bodyMarkdown,
            excerpt: draft.article.metaDescription,
            status,
            cover: coverBin,
          })
        : await publishDraftToWordpress({
            siteUrl: connection.siteUrl,
            username: connection.authIdentifier,
            appPassword: connection.authSecret,
            title: draft.article.title,
            bodyMarkdown: draft.article.bodyMarkdown,
            excerpt: draft.article.metaDescription,
            status,
            cover: coverBin,
          });
  await markDraftPublished(userId, draft.id, { connectionId: connection.id, postUrl: result.postUrl, editUrl: result.editUrl });
  return { postUrl: result.postUrl, editUrl: result.editUrl };
}
