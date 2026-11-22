import { gunzipSync } from "node:zlib";
import { blockedReason, safeFetch } from "@/lib/safe-fetch";

/**
 * Sitenin bütün adresleri: robots.txt'deki Sitemap satırları (+ /sitemap.xml, /sitemap_index.xml),
 * iç içe sitemap index'ler ve .gz dosyalar dahil. Bot koruması varsa (Cloudflare vb.) bunu açıkça döndürür.
 * shortcut: en fazla 200 sitemap dosyası / 200.000 adres / süre bütçesi; daha büyük sitelerde "truncated".
 */

const UA = "Mozilla/5.0 (compatible; EpicsemBot/1.0; +https://epicsem-web.onrender.com)";
const MAX_FILES = 200;
const MAX_URLS = 200_000;

export interface SiteUrls {
  origin: string;
  blocked: string | null;
  sitemapFiles: number;
  urls: string[];
  truncated: boolean;
}

const sameHost = (u: string, host: string) => {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "") === host;
  } catch {
    return false;
  }
};

async function readText(url: string): Promise<{ text: string | null; blocked: string | null }> {
  try {
    const r = await safeFetch(url, { headers: { "User-Agent": UA, Accept: "application/xml,text/xml,text/plain,*/*" } }, { timeoutMs: 15_000, maxBytes: 60_000_000 });
    const b = blockedReason(r);
    if (b) return { text: null, blocked: b };
    if (!r.ok) return { text: null, blocked: null };
    const buf = Buffer.from(await r.arrayBuffer());
    const gz = buf[0] === 0x1f && buf[1] === 0x8b; // .gz imzası
    return { text: (gz ? gunzipSync(buf) : buf).toString("utf8"), blocked: null };
  } catch {
    return { text: null, blocked: null };
  }
}

const locs = (xml: string) => Array.from(xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)/gi)).map((m) => m[1].trim().replace(/&amp;/g, "&"));

export async function discoverSiteUrls(site: string, budgetMs = 45_000): Promise<SiteUrls> {
  const origin = /^https?:\/\//i.test(site) ? new URL(site).origin : `https://${site.replace(/\/.*$/, "")}`;
  const host = new URL(origin).hostname.toLowerCase().replace(/^www\./, "");
  const deadline = Date.now() + budgetMs;
  const robots = await readText(`${origin}/robots.txt`);
  if (robots.blocked) return { origin, blocked: robots.blocked, sitemapFiles: 0, urls: [], truncated: false };
  const fromRobots = (robots.text ?? "")
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*sitemap:\s*(\S+)/i)?.[1])
    .filter((x): x is string => !!x);
  const queue = [...new Set([...fromRobots, `${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`])];
  const seen = new Set<string>();
  const urls = new Set<string>();
  let files = 0;
  let truncated = false;
  let blocked: string | null = null;
  while (queue.length) {
    if (files >= MAX_FILES || urls.size >= MAX_URLS || Date.now() > deadline) {
      truncated = true;
      break;
    }
    const batch = queue.splice(0, 4).filter((u) => !seen.has(u));
    batch.forEach((u) => seen.add(u));
    const res = await Promise.all(batch.map(readText));
    for (const { text, blocked: b } of res) {
      if (b) blocked = blocked ?? b;
      if (!text || !/<(urlset|sitemapindex)/i.test(text)) continue;
      files++;
      if (/<sitemapindex/i.test(text)) {
        for (const c of locs(text)) if (!seen.has(c)) queue.push(c);
      } else {
        for (const u of locs(text)) if (sameHost(u, host) && urls.size < MAX_URLS) urls.add(u);
      }
    }
  }
  return { origin, blocked: urls.size ? null : blocked, sitemapFiles: files, urls: [...urls], truncated };
}
