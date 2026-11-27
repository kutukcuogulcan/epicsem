import { runWebSearchPrompt } from "./competitor-discovery";
import { factOnPage, hostOf, isOriginHost } from "./source-origin";
import { extractJsonObject } from "./llm-json";
import { fetchPageSummary } from "./content-fetch";
import * as cheerio from "cheerio";
import { getLatestCrawlPages } from "./db";
import { safeFetch } from "@/lib/safe-fetch";
import { appendSources, planLinks, relink, unlink } from "@/lib/link-check";

/**
 * Yazıyı "yayına hazır sayfa" yapan zenginleştirmeler (Arvow / Outrank / SEObot seviyesi):
 *  1. researchTopic   — web aramasıyla 3–5 gerçek kaynak + istatistik ve 1 ilgili YouTube videosu (1 AI çağrısı).
 *                       Kaynak linkleri açılıp kontrol edilir, video YouTube oEmbed ile doğrulanır; uydurma link kalmaz.
 *  2. findImages      — Openverse'ten (ücretsiz, anahtarsız) ticari kullanıma açık lisanslı görseller + atıf.
 *  3. insertMedia     — görselleri ve videoyu bölümlerin arasına yerleştirir.
 *  4. sitePagesForLinks — iç link için sitenin sayfaları (tarama yoksa sitemap'ten).
 */

export interface ResearchFact {
  fact: string;
  source: string;
  url: string;
  /** Rakamı üreten kurum (araştırmanın beyanı). */
  origin?: string;
  /** Adres o kurumun sitesi değilse: aktaran sitenin alan adı. */
  via?: string;
}
export interface ResearchResult {
  facts: ResearchFact[];
  youtube: { title: string; url: string; id: string } | null;
  imageQueries: string[];
  /** Üst sıradaki sayfaların ve AI cevaplarının ortak olarak işlediği alt konular. */
  coverage: string[];
  /** İnsanların bu konuda gerçekten sorduğu sorular (Google "Diğer sorular", forumlar). */
  questions: string[];
  /** Arama niyeti: bilgi / karşılaştırma / satın alma / nasıl yapılır. */
  intent: string | null;
  model: string;
  /** Bulunan / doğrulamadan geçen bilgi sayısı (şeffaflık ve hata ayıklama). */
  found: number;
  verified: number;
  /** Harcanan web aramalı AI çağrısı (1; doğrulanan bilgi azsa ikinci tur ile 2). Çağıran kotadan bu kadar düşer. */
  calls: number;
}

/** Yalnızca herkese açık alan adları (IP, localhost, iç ağ adresi değil). */
function publicUrl(u: string): boolean {
  try {
    const x = new URL(u);
    return /^https?:$/.test(x.protocol) && /\.[a-z]{2,}$/i.test(x.hostname) && !/^(localhost|.*\.local|.*\.internal)$/i.test(x.hostname) && !/^[\d.]+$/.test(x.hostname);
  } catch {
    return false;
  }
}

const ytId = (u: string) => u.match(/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{11})/)?.[1] ?? null;

