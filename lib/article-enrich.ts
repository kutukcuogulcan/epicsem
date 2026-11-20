import { runWebSearchPrompt } from "./competitor-discovery";
import { extractJsonObject } from "./llm-json";
import { statusOf } from "./audit-extra";
import { getLatestCrawlPages } from "./db";
import { safeFetch } from "@/lib/safe-fetch";

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

/** Web aramasıyla kaynaklı bilgiler + video. Web aramalı sağlayıcı yoksa null (yazı kaynaksız yazılır). */
export async function researchTopic(topic: string, language = "tr"): Promise<ResearchResult | null> {
  const tr = language === "tr";
  const prompt = `SEARCH THE WEB. Topic: "${topic}"${tr ? " (Turkish audience; prefer Turkish or international authoritative sources)" : ""}.
Find:
1. 3–5 specific, recent facts or statistics about this topic, each from an authoritative source page (official stats, research, reputable publications). Use the exact page URL where the fact appears.
2. ONE relevant, high-quality YouTube video that explains this topic (a real youtube.com/watch URL you actually found).
3. What the top-ranking pages and AI answers for this topic cover: 5–8 short subtopics they all include (so a new article is not missing anything), the 4–6 questions people really ask about it (Google "People also ask", forums), and the search intent in 2–4 words (e.g. "informational how-to", "commercial comparison").
4. Two short ENGLISH stock-photo search queries (2–3 concrete, visual words, e.g. "laptop analytics dashboard", "marketing team meeting") that would illustrate this topic. Avoid abstract terms and acronyms.
Never invent a URL or a number. If unsure, leave it out.
Return ONLY JSON: {"facts":[{"fact":"one sentence with the number","source":"publisher name","url":"https://..."}],"youtube":{"title":"","url":"https://www.youtube.com/watch?v=..."},"imageQueries":["",""],"coverage":["subtopic"],"questions":["question?"],"intent":""}`;
  const r = await runWebSearchPrompt(prompt);
  if (!r) return null;
  let parsed: Record<string, any>;
  try {
    parsed = extractJsonObject(r.text);
  } catch {
    return null;
  }
  const raw: ResearchFact[] = (Array.isArray(parsed.facts) ? parsed.facts : [])
    .map((f: any) => ({ fact: String(f?.fact ?? "").trim().slice(0, 300), source: String(f?.source ?? "").trim().slice(0, 80), url: String(f?.url ?? "").trim() }))
    .filter((f: ResearchFact) => f.fact && publicUrl(f.url))
    .slice(0, 6);
  // Kaynak sayfaları gerçekten açılıyor mu? (403/405 bazı siteler botlara kapalı; onları kabul et)
  const codes = await Promise.all(raw.map((f) => statusOf(f.url, 7000)));
  const facts = raw.filter((_, i) => (codes[i] >= 200 && codes[i] < 400) || codes[i] === 403).slice(0, 5);
  const ytUrl = String(parsed.youtube?.url ?? "");
  const youtube = ytUrl ? await verifyYoutube(ytUrl) : null;
  const imageQueries = (Array.isArray(parsed.imageQueries) ? parsed.imageQueries : []).map((q: unknown) => String(q).trim().slice(0, 60)).filter(Boolean).slice(0, 2);
  const list = (v: unknown, n: number, len: number) => (Array.isArray(v) ? v : []).map((x) => String(x ?? "").trim().slice(0, len)).filter((x) => x.length > 2).slice(0, n);
  const intent = String(parsed.intent ?? "").trim().slice(0, 60) || null;
  return { facts, youtube, imageQueries, coverage: list(parsed.coverage, 8, 120), questions: list(parsed.questions, 6, 160), intent, model: r.model };
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
  const lines = r.facts.map((f) => `- ${f.fact} — ${f.source || new URL(f.url).hostname} (${f.url})`).join("\n");
  return `VERIFIED SOURCES (found by web search and checked). Use 2–4 of these facts where they fit, citing each inline as a markdown link to its URL, e.g. "...%38 arttı ([${language === "tr" ? "kaynak" : "source"}](URL))". These are the ONLY statistics you may state; do not invent other numbers:\n${lines}`;
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
  const origin = `https://${site.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}`;
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
  const host = new URL(origin).hostname.replace(/^www\./, "");
  const fromSitemap = urls
    .filter((u) => {
      try {
        const x = new URL(u);
        return x.hostname.replace(/^www\./, "") === host && x.pathname.length > 1 && !/\.(xml|jpg|png|pdf)$/i.test(x.pathname);
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
