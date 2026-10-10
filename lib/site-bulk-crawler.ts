import * as cheerio from "cheerio";
import type { BulkCrawlAssets, BulkImportResult, BulkPageMetrics } from "@/types";
import { buildBulkResult, type RawBulkRow } from "@/lib/bulk-analysis";

/**
 * Epicsem'in kendi tüm-site tarayıcısı — harici bir masaüstü crawler'ı (CSV dışa aktarımı)
 * gerektirmeden, sadece bir alan adından tüm sitenin teknik SEO taramasını yapar.
 *
 * 1. robots.txt'deki + /sitemap.xml sitemap'leri okunur (sitemap index'leri alt sitemap'lere
 *    iner), aynı host'taki URL'ler kuyruğa girer.
 * 2. Sitemap yetmezse ana sayfadan başlayarak iç linkler takip edilir (BFS).
 * 3. Her sayfa `redirect: "manual"` ile çekilir — 3xx'ler yönlendirme olarak, 4xx/5xx kırık
 *    olarak raporlanır; 200 HTML'den title, meta açıklama, H1'ler, kelime sayısı, canonical,
 *    meta robots / X-Robots-Tag çıkarılır.
 *
 * Eşzamanlılık ve toplam süre sınırlıdır; sınır dolunca o ana kadar taranan sayfalarla
 * sonuç döner (kısmi tarama `filename`'de "(kısmi)" diye işaretlenir).
 */

const UA = "Mozilla/5.0 (compatible; EpicsemBot/1.0; +https://epicsem.com/bot)";
const PAGE_TIMEOUT_MS = 10000;
const CONCURRENCY = 8;
const TOTAL_BUDGET_MS = 110_000;
const SKIP_EXT = /\.(jpe?g|png|gif|webp|svg|ico|pdf|zip|rar|mp4|mp3|webm|avi|mov|css|js|json|xml|txt|woff2?|ttf|eot|docx?|xlsx?|pptx?)(\?|$)/i;

async function get(url: string, timeoutMs = PAGE_TIMEOUT_MS, redirect: RequestRedirect = "manual"): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: c.signal, redirect, headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" } });
  } finally {
    clearTimeout(t);
  }
}

function canon(u: string): string {
  try {
    const x = new URL(u);
    x.hash = "";
    // izleme parametrelerini at
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|gclid|fbclid|ref$)/i.test(k)) x.searchParams.delete(k);
    return x.toString();
  } catch {
    return u;
  }
}

function sameSite(u: string, host: string): boolean {
  try {
    return new URL(u).hostname.replace(/^www\./, "") === host;
  } catch {
    return false;
  }
}

async function sitemapUrls(origin: string, host: string, limit: number): Promise<string[]> {
  const sources = new Set<string>([`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`]);
  try {
    const r = await get(`${origin}/robots.txt`, 6000, "follow");
    if (r.ok) {
      for (const line of (await r.text()).split(/\r?\n/)) {
        const m = line.trim().match(/^sitemap:\s*(\S+)/i);
        if (m) sources.add(m[1]);
      }
    }
  } catch {}

  const out = new Set<string>();
  const seenMaps = new Set<string>();
  const queue = [...sources];
  while (queue.length && out.size < limit && seenMaps.size < 12) {
    const sm = queue.shift()!;
    if (seenMaps.has(sm)) continue;
    seenMaps.add(sm);
    try {
      const r = await get(sm, 8000, "follow");
      if (!r.ok) continue;
      const $ = cheerio.load(await r.text(), { xmlMode: true });
      $("sitemap > loc").each((_, el) => {
        queue.push($(el).text().trim());
      });
      $("url > loc").each((_, el) => {
        const loc = $(el).text().trim();
        if (loc && sameSite(loc, host) && !SKIP_EXT.test(loc) && out.size < limit) out.add(canon(loc));
      });
    } catch {}
  }
  return [...out];
}

interface PageOutcome {
  row: RawBulkRow;
  /** Bu sayfanın link verdiği iç URL'ler (kanonikleştirilmiş, tekrarsız). */
  links: string[];
  /** Kopya içerik tespiti için metin parmak izi (MinHash). */
  sig?: number[];
}