async function verifyYoutube(url: string): Promise<{ title: string; url: string; id: string } | null> {
  const id = ytId(url);
  if (!id) return null;
  const watch = `https://www.youtube.com/watch?v=${id}`;
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`, { signal: AbortSignal.timeout(7000) });
    if (!r.ok) return null;
    const j = await r.json();
    return { id, url: watch, title: String(j.title ?? "").slice(0, 150) };
  } catch {
    return null;
  }
}

/** Kaynak sayfasının görünen metni (doğrulama için); açılmazsa text null. */
async function pageTextOf(url: string): Promise<{ status: number; text: string | null; unverifiable?: boolean }> {
  try {
    const r = await safeFetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; EpicsemBot/1.0)" } }, { timeoutMs: 9000, maxBytes: 4_000_000 });
    if (!r.ok) return { status: r.status, text: null };
    const ct = r.headers.get("content-type") ?? "";
    // shortcut: PDF vb. metni okunmaz; 403 gibi doğrulanamaz sayılıp kabul edilir (çoğu asıl rapor). PDF okuyucu eklenince doğrulanır.
    if (!/html|text|xml|json/.test(ct)) return { status: r.status, text: null, unverifiable: true };
    const $ = cheerio.load(await r.text());
    $("script, style, noscript").remove();
    return { status: r.status, text: $("body").text().replace(/\s+/g, " ") };
  } catch {
    return { status: 0, text: null };
  }
}

/** Web aramasıyla kaynaklı bilgiler + video. Web aramalı sağlayıcı yoksa null (yazı kaynaksız yazılır). */
export async function researchTopic(topic: string, language = "tr", opts: { brand?: string; competitors?: { name: string; domain: string }[] } = {}): Promise<ResearchResult | null> {
  const tr = language === "tr";
  const rivals = (opts.competitors ?? []).filter((c) => c.name || c.domain);
  // Rakibin sitesinden kaynak ya da rakibin adı geçen video, markanın yazısında rakibi öne çıkarır.
  const isRival = (url: string, text: string) => {
    const h = (() => { try { return new URL(url).hostname.toLowerCase().replace(/^www\./i, ""); } catch { return ""; } })();
    const t = text.toLocaleLowerCase("tr");
    return rivals.some((c) => {
      const d = c.domain.toLowerCase().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "");
      return (d && h && (h === d || h.endsWith("." + d))) || (c.name.length > 2 && t.includes(c.name.toLocaleLowerCase("tr")));
    });
  };
  const prompt = `SEARCH THE WEB. Topic: "${topic}"${tr ? " (Turkish audience; prefer Turkish or international authoritative sources)" : ""}.
The article is published by ${opts.brand ? `the brand "${opts.brand}"` : "a business"}. Its sources must NOT be companies that sell products or services in this field (they are its competitors${rivals.length ? `, e.g. ${rivals.map((c) => c.name || c.domain).join(", ")}` : ""}). Prefer government and regulator sites, statistics institutes, universities, industry associations and news / trade publications.
Find:
1. 3–5 specific, recent facts or statistics about this topic, each from such a neutral, authoritative source page. Use the exact page URL where the fact appears. Prefer the ORIGINAL page of the organization that produced the number (e.g. a Pew Research statistic → pewresearch.org), not a blog or news aggregator quoting it. Set "origin" to the organization that produced the number.
2. ONE relevant, high-quality YouTube video that explains this topic (a real youtube.com/watch URL you actually found)${opts.brand ? `, preferably from ${opts.brand}'s own channel; never one from or promoting a competing company` : ""}.
3. What the top-ranking pages and AI answers for this topic cover: 5–8 short subtopics they all include (so a new article is not missing anything), the 4–6 questions people really ask about it (Google "People also ask", forums), and the search intent in 2–4 words (e.g. "informational how-to", "commercial comparison").
4. Two short ENGLISH stock-photo search queries (2–3 concrete, visual words, e.g. "laptop analytics dashboard", "marketing team meeting") that would illustrate this topic. Avoid abstract terms and acronyms.
Never invent a URL or a number. If unsure, leave it out.
Return ONLY JSON: {"facts":[{"fact":"one sentence with the number","source":"publisher name","origin":"organization that produced the number","url":"https://..."}],"youtube":{"title":"","url":"https://www.youtube.com/watch?v=..."},"imageQueries":["",""],"coverage":["subtopic"],"questions":["question?"],"intent":""}`;
  const r = await runWebSearchPrompt(prompt);
  if (!r) return null;
  let parsed: Record<string, any>;
  try {
    parsed = extractJsonObject(r.text);
  } catch {
    return null;
  }
  const toFacts = (arr: unknown): ResearchFact[] => (Array.isArray(arr) ? arr : [])
    .map((f: any) => {
      const url = String(f?.url ?? "").trim();
      const origin = String(f?.origin ?? f?.source ?? "").trim().slice(0, 80);
      // Rakamı üreten kurumun sitesi değilse (aktaran blog), yazıda "X'e göre (aktaran: site)" diye atıf yapılır.
      return { fact: String(f?.fact ?? "").trim().slice(0, 300), source: String(f?.source ?? "").trim().slice(0, 80), url, origin, via: isOriginHost(origin, url) ? undefined : hostOf(url) };
    })
    .filter((f: ResearchFact) => f.fact && publicUrl(f.url) && !isRival(f.url, f.source))
    .slice(0, 6);
  // Kaynak sayfası açılıyor mu ve bilginin rakamı o sayfada gerçekten geçiyor mu? (Yanlış sayfaya bağlanmış bilgi atılır.)
  // 403: bazı siteler botlara kapalı — doğrulanamaz, kabul edilir.
  let found = 0;
  const verify = async (raw: ResearchFact[]) => {
    found += raw.length;
    const checks = await Promise.all(raw.map((f) => pageTextOf(f.url)));
    raw.forEach((f, i) => {
      const c = checks[i];
      const ok = c.status === 403 || c.unverifiable || (c.text != null && factOnPage(f.fact, c.text));
      if (!ok) console.warn(`[research] elendi: ${f.url} (HTTP ${c.status}${c.text != null ? ", rakam sayfada yok" : ""})`);
    });
    return raw.filter((f, i) => checks[i].status === 403 || checks[i].unverifiable || (checks[i].text != null && factOnPage(f.fact, checks[i].text!)));
  };
  let facts = await verify(toFacts(parsed.facts));
  let calls = 1;
  // Doğrulamadan az bilgi geçtiyse ya da hepsi tek siteden geliyorsa yazı tek kaynağa yaslanmasın: farklı kurumlardan ikinci tur (+1 çağrı).
  if (facts.length < 3 || new Set(facts.map((f) => hostOf(f.url))).size < 2) {
    const usedHosts = [...new Set(facts.map((f) => hostOf(f.url)))];
    const usedOrgs = [...new Set(facts.map((f) => f.origin || f.source).filter(Boolean))];
    const r2 = await runWebSearchPrompt(`SEARCH THE WEB. Topic: "${topic}"${tr ? " (Turkish audience)" : ""}.
Find 3–4 MORE specific, recent statistics about this topic from DIFFERENT organizations${usedOrgs.length ? ` than ${usedOrgs.join(", ")}` : ""}${usedHosts.length ? ` and not on ${usedHosts.join(", ")}` : ""}. Same rules: neutral authoritative sources (regulators, statistics institutes, universities, associations, research firms, news), never companies selling in this field${rivals.length ? ` such as ${rivals.map((c) => c.name || c.domain).join(", ")}` : ""}. Use the ORIGINAL page of the organization that produced the number, the exact URL where the number appears. Never invent a URL or a number.
Return ONLY JSON: {"facts":[{"fact":"one sentence with the number","source":"publisher name","origin":"organization that produced the number","url":"https://..."}]}`).catch(() => null);
    if (r2) {
      calls = 2;
      try {
        const more = await verify(toFacts(extractJsonObject(r2.text).facts).filter((f) => !facts.some((x) => x.url === f.url)));
        facts = [...facts, ...more];
      } catch {
        /* ikinci tur bozuk JSON: ilk turla devam */
      }
    }
  }
  facts = facts.slice(0, 5);
  const ytUrl = String(parsed.youtube?.url ?? "");
  const yt = ytUrl ? await verifyYoutube(ytUrl) : null;
  const youtube = yt && !isRival("", yt.title) ? yt : null;
  const imageQueries = (Array.isArray(parsed.imageQueries) ? parsed.imageQueries : []).map((q: unknown) => String(q).trim().slice(0, 60)).filter(Boolean).slice(0, 2);
  const list = (v: unknown, n: number, len: number) => (Array.isArray(v) ? v : []).map((x) => String(x ?? "").trim().slice(0, len)).filter((x) => x.length > 2).slice(0, n);
  const intent = String(parsed.intent ?? "").trim().slice(0, 60) || null;
  console.info(`[research] "${topic.slice(0, 60)}": ${found} bilgi bulundu, ${facts.length} doğrulandı, ${calls} tur`);
  return { facts, youtube, imageQueries, coverage: list(parsed.coverage, 8, 120), questions: list(parsed.questions, 6, 160), intent, model: r.model, calls, found, verified: facts.length };
}

/** Araştırma sonucunu yazı talimatına çevirir. */
export function researchBrief(r: ResearchResult | null, language = "tr"): string {
  if (!r) return "";
  const parts: string[] = [];
  if (r.intent) parts.push(`SEARCH INTENT: ${r.intent}. Shape the article for this intent (e.g. steps for how-to, a comparison table for comparison, clear options and criteria for commercial).`);
  if (r.coverage.length) parts.push(`TOPIC COVERAGE — the top-ranking pages and AI answers all cover these subtopics; make sure the article covers each one (as a section or within one), adding something more useful than they do:\n${r.coverage.map((c) => `- ${c}`).join("\n")}`);
  if (r.questions.length) parts.push(`QUESTIONS PEOPLE REALLY ASK — answer them in the body or FAQ (prefer these over invented FAQ questions):\n${r.questions.map((q) => `- ${q}`).join("\n")}`);
  if (r.facts.length) parts.push(sourcesBrief(r, language));
  return parts.join("\n\n");
}

function sourcesBrief(r: ResearchResult, language: string): string {
  const tr = language === "tr";
  const lines = r.facts
    .map((f) =>
      f.via
        ? `- ${f.fact} — produced by ${f.origin}, found on ${f.via} (${f.url}). SECONDARY: cite it as "${f.origin}${tr ? " verilerine göre (aktaran: " : " data (via "}[${f.via}](${f.url}))", never as if ${f.via} were the original.`
        : `- ${f.fact} — ${f.source || hostOf(f.url)} (${f.url})`
    )
    .join("\n");
  return `VERIFIED SOURCES (found by web search; each was checked to appear on its page). Use EVERY one of these facts at least once in the most relevant section — a cited fact is what makes AI engines quote the article — citing each inline as a markdown link to its URL, e.g. "...%38 arttı ([${tr ? "kaynak" : "source"}](URL))". These are the ONLY statistics you may state; do not invent other numbers:\n${lines}`;
}

export interface OpenverseImage {
  url: string;
  title: string;
  creator: string;
  license: string;
  landing: string;
}

/** Openverse (WordPress'in açık lisanslı medya arşivi) — ücretsiz, API anahtarı gerektirmez. */
export async function findImages(queries: string[], want = 2): Promise<OpenverseImage[]> {
  const out: OpenverseImage[] = [];
  const seen = new Set<string>();
  for (const q of queries.filter(Boolean).slice(0, 3)) {
    if (out.length >= want) break;
    try {
      const r = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=8&license_type=commercial&mature=false`, {
        headers: { "User-Agent": "EpicsemBot/1.0 (+https://epicsem.com)" },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) continue;
      const j = await r.json();
      for (const x of j.results ?? []) {
        if (out.length >= want) break;
        const w = Number(x.width ?? 0);
        if (!x.url || seen.has(x.url) || (w && w < 700) || !/^https:\/\//.test(x.url)) continue;
        // Alakasız sonuçları ele: başlık/etiketler sorgudaki kelimelerden en az birini içermeli.
        const words = q.toLowerCase().split(/\s+/).filter((s) => s.length > 3);
        const hay = `${x.title ?? ""} ${(x.tags ?? []).map((g: any) => g?.name ?? "").join(" ")}`.toLowerCase();
        if (words.length && !words.some((wd) => hay.includes(wd))) continue;
        if (/\b(ai[- ]generated|example of|screenshot|diagram|logo)\b/i.test(String(x.title ?? ""))) continue;
        seen.add(x.url);
        out.push({
          url: x.url,
          title: String(x.title ?? q).slice(0, 120),
          creator: String(x.creator ?? "").slice(0, 80),
          license: `${String(x.license ?? "").toUpperCase()}${x.license_version ? ` ${x.license_version}` : ""}`.trim(),
          landing: String(x.foreign_landing_url ?? x.url),
        });
      }
    } catch {
      /* sıradaki sorgu */
    }
  }
  return out;
}

/** Görselleri 2. ve 4. ana bölümün ilk paragrafından sonra, videoyu 3. bölümün sonuna yerleştirir. SSS'ye dokunmaz. */
export function insertMedia(markdown: string, media: { images?: OpenverseImage[]; youtube?: { title: string; url: string } | null; alt?: string; language?: string }): string {
  const tr = (media.language ?? "tr") === "tr";
  const lines = markdown.split("\n");
  const h2: number[] = [];
  lines.forEach((l, i) => {
    if (/^##\s/.test(l) && !/^##\s+(sık sorulan|sss|faq|frequently asked|içindekiler|table of contents)/i.test(l)) h2.push(i);
  });
  if (!h2.length) return markdown;
  const inserts: { at: number; text: string }[] = [];
  // Bölüm başlığından sonraki ilk dolu paragrafın bitişi
  const afterFirstPara = (start: number) => {
    let i = start + 1;
    while (i < lines.length && !lines[i].trim()) i++;
    while (i < lines.length && lines[i].trim() && !/^#/.test(lines[i])) i++;
    return i;
  };
  const sectionEnd = (k: number) => (k + 1 < h2.length ? h2[k + 1] : (() => {
    const faq = lines.findIndex((l, i) => i > h2[k] && /^##\s+(sık sorulan|sss|faq|frequently asked)/i.test(l));
    return faq > 0 ? faq : lines.length;
  })());
  (media.images ?? []).forEach((img, n) => {
    const k = [1, 3, 0][n];
    if (k === undefined || k >= h2.length) return;
    const heading = lines[h2[k]].replace(/^##\s+/, "").replace(/[*_`]/g, "");
    const alt = (media.alt ? `${heading} – ${media.alt}` : heading).replace(/[\[\]]/g, "").slice(0, 125);
    const credit = `*${tr ? "Görsel" : "Image"}: ${img.creator ? `${img.creator}, ` : ""}${img.license || "CC"} · [Openverse](${img.landing})*`;
    inserts.push({ at: afterFirstPara(h2[k]), text: `\n![${alt}](${img.url})\n${credit}\n` });
  });
  if (media.youtube) {
    const k = Math.min(2, h2.length - 1);
    inserts.push({ at: sectionEnd(k), text: `\n**${tr ? "İlgili video" : "Related video"}:** ${media.youtube.title.replace(/[*_]/g, "")}\n\n${media.youtube.url}\n` });
  }
  inserts.sort((a, b) => b.at - a.at).forEach((x) => lines.splice(x.at, 0, x.text));
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

/** İç link adayları: önce son tarama, yoksa sitemap.xml (başlık URL'den türetilir). */
export async function sitePagesForLinks(userId: number, site: string, max = 40): Promise<{ title: string; url: string }[]> {
  const crawl = (await getLatestCrawlPages(userId, site).catch(() => []))
    .filter((p) => p.title || p.h1)
    .map((p) => ({ title: String(p.title || p.h1), url: p.url }));
  if (crawl.length >= 5) return crawl.slice(0, max);
  const origin = `https://${site.replace(/^https?:\/\//i, "").replace(/\/.*$/, "")}`;
  const locs = async (u: string) => {
    try {
      const r = await safeFetch(u, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "EpicsemBot/1.0" } });
      if (!r.ok) return [] as string[];
      return Array.from((await r.text()).matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)/gi)).map((m) => m[1]);
    } catch {
      return [] as string[];
    }
  };
  let urls = await locs(`${origin}/sitemap.xml`);
  if (urls.some((u) => /\.xml(\?|$)/i.test(u))) {
    const child = urls.filter((u) => /post|page|blog|sayfa|yazi/i.test(u)).slice(0, 2);
    urls = (await Promise.all((child.length ? child : urls.slice(0, 2)).map(locs))).flat();
  }
  const host = new URL(origin).hostname.replace(/^www\./i, "");
  const fromSitemap = urls
    .filter((u) => {
      try {
        const x = new URL(u);
        return x.hostname.replace(/^www\./i, "") === host && x.pathname.length > 1 && !/\.(xml|jpg|png|pdf)$/i.test(x.pathname);
      } catch {
        return false;
      }
    })
    .slice(0, 200)
    .map((u) => {
      const seg = decodeURIComponent(new URL(u).pathname.replace(/\/$/, "").split("/").pop() ?? "");
      return { title: seg.replace(/[-_]+/g, " ").replace(/\.\w+$/, "").trim(), url: u };
    })
    .filter((p) => p.title.length > 3);
  return [...crawl, ...fromSitemap].slice(0, max);
}

/** İç link talimatı (sayfa yoksa boş). */
export function internalLinkBrief(pages: { title: string; url: string }[]): string {
  if (!pages.length) return "";
  return `Add 2-5 internal links as natural in-sentence markdown links, ONLY to relevant pages from this list (exact URLs; skip any that don't fit, never link the same URL twice):\n${pages.map((p) => `- ${p.title}: ${p.url}`).join("\n")}`;
}

// ---- link doğrulama (karar mantığı lib/link-check.ts'te, burada yalnızca ağ) ----

/** 404/410 ya da var olmayan alan adı → kesin bozuk. Engelleme (403/429), zaman aşımı → bilinmiyor, kalır. */
async function isBroken(url: string): Promise<boolean> {
  try {
    const r = await safeFetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; EpicsemLinkCheck/1.0)" } }, { timeoutMs: 8000, maxBytes: 3_000_000 });
    return r.status === 404 || r.status === 410;
  } catch (e) {
    return e instanceof Error && /Alan adı bulunamadı/.test(e.message);
  }
}

export async function checkLinks(md: string, opts: { known: string[]; labels?: Record<string, string>; ownHost?: string; language?: string }): Promise<{ markdown: string; replaced: number; removed: number }> {
  let out = md;
  let replaced = 0;
  let removed = 0;
  const plan = planLinks(md, opts.known).slice(0, 30);
  const broken = await Promise.all(plan.map((p) => (p.action === "probe" ? isBroken(p.url) : Promise.resolve(false))));
  plan.forEach((p, i) => {
    if (p.action === "replace" && p.to) {
      out = relink(out, p.url, p.to);
      replaced++;
    } else if (broken[i]) {
      out = unlink(out, p.url);
      removed++;
    }
  });
  return { markdown: appendSources(out, opts.ownHost ?? "", opts.language, opts.labels), replaced, removed };
}

// ---- rakip karşılaştırma tablosu ----

/** Okurun "hangisini seçeyim" diye sorduğu konular: karşılaştırma tablosu burada işe yarar. */
export function wantsComparison(topic: string, intent?: string | null): boolean {
  return /nasıl seçilir|en iyi|hangisi|karşılaştır|alternatif|\bvs\.?\b|\bmi\b.*\bmi\b|fiyat|best|compar|alternative|versus/i.test(topic) || /compar|commercial/i.test(intent ?? "");
}

/**
 * Marka + rakiplerin KENDİ sitelerinden (ana sayfa ve varsa fiyat sayfası) okunan metinle karşılaştırma
 * tablosu talimatı. Sitede yazmayan hücre "—" kalır; tablo altına tarih ve kaynak linkleri gelir.
 */
export async function comparisonBrief(brand: { name: string; domain: string }, competitors: { name: string; domain: string }[], language = "tr"): Promise<string> {
  const firms = [brand, ...competitors.filter((c) => c.name && c.domain).slice(0, 3)];
  if (firms.length < 2) return "";
  const read = async (u: string) => {
    try {
      const p = await fetchPageSummary(u);
      return p.bodyText ? p : null;
    } catch {
      return null;
    }
  };
  // Fiyat sayfası: ana sayfadaki "Fiyatlar / Paketler" linki (adres siteden siteye değişiyor: /on-muhasebe-fiyatlari, /fiyat-listesi/…).
  const pricingUrl = async (domain: string): Promise<string | null> => {
    try {
      const html = await (await safeFetch(`https://${domain}`, { headers: { "User-Agent": "Mozilla/5.0 (compatible; EpicsemBot/1.0)" } }, { timeoutMs: 12_000 })).text();
      const $ = cheerio.load(html);
      for (const a of $("a[href]").toArray()) {
        const href = $(a).attr("href") ?? "";
        if (/fiyat|pricing|paket|ucret|ücret/i.test(`${href} ${$(a).text()}`)) {
          const u = new URL(href, `https://${domain}`);
          if (u.hostname.replace(/^www\./i, "") === domain.replace(/^www\./i, "")) return u.toString();
        }
      }
    } catch {
      /* ana sayfa okunamadı */
    }
    return null;
  };
  // Uzun sayfalarda fiyatlar kırpılan kısımda kalmasın: para birimi geçen bölümler önce.
  const priceText = (t: string) => {
    const parts: string[] = [];
    for (const m of t.matchAll(/[^.]{0,120}(?:₺|\bTL\b|\$|€)[^.]{0,80}/g)) {
      if (parts.join(" ").length > 1500) break;
      if (!parts.includes(m[0].trim())) parts.push(m[0].trim());
    }
    return parts.length ? parts.join(" … ") : t.slice(0, 1500);
  };
  const pages = await Promise.all(
    firms.map(async (f) => {
      const [home, pUrl] = await Promise.all([read(`https://${f.domain}`), pricingUrl(f.domain)]);
      let price = pUrl ? await read(pUrl) : null;
      // Menüsü JavaScript ile gelen sitelerde link HTML'de yok: yaygın adresleri dene.
      for (const path of ["/fiyatlar", "/fiyatlandirma", "/fiyat-listesi", "/paketler", "/pricing"]) {
        if (price) break;
        price = await read(`https://${f.domain}${path}`);
      }
      return { f, home, price };
    })
  );
  const usable = pages.filter((p) => p.home || p.price);
  if (usable.length < 2) return "";
  const date = new Date().toLocaleDateString(language === "tr" ? "tr-TR" : "en-US", { month: "long", year: "numeric" });
  const blocks = usable.map(({ f, home, price }) =>
    [`### ${f.name} (${f.domain})`, home ? `Home page (${home.url}): ${home.bodyText.slice(0, 1200)}` : "", price ? `Pricing page (${price.url}): ${priceText(price.bodyText)}` : ""].filter(Boolean).join("\n")
  );
  const links = usable.map(({ f, home, price }) => `[${f.name}](${(price ?? home)!.url})`).join(", ");
  return `COMPARISON TABLE (required for this topic): in the section where the reader weighs the options, add ONE markdown table comparing ${usable.map((u) => u.f.name).join(", ")} on 4–6 criteria that matter for this topic (features, free trial, starting price…). First column = criterion, then one column per company with ${brand.name} first.
- Fill every cell ONLY from that company's own page text below. If the text does not state it, write "—". Never guess a price, plan name or feature; copy prices exactly as written (with currency and period).
- Be fair: do not mark a competitor worse than its page shows.
- Directly under the table add this single italic line: "*${language === "tr" ? `Bilgiler ${date} itibarıyla firmaların kendi sitelerinden alınmıştır` : `Information taken from each company's own website as of ${date}`}: ${links}.*"
COMPANY PAGES:
${blocks.join("\n\n")}`;
}
