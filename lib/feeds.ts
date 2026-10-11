import * as cheerio from "cheerio";
import { campaignKeywordIdeas, saveFeedItems, type Feed, type FeedEntry } from "./db";
import { fetchFeed, matchesFilter } from "./rss";
import { normalizeUrl } from "./content-fetch";
import { autocomplete } from "./keyword-research";

/**
 * Beslemeler — Autoblog'un konu kaynakları. Hiçbiri AI kullanmaz:
 *  - keyword: başlangıç kelimeleri + Google otomatik tamamlama önerileri + rakiplerin
 *             site haritasındaki yazı başlıkları + kullanıcının Gap/GEO verisi. Haftalık yenilenir,
 *             eski kelimeler korunur, yenileri eklenir.
 *  - news:    Google Haberler RSS araması (konu + ülke + dil).
 *  - rss:     herhangi bir RSS/Atom beslemesi (ya da beslemesi otomatik bulunan site).
 *  - youtube: YouTube kanalının resmi RSS beslemesi (başlık + açıklama).
 */

export const FEED_KIND_LABEL: Record<Feed["kind"], string> = {
  keyword: "Anahtar kelime",
  news: "Haber",
  rss: "RSS",
  youtube: "YouTube",
};

/** Kelime beslemeleri haftada bir, diğerleri 6 saatte bir tazelenir. */
export function feedIsStale(feed: Feed): boolean {
  if (!feed.refreshedAt) return true;
  const age = Date.now() - new Date(feed.refreshedAt).getTime();
  return feed.kind === "keyword" ? age > 7 * 864e5 : age > 6 * 3600e3;
}

const UA = "Mozilla/5.0 (compatible; EpicsemAutoblog/1.0; +https://epicsem-web.onrender.com)";

async function getText(url: string, ms = 8000): Promise<string | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { "User-Agent": UA, "Accept-Language": "tr,en;q=0.8" } });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const MODIFIERS: Record<string, string[]> = {
  tr: ["nedir", "nasıl", "en iyi", "fiyat", "neden"],
  en: ["what is", "how to", "best", "cost", "vs"],
};

/** Rakibin site haritasındaki yazı adreslerinden okunabilir başlık çıkarır (blog/haber yolları öncelikli). */
async function competitorTopics(site: string): Promise<string[]> {
  const base = normalizeUrl(site).replace(/\/+$/, "");
  const urls: string[] = [];
  for (const path of ["/sitemap.xml", "/sitemap_index.xml", "/post-sitemap.xml", "/wp-sitemap.xml"]) {
    const xml = await getText(base + path, 6000);
    if (!xml || !xml.includes("<loc")) continue;
    const $ = cheerio.load(xml, { xmlMode: true });
    const locs = $("loc").map((_, el) => $(el).text().trim()).get();
    // Site haritası dizini ise yazı/blog alt haritasına in.
    const child = locs.find((l) => /post|blog|article|yazi|haber/i.test(l) && l.endsWith(".xml"));
    if (child && locs.every((l) => l.endsWith(".xml"))) {
      const sub = await getText(child, 6000);
      if (sub) {
        const $s = cheerio.load(sub, { xmlMode: true });
        urls.push(...$s("loc").map((_, el) => $s(el).text().trim()).get());
      }
    } else {
      urls.push(...locs.filter((l) => !l.endsWith(".xml")));
    }
    if (urls.length) break;
  }
  const out: string[] = [];
  for (const u of urls.slice(0, 400)) {
    try {
      const segs = new URL(u).pathname.split("/").filter(Boolean);
      const slug = decodeURIComponent(segs[segs.length - 1] ?? "").replace(/\.(html?|php)$/i, "");
      const words = slug.split(/[-_]+/).filter((w) => w && !/^\d+$/.test(w));
      if (words.length >= 3 && words.length <= 10) out.push(words.join(" ").toLocaleLowerCase("tr"));
    } catch {
      /* geçersiz adres */
    }
  }
  return out.slice(0, 40);
}