// --- Kopya içerik: 5 kelimelik parçaların MinHash imzası ---
const MH = 48;
function hash32(str: string, seed: number): number {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function minhash(text: string): number[] | undefined {
  const w = text.toLowerCase().split(/\s+/).filter((x) => x.length > 1);
  if (w.length < 60) return undefined;
  const sig = new Array<number>(MH).fill(0xffffffff);
  for (let i = 0; i + 5 <= w.length; i++) {
    const sh = w.slice(i, i + 5).join(" ");
    for (let k = 0; k < MH; k++) {
      const v = hash32(sh, k * 7919);
      if (v < sig[k]) sig[k] = v;
    }
  }
  return sig;
}
function similarity(a: number[], b: number[]) {
  let same = 0;
  for (let i = 0; i < MH; i++) if (a[i] === b[i]) same++;
  return same / MH;
}

function emptyMetrics(): BulkPageMetrics {
  return {
    responseMs: null,
    htmlKb: null,
    imagesTotal: 0,
    imagesMissingAlt: 0,
    internalOut: 0,
    externalOut: 0,
    inlinks: 0,
    depth: null,
    h2Count: 0,
    schemaTypes: [],
    hasViewport: false,
    lang: null,
    hasOpenGraph: false,
    redirectTarget: null,
    redirectChain: false,
    brokenOutlinks: [],
    inSitemap: false,
    orphan: false,
    mixedContent: 0,
  };
}

function schemaTypesOf($: cheerio.CheerioAPI): string[] {
  const types = new Set<string>();
  const walk = (n: any) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    const t = n["@type"];
    if (typeof t === "string") types.add(t);
    else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && types.add(x));
    if (n["@graph"]) walk(n["@graph"]);
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      walk(JSON.parse($(el).contents().text()));
    } catch {}
  });
  if ($("[itemtype]").length) $("[itemtype]").each((_, el) => {
    const t = ($(el).attr("itemtype") ?? "").split("/").pop();
    if (t) types.add(t);
  });
  return [...types].slice(0, 12);
}

