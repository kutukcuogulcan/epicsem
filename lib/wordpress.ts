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

/** Deliberately minimal — this codebase has no markdown-rendering dependency (same call as
 * the Screaming Frog CSV import writing its own parser instead of adding one), and WP's
 * classic content field just needs reasonable HTML, not a full CommonMark implementation. */
export function markdownToHtml(markdown: string): string {
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
}): Promise<WpPublishResult> {
  const base = normalizeBase(params.siteUrl);
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
      status: "draft",
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`WordPress'e taslak gönderilemedi: HTTP ${res.status} — ${await res.text()}`);
  }
  const data = await res.json();
  return {
    postId: data.id,
    postUrl: data.link,
    editUrl: `${base}/wp-admin/post.php?post=${data.id}&action=edit`,
  };
}