function hostOf(u: string): string {
  try {
    return new URL(normalizeUrl(u)).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}

async function refreshKeywordFeed(feed: Feed): Promise<FeedEntry[]> {
  const cfg = feed.config;
  const lang = (cfg.language || "tr").toLowerCase();
  const country = (cfg.country || "TR").toUpperCase();
  const now = new Date().toISOString();
  const existing = new Map(feed.items.map((i) => [i.key, i]));
  const add = (kw: string, source: string) => {
    const k = kw.trim().replace(/\s+/g, " ");
    if (k.length < 3 || k.length > 120) return;
    const key = `keyword:${k.toLocaleLowerCase("tr")}`;
    if (!existing.has(key)) existing.set(key, { key, title: k, source, addedAt: now });
  };

  const seeds = (cfg.seeds ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 10);
  for (const s of seeds) add(s, "başlangıç");

  // Otomatik tamamlama: her kelime ve birkaç soru kalıbıyla (en fazla ~25 istek).
  const mods = MODIFIERS[lang] ?? MODIFIERS.en;
  const queries = seeds.flatMap((s) => [s, ...mods.slice(0, 3).map((m) => (lang === "tr" ? `${s} ${m}` : `${m} ${s}`))]).slice(0, 25);
  for (let i = 0; i < queries.length; i += 5) {
    const batch = await Promise.all(queries.slice(i, i + 5).map((q) => autocomplete(q, lang, country)));
    batch.flat().forEach((s) => add(s, "Google önerisi"));
  }

  for (const c of (cfg.competitors ?? []).slice(0, 5)) {
    (await competitorTopics(c)).forEach((t) => add(t, `rakip: ${hostOf(c)}`));
  }

  if (cfg.siteUrl) {
    (await campaignKeywordIdeas(feed.userId, hostOf(cfg.siteUrl))).forEach((q) => add(q, "Gap / GEO"));
  }

  return Array.from(existing.values()).slice(0, 500);
}

async function refreshLinkFeed(feed: Feed): Promise<FeedEntry[]> {
  const cfg = feed.config;
  let url = cfg.url ?? "";
  if (feed.kind === "news") {
    const lang = (cfg.language || "tr").toLowerCase();
    const country = (cfg.country || "TR").toUpperCase();
    url = `https://news.google.com/rss/search?q=${encodeURIComponent(cfg.query ?? "")}&hl=${lang}&gl=${country}&ceid=${country}:${lang}`;
  }
  if (feed.kind === "youtube") {
    const m = url.match(/channel\/(UC[\w-]{20,})/) || url.match(/^(UC[\w-]{20,})$/);
    if (m) url = `https://www.youtube.com/feeds/videos.xml?channel_id=${m[1]}`;
  }
  if (!url) throw new Error("Besleme adresi tanımlı değil.");
  const parsed = await fetchFeed(url);
  return parsed.items
    .filter((it) => matchesFilter(it, cfg.filter))
    .map((it) => ({
      key: it.link,
      title: it.title,
      link: it.link,
      summary: it.summary,
      publishedAt: it.publishedAt,
      source: feed.kind === "news" ? "Google Haberler" : feed.kind === "youtube" ? "YouTube" : parsed.title ?? hostOf(url),
    }));
}

/** Beslemeyi yeniden çeker ve kaydeder. Hata olursa son iyi listeyi korur ve hatayı yazar. */
export async function refreshFeed(feed: Feed): Promise<Feed> {
  try {
    const items = feed.kind === "keyword" ? await refreshKeywordFeed(feed) : await refreshLinkFeed(feed);
    await saveFeedItems(feed.id, items, null);
    return { ...feed, items, lastError: null, refreshedAt: new Date().toISOString() };
  } catch (err) {
    const raw = err instanceof Error ? err.message : "";
    const msg =
      !raw || /fetch failed|aborted|ENOTFOUND|ECONNREFUSED|timeout/i.test(raw)
        ? "Kaynağa ulaşılamadı — adresi kontrol et ya da biraz sonra tekrar dene."
        : raw;
    await saveFeedItems(feed.id, feed.items, msg);
    return { ...feed, lastError: msg, refreshedAt: new Date().toISOString() };
  }
}
