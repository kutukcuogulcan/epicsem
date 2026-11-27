import * as cheerio from "cheerio";
import { trLower } from "./text-match.ts";

/**
 * Rakip sayfası ↔ kendi sayfan (AI yok): AI'ın kaynak gösterdiği rakip sayfasının yapısı (başlıklar, SSS,
 * şema, tablo, kelime sayısı) ve rakipte olup senin sayfanda karşılığı olmayan başlıklar.
 * Sayfadaki bilgi uydurulmaz: yalnızca iki sayfanın HTML'inde gerçekten olan gösterilir.
 */

export interface PageOutline {
  url: string;
  title: string;
  h1: string;
  headings: { level: number; text: string }[];
  words: number;
  faqs: number;
  schemaTypes: string[];
  tables: number;
  lists: number;
  images: number;
  text: string;
}

export function outline(html: string, url: string): PageOutline {
  const $ = cheerio.load(html);
  const schemaTypes = new Set<string>();
  let faqs = 0;
  $('script[type="application/ld+json"]').each((_, e) => {
    const walk = (o: unknown): void => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (!o || typeof o !== "object") return;
      const t = (o as Record<string, unknown>)["@type"];
      for (const x of [t].flat()) if (typeof x === "string") schemaTypes.add(x);
      if (t === "Question") faqs++;
      Object.values(o).forEach(walk);
    };
    try {
      walk(JSON.parse($(e).text()));
    } catch {
      /* bozuk JSON-LD atlanır */
    }
  });
  $("script, style, noscript, nav, footer, header").remove();
  const headings: PageOutline["headings"] = [];
  const seen = new Set<string>();
  $("h1, h2, h3").each((_, e) => {
    const text = $(e).text().replace(/[\u200b-\u200d\ufeff]/g, "").replace(/\s+/g, " ").trim(); // görünmez boşluklar (Purina H1'i)
    const key = trLower(text);
    if (!text || text.length > 140 || seen.has(key)) return;
    seen.add(key);
    headings.push({ level: Number(e.tagName[1]), text });
  });
  // Şemada SSS yoksa soru biçimli başlıklar sayılır
  if (!faqs) faqs = headings.filter((h) => h.level > 1 && h.text.endsWith("?")).length;
  const main = $("main").length ? $("main") : $("body");
  const text = main.text().replace(/\s+/g, " ").trim();
  return {
    url,
    title: $("title").first().text().trim(),
    h1: headings.find((h) => h.level === 1)?.text ?? "",
    headings,
    words: text ? text.split(" ").length : 0,
    faqs,
    schemaTypes: [...schemaTypes].sort(),
    tables: main.find("table").length,
    lists: main.find("ul, ol").length,
    images: main.find("img").length,
    text,
  };
}

const tokens = (s: string) =>
  trLower(s)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4);

/** Başlığın kelimelerinin en az yarısı sayfada geçiyor mu ("Analitik Bileşenler" ↔ "Analitik Katkılar"). Türkçe ekler için ilk 5 harf aranır (böbrek → böbreği). */
export function covered(heading: string, text: string): boolean {
  const t = tokens(heading);
  if (!t.length) return true;
  const low = trLower(text);
  return t.filter((w) => low.includes(w.slice(0, 5))).length * 2 >= t.length;
}

export function missingHeadings(rival: PageOutline, own: PageOutline): string[] {
  const ownText = `${own.title} ${own.headings.map((h) => h.text).join(" ")} ${own.text}`;
  return rival.headings.filter((h) => h.level > 1 && !covered(h.text, ownText)).map((h) => h.text);
}

/** Rakip sayfasına karşılık gelebilecek kendi sayfaların: adres ve rakip H1/başlık kelimeleri örtüşmesi. */
export function suggestOwnUrls(rival: Pick<PageOutline, "url" | "h1" | "title" | "headings">, ownUrls: string[], max = 5): string[] {
  // Adres ve H1 yetmeyebilir (royalcanin "cats" ↔ purina "kedi"); ilk başlıklar dili ve kategoriyi verir.
  const top = rival.headings.slice(0, 4).map((h) => h.text).join(" ");
  const want = new Set([...tokens(new URL(rival.url).pathname.replace(/[-_/]/g, " ")), ...tokens(rival.h1), ...tokens(rival.title), ...tokens(top)].map((w) => w.slice(0, 5)));
  return ownUrls
    .filter((u) => !/\.(pdf|docx?|xlsx?|jpe?g|png|zip)(\?|$)/i.test(u)) // yalnızca sayfalar
    .map((u) => {
      let path = u;
      try {
        path = decodeURIComponent(new URL(u).pathname);
      } catch {
        /* ham adres */
      }
      const hit = tokens(path.replace(/[-_/]/g, " ")).filter((w) => want.has(w.slice(0, 5))).length;
      return { u, hit };
    })
    .filter((x) => x.hit > 0)
    .sort((a, b) => b.hit - a.hit || a.u.length - b.u.length)
    .slice(0, max)
    .map((x) => x.u);
}
