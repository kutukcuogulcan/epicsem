/**
 * Site Taraması → "WordPress'e uygula". AI kullanmaz; sadece WordPress REST API'ye yazar.
 *  - Sayfa/yazı başlığı (H1)  → çekirdek: title
 *  - SEO title / meta açıklama / schema → Epicsem Connector eklentisinin meta alanları
 *  - Görsel alt metni → çekirdek: media.alt_text
 */
export interface WpFixes {
  seoTitle?: string;
  metaDescription?: string;
  h1?: string;
  schemaJsonLd?: string;
  altTexts?: { src: string; alt: string }[];
}
export interface ApplyResult {
  field: string;
  ok: boolean;
  detail: string;
}

const auth = (u: string, p: string) => "Basic " + Buffer.from(`${u}:${p}`).toString("base64");
const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();

async function wp(base: string, a: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${base}/wp-json${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: a, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, ok: res.ok, json, text };
}

export async function wpPluginInstalled(siteUrl: string): Promise<boolean> {
  try {
    const r = await fetch(`${siteUrl.replace(/\/+$/, "")}/wp-json/epicsem/v1/ping`, { signal: AbortSignal.timeout(10_000) });
    return r.ok && !!(await r.json())?.ok;
  } catch {
    return false;
  }
}

async function findItem(base: string, a: string, url: string): Promise<{ type: "posts" | "pages"; id: number; link: string } | null> {
  const target = norm(url);
  let path = "/";
  try {
    path = new URL(url).pathname;
  } catch {}
  const slug = decodeURIComponent(path.replace(/\/+$/, "").split("/").pop() ?? "");
  if (!slug) {
    // Ana sayfa: statik ön sayfa ayarlıysa onu kullan
    const s = await wp(base, a, "/wp/v2/settings");
    const id = Number(s.json?.page_on_front);
    if (s.ok && id) return { type: "pages", id, link: base };
    return null;
  }
  for (const type of ["posts", "pages"] as const) {
    const r = await wp(base, a, `/wp/v2/${type}?slug=${encodeURIComponent(slug)}&status=publish,draft,private&_fields=id,link`);
    if (r.ok && Array.isArray(r.json)) {
      const hit = r.json.find((x: any) => norm(x.link) === target) ?? r.json[0];
      if (hit) return { type, id: hit.id, link: hit.link };
    }
  }
  return null;
}

export async function applyFixesToWordpress(params: { siteUrl: string; username: string; appPassword: string; pageUrl: string; fixes: WpFixes }): Promise<{ results: ApplyResult[]; pluginInstalled: boolean; editUrl: string | null }> {
  const base = params.siteUrl.trim().replace(/\/+$/, "");
  const a = auth(params.username, params.appPassword);
  const f = params.fixes;
  const results: ApplyResult[] = [];
  const plugin = await wpPluginInstalled(base);

  const needsItem = !!(f.h1 || f.seoTitle || f.metaDescription || f.schemaJsonLd);
  let item: Awaited<ReturnType<typeof findItem>> = null;
  if (needsItem) {
    item = await findItem(base, a, params.pageUrl);
    if (!item) results.push({ field: "Sayfa", ok: false, detail: "WordPress'te bu adrese ait yazı/sayfa bulunamadı (ürün veya arşiv sayfası olabilir)." });
  }

  if (item) {
    const body: Record<string, unknown> = {};
    const meta: Record<string, string> = {};
    if (f.h1) body.title = f.h1;
    if (plugin) {
      if (f.seoTitle) meta.epicsem_title = f.seoTitle;
      if (f.metaDescription) meta.epicsem_metadesc = f.metaDescription;
      if (f.schemaJsonLd) {
        try {
          JSON.parse(f.schemaJsonLd);
          meta.epicsem_schema = f.schemaJsonLd;
        } catch {
          results.push({ field: "Schema", ok: false, detail: "Geçersiz JSON — uygulanmadı." });
        }
      }
      if (Object.keys(meta).length) body.meta = meta;
    } else {
      for (const [k, label] of [["seoTitle", "SEO title"], ["metaDescription", "Meta açıklama"], ["schemaJsonLd", "Schema"]] as const) {
        if (f[k]) results.push({ field: label, ok: false, detail: "Epicsem Connector eklentisi kurulu değil — bu alan için gerekli." });
      }
    }
    if (Object.keys(body).length) {
      const r = await wp(base, a, `/wp/v2/${item.type}/${item.id}`, { method: "POST", body: JSON.stringify(body) });
      const okMsg = r.ok ? "Uygulandı" : `HTTP ${r.status}: ${r.json?.message ?? r.text.slice(0, 120)}`;
      if (f.h1) results.push({ field: "H1 (sayfa başlığı)", ok: r.ok, detail: okMsg });
      if (meta.epicsem_title) results.push({ field: "SEO title", ok: r.ok, detail: okMsg });
      if (meta.epicsem_metadesc) results.push({ field: "Meta açıklama", ok: r.ok, detail: okMsg });
      if (meta.epicsem_schema) results.push({ field: "Schema", ok: r.ok, detail: okMsg });
    }
  }

  for (const alt of f.altTexts ?? []) {
    const file = decodeURIComponent(alt.src.split("/").pop() ?? "").replace(/\?.*$/, "");
    const stem = file.replace(/\.[a-z0-9]+$/i, "").replace(/-\d+x\d+$/, "").replace(/-scaled$/, "");
    if (!stem) continue;
    const s = await wp(base, a, `/wp/v2/media?search=${encodeURIComponent(stem)}&per_page=20&_fields=id,source_url,media_details`);
    const hit = Array.isArray(s.json)
      ? s.json.find((m: any) => {
          const urls = [m.source_url, ...Object.values(m.media_details?.sizes ?? {}).map((x: any) => x?.source_url)].filter(Boolean) as string[];
          return urls.some((u) => u.split("/").pop() === file) || (m.source_url ?? "").includes(stem);
        })
      : null;
    if (!hit) {
      results.push({ field: `Alt: ${file}`, ok: false, detail: "Medya kütüphanesinde bulunamadı (harici görsel olabilir)." });
      continue;
    }
    const r = await wp(base, a, `/wp/v2/media/${hit.id}`, { method: "POST", body: JSON.stringify({ alt_text: alt.alt }) });
    results.push({ field: `Alt: ${file}`, ok: r.ok, detail: r.ok ? "Uygulandı" : `HTTP ${r.status}` });
  }

  return { results, pluginInstalled: plugin, editUrl: item ? `${base}/wp-admin/post.php?post=${item.id}&action=edit` : null };
}
