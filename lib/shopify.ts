/**
 * Shopify Admin API integration — mirrors lib/wordpress.ts's shape and its central product
 * decision: publishing ALWAYS creates an unpublished (draft) blog article, never a live
 * one. Same reasoning as the WordPress integration: a model's mistake should never reach
 * a live storefront unreviewed.
 *
 * Auth: a merchant-generated Custom App Admin API access token (Shopify Admin →
 * Settings → Apps and sales channels → Develop apps → create an app → Admin API access
 * token, scoped to `read_content`/`write_content`). This needs no OAuth app review from
 * us — the merchant creates and owns the token in their own store, same trust model as
 * a WordPress Application Password. Sent via the `X-Shopify-Access-Token` header.
 */

const API_VERSION = "2024-10";

function normalizeShopDomain(input: string): string {
  let v = input.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!v.includes(".")) v = `${v}.myshopify.com`;
  return v;
}

function apiBase(shopDomain: string): string {
  return `https://${normalizeShopDomain(shopDomain)}/admin/api/${API_VERSION}`;
}

export interface ShopifyTestResult {
  ok: boolean;
  siteUserName?: string;
  error?: string;
}

export async function testShopifyConnection(shopDomain: string, accessToken: string): Promise<ShopifyTestResult> {
  try {
    const res = await fetch(`${apiBase(shopDomain)}/shop.json`, {
      headers: { "X-Shopify-Access-Token": accessToken },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const detail = res.status === 401 || res.status === 403 ? "erişim token'ı hatalı veya yetkisi yetersiz" : `HTTP ${res.status}`;
      return { ok: false, error: `Shopify'a bağlanılamadı (${detail}). Mağaza adresinin (örn. magaza.myshopify.com) ve token'ın write_content izniyle oluşturulduğundan emin olun.` };
    }
    const data = await res.json();
    return { ok: true, siteUserName: data?.shop?.name ?? normalizeShopDomain(shopDomain) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Bağlantı başarısız" };
  }
}

/** Same deliberately-minimal markdown→HTML converter as lib/wordpress.ts (kept local so this
 * module has no cross-dependency on the WP integration, in case one is ever removed). */
function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let inList = false;

  function inline(text: string): string {
    return text
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(?<!\*)\*(?!\*)(.+?)\*(?!\*)/g, "<em>$1</em>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
  }

  function closeList() {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      closeList();
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }
    closeList();
    html.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return html.join("\n");
}

interface ShopifyBlog {
  id: number;
  handle: string;
}

/** Shopify articles belong to a blog; most stores have exactly one ("News"). Reuses the
 * first blog found, creating one named "Blog" if the store has none yet. */
async function resolveBlogId(base: string, accessToken: string): Promise<ShopifyBlog> {
  const headers = { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" };
  const listRes = await fetch(`${base}/blogs.json?limit=1`, { headers, signal: AbortSignal.timeout(15_000) });
  if (!listRes.ok) throw new Error(`Shopify blog listesi alınamadı: HTTP ${listRes.status}`);
  const listData = await listRes.json();
  if (Array.isArray(listData.blogs) && listData.blogs.length > 0) return listData.blogs[0];

  const createRes = await fetch(`${base}/blogs.json`, {
    method: "POST",
    headers,
    body: JSON.stringify({ blog: { title: "Blog" } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!createRes.ok) throw new Error(`Shopify'da blog oluşturulamadı: HTTP ${createRes.status}`);
  const createData = await createRes.json();
  return createData.blog;
}

export interface ShopifyPublishResult {
  postId: number;
  postUrl: string;
  editUrl: string;
}

export async function publishDraftToShopify(params: {
  shopDomain: string;
  accessToken: string;
  title: string;
  bodyMarkdown: string;
  excerpt?: string;
}): Promise<ShopifyPublishResult> {
  const domain = normalizeShopDomain(params.shopDomain);
  const base = apiBase(domain);
  const headers = { "X-Shopify-Access-Token": params.accessToken, "Content-Type": "application/json" };

  const blog = await resolveBlogId(base, params.accessToken);

  const res = await fetch(`${base}/blogs/${blog.id}/articles.json`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      article: {
        title: params.title,
        body_html: markdownToHtml(params.bodyMarkdown),
        summary_html: params.excerpt ?? "",
        // Unpublished — Shopify's equivalent of a WordPress draft. A human reviews and
        // publishes it from the Shopify admin; nothing here ever goes live automatically.
        published: false,
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`Shopify'a taslak gönderilemedi: HTTP ${res.status} — ${await res.text()}`);
  }
  const data = await res.json();
  const editUrl = `https://${domain}/admin/blogs/${blog.id}/articles/${data.article.id}`;
  return {
    postId: data.article.id,
    // Unpublished articles have no live URL yet — point both at the admin editor.
    postUrl: editUrl,
    editUrl,
  };
}