async function crawlOne(url: string, host: string): Promise<PageOutcome> {
  const base: RawBulkRow = {
    url,
    statusCode: null,
    indexable: null,
    title: null,
    titleLength: null,
    metaDescription: null,
    metaDescriptionLength: null,
    h1: null,
    h1Count: 0,
    wordCount: null,
    canonical: null,
    metaRobots: null,
    metrics: emptyMetrics(),
  };
  const t0 = Date.now();
  let res: Response;
  try {
    res = await get(url);
  } catch {
    return { row: { ...base, statusCode: 0, indexable: false }, links: [] };
  }
  const responseMs = Date.now() - t0;
  const status = res.status;
  if (status >= 300 && status < 400) {
    const loc = res.headers.get("location");
    let target: string | null = null;
    try {
      target = loc ? canon(new URL(loc, url).toString()) : null;
    } catch {}
    return {
      row: { ...base, statusCode: status, indexable: false, metrics: { ...emptyMetrics(), responseMs, redirectTarget: target } },
      links: target && sameSite(target, host) ? [target] : [],
    };
  }
  if (status >= 400) return { row: { ...base, statusCode: status, indexable: false, metrics: { ...emptyMetrics(), responseMs } }, links: [] };
  const type = res.headers.get("content-type") ?? "";
  if (!/html/i.test(type)) return { row: { ...base, statusCode: status, metrics: { ...emptyMetrics(), responseMs } }, links: [] };

  const html = await res.text();
  const htmlKb = Math.round((Buffer.byteLength(html, "utf8") / 1024) * 10) / 10;
  const $ = cheerio.load(html);
  const title = $("head > title").first().text().trim() || $("title").first().text().trim() || null;
  const metaDescription = $('meta[name="description" i]').attr("content")?.trim() || null;
  const h1s = $("h1")
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get()
    .filter(Boolean);
  let canonical: string | null = null;
  try {
    const canonicalHref = $('link[rel="canonical" i]').attr("href")?.trim();
    canonical = canonicalHref ? canon(new URL(canonicalHref, url).toString()) : null;
  } catch {}
  const robotsMeta = $('meta[name="robots" i]').attr("content")?.trim() || null;
  const xRobots = res.headers.get("x-robots-tag");
  const metaRobots = [robotsMeta, xRobots].filter(Boolean).join(", ") || null;

  const links = new Set<string>();
  let externalOut = 0;
  let totalLinks = 0;
  const outLinks: { to: string; anchor: string; nofollow: boolean; external: boolean }[] = [];
  const seenOut = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || /^(mailto:|tel:|javascript:|#)/i.test(href)) return;
    try {
      const abs = canon(new URL(href, url).toString());
      if (!/^https?:/i.test(abs)) return;
      totalLinks++;
      const external = !sameSite(abs, host);
      if (!external) {
        if (!SKIP_EXT.test(abs)) links.add(abs);
      } else externalOut++;
      const anchor = ($(el).text().replace(/\s+/g, " ").trim() || $(el).find("img").attr("alt") || $(el).attr("aria-label") || "").slice(0, 120);
      const nofollow = /nofollow/i.test($(el).attr("rel") ?? "");
      const key = `${abs}|${anchor}`;
      if (!seenOut.has(key) && outLinks.length < 150) {
        seenOut.add(key);
        outLinks.push({ to: abs, anchor, nofollow, external });
      }
    } catch {}
  });

  const imgs = $("img");
  let imagesMissingAlt = 0;
  const images: { src: string; alt: string | null; hasSize: boolean }[] = [];
  imgs.each((_, el) => {
    const altAttr = $(el).attr("alt");
    if (altAttr === undefined) imagesMissingAlt++;
    const raw = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-lazy-src") || "";
    if (!raw || raw.startsWith("data:") || images.length >= 60) return;
    try {
      images.push({
        src: new URL(raw, url).toString(),
        alt: altAttr === undefined ? null : altAttr,
        hasSize: !!($(el).attr("width") && $(el).attr("height")) || /aspect-ratio|width\s*:/i.test($(el).attr("style") ?? ""),
      });
    } catch {}
  });
  const hreflang: { lang: string; href: string }[] = [];
  $('link[rel="alternate" i][hreflang]').each((_, el) => {
    const lang = $(el).attr("hreflang")?.trim();
    const href = $(el).attr("href")?.trim();
    if (!lang || !href) return;
    try {
      hreflang.push({ lang, href: canon(new URL(href, url).toString()) });
    } catch {}
  });
  let mixedContent = 0;
  if (url.startsWith("https://")) {
    $("img[src], script[src], iframe[src], link[rel='stylesheet'][href]").each((_, el) => {
      const v = $(el).attr("src") ?? $(el).attr("href") ?? "";
      if (/^http:\/\//i.test(v)) mixedContent++;
    });
  }
  const schemaTypes = schemaTypesOf($);
  const metricsPartial = {
    responseMs,
    htmlKb,
    imagesTotal: imgs.length,
    imagesMissingAlt,
    internalOut: links.size,
    externalOut,
    outLinks,
    images,
    hreflang,
    totalLinks,
    h2Count: $("h2").length,
    schemaTypes,
    hasViewport: $('meta[name="viewport" i]').length > 0,
    lang: $("html").attr("lang")?.trim() || null,
    hasOpenGraph: $('meta[property="og:title"]').length > 0,
    mixedContent,
  };

  $("script, style, noscript, svg, template").remove();
  // Etiketleri boşlukla değiştir — yan yana inline öğeler tek kelimeye yapışmasın.
  const text = ($("body").html() ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const wordCount = text ? text.split(" ").length : 0;
  const noindex = !!metaRobots && /noindex/i.test(metaRobots);
  const canonicalElsewhere = !!canonical && canonical !== canon(url);

  return {
    row: {
      ...base,
      statusCode: status,
      indexable: !noindex && !canonicalElsewhere,
      title,
      titleLength: title ? title.length : null,
      metaDescription,
      metaDescriptionLength: metaDescription ? metaDescription.length : null,
      h1: h1s[0] ?? null,
      h1Count: h1s.length,
      wordCount,
      canonical,
      metaRobots,
      metrics: { ...emptyMetrics(), ...metricsPartial },
    },
    links: [...links],
    sig: minhash(text),
  };
}

export async function crawlSiteBulk(input: string, maxPages = 150): Promise<BulkImportResult> {
  const startUrl = /^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`;
  // Ana sayfanın son adresini (http→https, www) takip ederek gerçek origin'i bul.
  let origin: string;
  try {
    const r = await get(startUrl, 12000, "follow");
    origin = new URL(r.url || startUrl).origin;
  } catch {
    throw new Error("Siteye ulaşılamadı — adresi kontrol edip tekrar dene.");
  }
  const host = new URL(origin).hostname.replace(/^www\./, "");
  const started = Date.now();

  const home = canon(`${origin}/`);
  const fromSitemap = await sitemapUrls(origin, host, maxPages);
  const sitemapSet = new Set(fromSitemap);
  // Önce ana sayfa, sonra sitemap — link takibiyle bulunanlar arkaya eklenir.
  const queue: string[] = [home, ...fromSitemap.filter((u) => u !== home)];
  const seen = new Set<string>(queue);
  const rows: RawBulkRow[] = [];
  const outlinks = new Map<string, string[]>();
  const sigs = new Map<string, number[]>();
  let partial = false;

  let idx = 0;
  let inFlight = 0;
  const worker = async () => {
    for (;;) {
      if (rows.length + inFlight >= maxPages) return;
      if (Date.now() - started > TOTAL_BUDGET_MS) {
        partial = true;
        return;
      }
      if (idx >= queue.length) {
        // Kuyruk boş: başka işçi hâlâ link topluyorsa bekle, yoksa bitir.
        if (inFlight === 0) return;
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }
      const url = queue[idx++];
      inFlight++;
      try {
        const { row, links, sig } = await crawlOne(url, host);
        if (rows.length < maxPages) {
          rows.push(row);
          outlinks.set(url, links);
          if (sig) sigs.set(url, sig);
        }
        for (const l of links) {
          if (seen.size >= maxPages * 4) break;
          if (!seen.has(l)) {
            seen.add(l);
            queue.push(l);
          }
        }
      } finally {
        inFlight--;
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (rows.length === 0) throw new Error("Hiç sayfa taranamadı — site botları engelliyor olabilir.");

  // --- Sayfalar arası analiz: inlink, tık derinliği, kırık iç linkler, yönlendirme zinciri, yetim sayfa ---
  const byUrl = new Map(rows.map((r) => [r.url, r]));
  const inlinks = new Map<string, number>();
  for (const [from, ls] of outlinks) for (const to of ls) if (to !== from) inlinks.set(to, (inlinks.get(to) ?? 0) + 1);

  const depth = new Map<string, number>([[home, 0]]);
  const bfs = [home];
  while (bfs.length) {
    const u = bfs.shift()!;
    for (const v of outlinks.get(u) ?? []) {
      if (!depth.has(v)) {
        depth.set(v, depth.get(u)! + 1);
        bfs.push(v);
      }
    }
  }

  const hasSitemap = sitemapSet.size > 0;
  for (const r of rows) {
    const m = r.metrics!;
    m.inlinks = inlinks.get(r.url) ?? 0;
    m.depth = depth.get(r.url) ?? null;
    m.inSitemap = hasSitemap ? sitemapSet.has(r.url) : true;
    m.orphan = hasSitemap && sitemapSet.has(r.url) && r.url !== home && m.inlinks === 0;
    m.brokenOutlinks = (outlinks.get(r.url) ?? []).filter((to) => {
      const t = byUrl.get(to);
      return !!t && t.statusCode !== null && (t.statusCode >= 400 || t.statusCode === 0);
    });
    if (m.redirectTarget) {
      const t = byUrl.get(m.redirectTarget);
      m.redirectChain = m.redirectTarget !== r.url && !!t && t.statusCode !== null && t.statusCode >= 300 && t.statusCode < 400;
    }
  }

  // --- Ek kontroller (Ahrefs/Semrush'taki gibi): yönlendirme adımları, dış linkler, görseller, kopya içerik, site güvenliği ---
  const assets = await collectAssets(rows, sigs, origin);
  return buildBulkResult(rows, `${host}${partial ? " (kısmi)" : ""}`, ["url", "status", "title", "meta", "h1", "words", "canonical", "robots", "metrics"], assets);
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>, deadline: number) {
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length && Date.now() < deadline) await fn(items[i++]);
    })
  );
}

async function headStatus(u: string): Promise<{ status: number; kb: number | null }> {
  const once = async (method: "HEAD" | "GET") => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 6000);
    try {
      const r = await fetch(u, { method, signal: c.signal, redirect: "follow", headers: { "User-Agent": UA } });
      const len = Number(r.headers.get("content-length"));
      if (method === "GET") r.body?.cancel().catch(() => {});
      return { status: r.status, kb: Number.isFinite(len) && len > 0 ? Math.round(len / 102.4) / 10 : null };
    } finally {
      clearTimeout(t);
    }
  };
  try {
    const h = await once("HEAD");
    // Bazı sunucular HEAD'i desteklemez (405/403/501) — GET ile doğrula.
    if ([403, 405, 501].includes(h.status)) return await once("GET");
    return h;
  } catch {
    try {
      return await once("GET");
    } catch {
      return { status: 0, kb: null };
    }
  }
}

async function collectAssets(rows: RawBulkRow[], sigs: Map<string, number[]>, origin: string): Promise<BulkCrawlAssets> {
  const deadline = Date.now() + 35_000;

  // 1) Yönlendirme adımları (A → B → C), en fazla 6 adım.
  const redirects = rows.filter((r) => r.statusCode !== null && r.statusCode >= 300 && r.statusCode < 400).slice(0, 60);
  await pool(
    redirects,
    6,
    async (r) => {
      const hops: { url: string; status: number }[] = [{ url: r.url, status: r.statusCode! }];
      let next = r.metrics?.redirectTarget ?? null;
      const visited = new Set([r.url]);
      while (next && hops.length < 7) {
        if (visited.has(next)) {
          hops.push({ url: next, status: -1 }); // döngü
          break;
        }
        visited.add(next);
        const cur: string = next;
        try {
          const res = await get(cur, 6000);
          const loc = res.headers.get("location");
          hops.push({ url: cur, status: res.status });
          next = res.status >= 300 && res.status < 400 && loc ? canon(new URL(loc, cur).toString()) : null;
        } catch {
          hops.push({ url: cur, status: 0 });
          next = null;
        }
      }
      r.metrics!.redirectHops = hops;
      r.metrics!.redirectChain = hops.length > 2;
    },
    deadline
  );

  // 2) Dış linkler (benzersiz, en fazla 150).
  const ext = [...new Set(rows.flatMap((r) => (r.metrics?.outLinks ?? []).filter((l) => l.external).map((l) => l.to)))].slice(0, 150);
  const externalLinks: Record<string, number> = {};
  await pool(ext, 10, async (u) => void (externalLinks[u] = (await headStatus(u)).status), deadline);

  // 3) Görseller (benzersiz, en fazla 200): durum + boyut.
  const imgs = [...new Set(rows.flatMap((r) => (r.metrics?.images ?? []).map((i) => i.src)))].slice(0, 200);
  const images: Record<string, { status: number; kb: number | null }> = {};
  await pool(imgs, 10, async (u) => void (images[u] = await headStatus(u)), deadline);

  // 4) Neredeyse aynı içerik (MinHash benzerliği ≥ %85).
  const keys = [...sigs.keys()];
  const groupOf = new Map<string, number>();
  const groups: string[][] = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      if (similarity(sigs.get(keys[i])!, sigs.get(keys[j])!) < 0.85) continue;
      const gi = groupOf.get(keys[i]);
      const gj = groupOf.get(keys[j]);
      if (gi === undefined && gj === undefined) {
        groups.push([keys[i], keys[j]]);
        groupOf.set(keys[i], groups.length - 1).set(keys[j], groups.length - 1);
      } else if (gi !== undefined && gj === undefined) {
        groups[gi].push(keys[j]);
        groupOf.set(keys[j], gi);
      } else if (gj !== undefined && gi === undefined) {
        groups[gj].push(keys[i]);
        groupOf.set(keys[i], gj);
      }
    }
  }

  // 5) Site güvenliği: HTTPS, HSTS, http:// sürümünün https'e yönlenmesi.
  const https = origin.startsWith("https://");
  let hsts = false;
  let httpRedirectsToHttps: boolean | null = null;
  try {
    const r = await get(`${origin}/`, 8000);
    hsts = !!r.headers.get("strict-transport-security");
  } catch {}
  if (https) {
    try {
      const r = await get(origin.replace(/^https:/, "http:") + "/", 8000);
      const loc = r.headers.get("location") ?? "";
      httpRedirectsToHttps = r.status >= 300 && r.status < 400 && /^https:/i.test(new URL(loc, origin).toString());
    } catch {
      httpRedirectsToHttps = null;
    }
  }

  return { externalLinks, images, duplicateGroups: groups, site: { https, hsts, httpRedirectsToHttps } };
}
