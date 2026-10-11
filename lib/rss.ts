import * as cheerio from "cheerio";
import { normalizeUrl } from "./content-fetch";

/**
 * Autoblog'un RSS kaynağı — AI kullanmaz. RSS 2.0 ve Atom beslemelerini okur; kullanıcı
 * besleme yerine bir site adresi verirse sayfadaki <link rel="alternate"> etiketinden
 * ya da yaygın yollardan (/feed, /rss.xml…) beslemeyi kendisi bulur.
 */

export interface FeedItem {
  title: string;
  link: string;
  summary: string;
  publishedAt: string | null;
}

export interface Feed {
  feedUrl: string;
  title: string | null;
  items: FeedItem[];
}

const UA = "Mozilla/5.0 (compatible; EpicsemAutoblog/1.0; +https://epicsem-web.onrender.com)";

async function get(url: string, timeoutMs = 12000): Promise<{ ok: boolean; status: number; text: string; type: string; finalUrl: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5" },
    });
    const text = (await res.text()).slice(0, 3_000_000);
    return { ok: res.ok, status: res.status, text, type: res.headers.get("content-type") ?? "", finalUrl: res.url || url };
  } finally {
    clearTimeout(timer);
  }
}

function clean(html: string, max = 400): string {
  const text = cheerio.load(`<div>${html}</div>`)("div").text().replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function looksLikeFeed(text: string): boolean {
  const head = text.slice(0, 2000).toLowerCase();
  return head.includes("<rss") || head.includes("<feed") || head.includes("<rdf:rdf");
}

export function parseFeed(xml: string, baseUrl: string): { title: string | null; items: FeedItem[] } {
  const $ = cheerio.load(xml, { xmlMode: true });
  const items: FeedItem[] = [];
  const abs = (href: string) => {
    try {
      return new URL(href.trim(), baseUrl).toString();
    } catch {
      return href.trim();
    }
  };

  $("item").each((_, el) => {
    const it = $(el);
    const link = it.children("link").first().text().trim() || it.children("guid").first().text().trim();
    const title = clean(it.children("title").first().text(), 200);
    if (!link || !title) return;
    items.push({
      title,
      link: abs(link),
      summary: clean(it.children("description").first().text() || it.children("content\\:encoded").first().text()),
      publishedAt: toIso(it.children("pubDate").first().text() || it.children("dc\\:date").first().text()),
    });
  });

  $("entry").each((_, el) => {
    const it = $(el);
    const linkEl = it.children("link[rel='alternate']").first().length ? it.children("link[rel='alternate']").first() : it.children("link").first();
    const link = linkEl.attr("href") || linkEl.text();
    const title = clean(it.children("title").first().text(), 200);
    if (!link || !title) return;
    items.push({
      title,
      link: abs(link),
      summary: clean(
        it.children("summary").first().text() || it.children("content").first().text() || it.find("media\\:description").first().text(),
        1200
      ),
      publishedAt: toIso(it.children("published").first().text() || it.children("updated").first().text()),
    });
  });

  items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  const title = clean($("channel > title").first().text() || $("feed > title").first().text(), 120) || null;
  return { title, items: items.slice(0, 50) };
}

function toIso(s: string): string | null {
  if (!s?.trim()) return null;
  const d = new Date(s.trim());
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Bir besleme ya da site adresi alır, beslemeyi bulup okur. Bulamazsa açıklayıcı hata fırlatır. */
export async function fetchFeed(input: string): Promise<Feed> {
  let url = normalizeUrl(input);
  let first;
  try {
    first = await get(url);
  } catch (err) {
    // https olmayan siteler için bir kez http dene.
    if (!/^https:\/\//i.test(url) || /^https?:\/\//i.test(input.trim())) throw err;
    url = url.replace(/^https:/i, "http:");
    first = await get(url);
  }
  if (!first.ok) throw new Error(`${url} adresi HTTP ${first.status} döndürdü.`);

  if (looksLikeFeed(first.text)) {
    const parsed = parseFeed(first.text, first.finalUrl);
    return { feedUrl: first.finalUrl, ...parsed };
  }

  // HTML sayfası — beslemeyi keşfet.
  const candidates: string[] = [];
  const $ = cheerio.load(first.text);
  $('link[rel="alternate"]').each((_, el) => {
    const type = ($(el).attr("type") ?? "").toLowerCase();
    const href = $(el).attr("href");
    if (href && (type.includes("rss") || type.includes("atom"))) {
      try {
        candidates.push(new URL(href, first.finalUrl).toString());
      } catch {
        /* geçersiz adres — atla */
      }
    }
  });
  const origin = new URL(first.finalUrl).origin;
  for (const path of ["/feed", "/rss.xml", "/feed.xml", "/atom.xml", "/rss", "/blog/feed", "/blog/rss.xml", "/index.xml"]) candidates.push(origin + path);

  for (const c of Array.from(new Set(candidates)).slice(0, 10)) {
    try {
      const r = await get(c, 8000);
      if (r.ok && looksLikeFeed(r.text)) {
        const parsed = parseFeed(r.text, r.finalUrl);
        if (parsed.items.length > 0) return { feedUrl: r.finalUrl, ...parsed };
      }
    } catch {
      /* sıradaki adayı dene */
    }
  }
  throw new Error("Bu adreste RSS/Atom beslemesi bulunamadı. Beslemenin tam adresini girin (ör. site.com/feed).");
}

export function matchesFilter(item: FeedItem, filter: string[] | undefined): boolean {
  const words = (filter ?? []).map((w) => w.trim().toLocaleLowerCase("tr")).filter(Boolean);
  if (words.length === 0) return true;
  const hay = `${item.title} ${item.summary}`.toLocaleLowerCase("tr");
  return words.some((w) => hay.includes(w));
}
