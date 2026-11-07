import { slugify } from "./article-post";
/**
 * WordPress REST API integration — the one CMS target for now (by far the most common
 * one agencies' clients run). Publishing ALWAYS creates a `status: "draft"` post, never
 * `publish` — this is a deliberate product decision (see the AskUserQuestion answer that
 * scoped this feature), not a missing feature: it's what keeps a model's mistake from
 * reaching a live site unreviewed, which is the exact failure mode documented against
 * Arvow's fully-automatic autoblog.
 *
 * Auth: WordPress "Application Passwords" (Users → Profile → Application Passwords in
 * wp-admin, built into WordPress core since 5.6) — a scoped, individually-revocable
 * credential, not the user's real login password. Sent as HTTP Basic auth per the
 * documented REST API convention.
 */

function authHeader(username: string, appPassword: string): string {
  return "Basic " + Buffer.from(`${username}:${appPassword}`).toString("base64");
}

function normalizeBase(siteUrl: string): string {
  return siteUrl.trim().replace(/\/+$/, "");
}

export interface WpTestResult {
  ok: boolean;
  siteUserName?: string;
  error?: string;
}

export async function testWpConnection(siteUrl: string, username: string, appPassword: string): Promise<WpTestResult> {
  const base = normalizeBase(siteUrl);
  try {
    const res = await fetch(`${base}/wp-json/wp/v2/users/me`, {
      headers: { Authorization: authHeader(username, appPassword) },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const detail = res.status === 401 ? "kullanıcı adı veya uygulama parolası hatalı" : `HTTP ${res.status}`;
      return { ok: false, error: `WordPress'e bağlanılamadı (${detail}). Site URL'sinin doğru olduğundan ve WordPress REST API'sinin engellenmediğinden emin olun.` };
    }
    const data = await res.json();
    return { ok: true, siteUserName: data?.name ?? username };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Bağlantı başarısız" };
  }
}

/** Hafif markdown → HTML (bağımlılık yok). Başlıklar, madde/numaralı listeler, tablolar,
 * alıntılar, kalın/italik/kod ve bağlantılar. Başlıklara içindekiler için id verilir. */
export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let list: "ul" | "ol" | null = null;
  let table: string[][] | null = null;
  const used = new Map<string, number>();

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  function inline(text: string): string {
    return esc(text)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(?<!\*)\*(?!\*)(.+?)\*(?!\*)/g, "<em>$1</em>")
      .replace(/\[([^\]]+)\]\(((?:https?:\/\/|#|\/)[^\s)]*)\)/g, '<a href="$2">$1</a>');
  }
  function closeList() {
    if (list) html.push(`</${list}>`);
    list = null;
  }
  function closeTable() {
    if (!table) return;
    const rows = table.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
    if (rows.length) {
      const [head, ...body] = rows;
      html.push("<table>", `<thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>`, "<tbody>");
      for (const r of body) html.push(`<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`);
      html.push("</tbody>", "</table>");
    }
    table = null;
  }
  function anchor(text: string): string {
    const base = slugify(text.replace(/[*_`]/g, "")) || "bolum";
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    return n ? `${base}-${n + 1}` : base;
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (/^\|.*\|$/.test(line)) {
      closeList();
      (table ??= []).push(line.slice(1, -1).split("|").map((c) => c.trim()));
      continue;
    }
    closeTable();
    if (line === "") {
      closeList();
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      const id = level === 2 || level === 3 ? ` id="${anchor(heading[2])}"` : "";
      html.push(`<h${level}${id}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    const num = line.match(/^\d+[.)]\s+(.*)$/);
    if (bullet || num) {
      const kind = bullet ? "ul" : "ol";
      if (list !== kind) {
        closeList();
        html.push(`<${kind}>`);
        list = kind;
      }
      html.push(`<li>${inline((bullet ?? num)![1])}</li>`);
      continue;
    }
    closeList();
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      html.push(`<blockquote><p>${inline(quote[1])}</p></blockquote>`);
      continue;
    }
    html.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  closeTable();
  return html.join("\n");
}

export interface WpPublishResult {
  postId: number;
  postUrl: string;
  editUrl: string;
}

export async function publishDraftToWordpress(params: {
  siteUrl: string;
  username: string;
  appPassword: string;
  title: string;
  bodyMarkdown: string;
  excerpt?: string;
  /** "publish"/"future" yalnızca kullanıcı bilerek seçtiyse (editörde Yayınla/Zamanla, Autoblog tam otomatik). */
  status?: "draft" | "publish" | "future";
  /** status "future" iken yayın zamanı (ISO, UTC). */
  scheduleAt?: string | null;
  slug?: string;
  /** Epicsem Connector eklentisi kuruluysa meta açıklama ve JSON-LD olarak sayfaya basılır; yoksa WordPress yok sayar. */
  metaDescription?: string;
  schemaJson?: string;
  cover?: { mime: string; data: Buffer } | null;
}): Promise<WpPublishResult> {
  const base = normalizeBase(params.siteUrl);
  let featuredMedia: number | undefined;
  if (params.cover) {
    try {
      const ext = params.cover.mime.includes("png") ? "png" : "jpg";
      const m = await fetch(`${base}/wp-json/wp/v2/media`, {
        method: "POST",
        headers: {
          "Content-Type": params.cover.mime,
          "Content-Disposition": `attachment; filename="kapak-${Date.now()}.${ext}"`,
          Authorization: authHeader(params.username, params.appPassword),
        },
        body: new Uint8Array(params.cover.data),
        signal: AbortSignal.timeout(60_000),
      });
      if (m.ok) featuredMedia = (await m.json()).id;
    } catch {
      /* kapak yüklenemezse yazıyı kapaksız gönder */
    }
  }
  const res = await fetch(`${base}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(params.username, params.appPassword),
    },
    body: JSON.stringify({
      title: params.title,
      content: markdownToHtml(params.bodyMarkdown),
      excerpt: params.excerpt ?? "",
      status: params.status === "publish" ? "publish" : params.status === "future" && params.scheduleAt ? "future" : "draft",
      ...(params.status === "future" && params.scheduleAt ? { date_gmt: params.scheduleAt.replace(/\.\d+Z$/, "").replace(/Z$/, "") } : {}),
      ...(params.slug ? { slug: params.slug } : {}),
      ...(params.metaDescription || params.schemaJson
        ? { meta: { ...(params.metaDescription ? { epicsem_metadesc: params.metaDescription } : {}), ...(params.schemaJson ? { epicsem_schema: params.schemaJson } : {}) } }
        : {}),
      ...(featuredMedia ? { featured_media: featuredMedia } : {}),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`WordPress'e gönderilemedi: HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  return {
    postId: data.id,
    postUrl: data.link,
    editUrl: `${base}/wp-admin/post.php?post=${data.id}&action=edit`,
  };
}
