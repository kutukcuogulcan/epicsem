/**
 * Alıntılanabilirlik puanı — bir yazının AI cevap motorları (ChatGPT, Perplexity, Gemini,
 * Google AI Overviews) tarafından alıntılanmaya ne kadar uygun olduğunu AI KULLANMADAN ölçer.
 *
 * Yöntemler, Princeton "GEO: Generative Engine Optimization" çalışmasına (Aggarwal vd., KDD 2024)
 * ve açık kaynak GEO Optimizer projesinin (Auriti Labs, MIT lisansı — github.com/Auriti-Labs/
 * geo-optimizer-skill) alıntılanabilirlik yöntemlerine dayanır; Türkçe için uyarlanmıştır.
 * Puanlar sezgiseldir: "AI kesin alıntılar" anlamına gelmez, iyileştirme yönünü gösterir.
 *
 * Hem Markdown (Editör, Autoblog) hem HTML (Site Taraması) girdisiyle çalışır.
 */

export interface CitCheck {
  key: string;
  label: string;
  ok: boolean;
  part?: number;
  hint: string;
  weight: number;
}

export interface CitabilityResult {
  score: number;
  grade: "Çok iyi" | "İyi" | "Orta" | "Zayıf";
  checks: CitCheck[];
  /** En çok puan kaybettiren ilk 3 kontrol (kısa etiket). */
  top: string[];
}

export interface CitInput {
  headings: { level: number; text: string }[];
  /** Her başlıktan sonraki ilk paragraf (başlık sırasıyla; yoksa ""). */
  sectionLeads: { level: number; heading: string; lead: string }[];
  paragraphs: string[];
  lists: number;
  tables: number;
  externalLinks: number;
  text: string;
}

const PRONOUN_START = /^(bu|bunlar|bunu|bunun|şu|o|onlar|ayrıca|ancak|fakat|yani|dolayısıyla|this|these|it|they|also|however|so)\b/i;
const QUESTION_HEAD = /\?\s*$|^(ne|neden|nasıl|hangi|kim|nerede|ne zaman|kaç|niçin|what|how|why|which|when|where|who|can|is|are|does)\b/i;
const ATTRIBUTION = /\b(göre|kaynağına göre|verilerine göre|raporuna göre|araştırmasına göre|araştırma|çalışma|rapor|istatistik|according to|study|survey|report|research|data from)\b/gi;
const STOP = new Set(
  "ve veya ile için gibi bir bu şu da de ki mi mı mu mü ne çok daha en olan olarak ise ama fakat ancak her hem kadar sonra önce göre ya nasıl neden hangi the and for with that this from are was were have has not but you your can will".split(" ")
);

const plain = (s: string) => s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_`#>|]/g, " ");
const wordsOf = (s: string) => plain(s).split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
const sentencesOf = (s: string) => plain(s).split(/(?<=[.!?])\s+/).filter((x) => wordsOf(x).length > 2);

/** Markdown → ortak girdi. */
export function citInputFromMarkdown(md: string): CitInput {
  const lines = md.replace(/\r/g, "").split("\n");
  const headings: CitInput["headings"] = [];
  const sectionLeads: CitInput["sectionLeads"] = [];
  const paragraphs: string[] = [];
  let lists = 0;
  let tables = 0;
  let inList = false;
  let inTable = false;
  let para: string[] = [];
  let pendingHead: { level: number; text: string } | null = null;

  const flush = () => {
    if (!para.length) return;
    const p = para.join(" ").trim();
    para = [];
    if (!p) return;
    paragraphs.push(p);
    if (pendingHead) {
      sectionLeads.push({ level: pendingHead.level, heading: pendingHead.text, lead: p });
      pendingHead = null;
    }
  };
  for (const raw of lines) {
    const l = raw.trim();
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flush();
      if (pendingHead) sectionLeads.push({ level: pendingHead.level, heading: pendingHead.text, lead: "" });
      pendingHead = { level: h[1].length, text: h[2].trim() };
      headings.push(pendingHead);
      inList = inTable = false;
      continue;
    }
    if (/^([-*+]|\d+[.)])\s+/.test(l)) {
      flush();
      if (!inList) lists++;
      inList = true;
      continue;
    }
    if (/^\|.*\|$/.test(l)) {
      flush();
      if (!inTable) tables++;
      inTable = true;
      continue;
    }
    if (!l) {
      flush();
      inList = inTable = false;
      continue;
    }
    if (/^!\[/.test(l)) continue;
    inList = inTable = false;
    para.push(l.replace(/^>\s?/, ""));
  }
  flush();
  if (pendingHead) sectionLeads.push({ level: pendingHead.level, heading: pendingHead.text, lead: "" });
  const externalLinks = (md.match(/\]\(https?:\/\/[^)]+\)/g) ?? []).length;
  return { headings, sectionLeads, paragraphs, lists, tables, externalLinks, text: plain(md) };
}

/** HTML (cheerio kökü) → ortak girdi. $ = cheerio.load(html) sonucu; script/style temizlenmiş olmalı. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function citInputFromHtml($: any, host: string): CitInput {
  const root = $("article").first().length ? $("article").first() : $("main").first().length ? $("main").first() : $("body");
  const headings: CitInput["headings"] = [];
  const sectionLeads: CitInput["sectionLeads"] = [];
  const paragraphs: string[] = [];
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  let pending: { level: number; text: string } | null = null;
  root.find("h1, h2, h3, h4, p").each((_: number, el: any) => {
    const tag = (el.tagName || el.name || "").toLowerCase();
    const t = clean($(el).text());
    if (!t) return;
    if (/^h\d$/.test(tag)) {
      if (pending) sectionLeads.push({ level: pending.level, heading: pending.text, lead: "" });
      pending = { level: Number(tag[1]), text: t };
      headings.push(pending);
    } else {
      if (wordsOf(t).length < 4) return;
      paragraphs.push(t);
      if (pending) {
        sectionLeads.push({ level: pending.level, heading: pending.text, lead: t });
        pending = null;
      }
    }
  });
  if (pending) sectionLeads.push({ level: (pending as { level: number }).level, heading: (pending as { text: string }).text, lead: "" });
  let externalLinks = 0;
  root.find("a[href^='http']").each((_: number, el: any) => {
    try {
      if (!new URL($(el).attr("href")).hostname.endsWith(host)) externalLinks++;
    } catch {
      /* geçersiz */
    }
  });
  return {
    headings,
    sectionLeads,
    paragraphs,
    lists: root.find("ul, ol").filter((_: number, el: any) => $(el).find("li").length >= 2 && !$(el).closest("nav, header, footer").length).length,
    tables: root.find("table").length,
    externalLinks,
    text: clean(root.text()),
  };
}

export function scoreCitability(input: CitInput, opts: { keyword?: string; now?: Date } = {}): CitabilityResult {
  const { headings, sectionLeads, paragraphs, text } = input;
  const words = wordsOf(text);
  const wc = words.length;
  const h2s = sectionLeads.filter((s) => s.level === 2);
  const isFaqHead = (t: string) => /(sss|sık sorulan|faq|frequently asked)/i.test(t);
  const sections = (h2s.length ? h2s : sectionLeads.filter((s) => s.level >= 2)).filter((s) => !(isFaqHead(s.heading) && !s.lead));
  const year = (opts.now ?? new Date()).getFullYear();

  // 1) Cevap-önce bölümler
  const answerFirst = sections.filter((s) => {
    const first = sentencesOf(s.lead)[0] ?? "";
    const n = wordsOf(first).length;
    return n >= 6 && n <= 40 && !PRONOUN_START.test(first.trim());
  }).length;
  // 2) Giriş özeti / tanım
  const lead = paragraphs[0] ?? "";
  const leadWords = wordsOf(lead).length;
  const hasDef = /\b(nedir|demektir|olarak tanımlanır|anlamına gelir|is a|is an|is the|refers to|means)\b|(dır|dir|dur|dür|tır|tir|tur|tür)[.,]/i.test(plain(lead));
  // 3) Sayı ve istatistik
  const stats = (plain(text).match(/(%\s?\d+|\d+([.,]\d+)?\s?(%|tl|₺|\$|€|kg|gr|cm|mm|m2|m²|km|gün|saat|dakika|ay|yıl|adet|kişi|kat|milyon|milyar|bin))|\b(19|20)\d{2}\b/gi) ?? []).length;
  // 4) Kaynak gösterme
  const attributions = (plain(text).match(ATTRIBUTION) ?? []).length;
  const citeScore = Math.min(1, input.externalLinks / 2 + attributions / 4);
  // 5) Alıntı
  const quotes = (text.match(/[“"«][^”"»]{20,300}[”"»]/g) ?? []).length;
  // 6) Soru biçimli başlıklar
  const qHeads = headings.filter((h) => h.level >= 2 && QUESTION_HEAD.test(h.text.trim())).length;
  // 7) Biçim çeşitliliği
  const formatPart = input.lists && input.tables ? 1 : input.lists || input.tables ? 0.7 : 0;
  // 8) SSS
  const hasFaq = headings.some((h) => /(sss|sık sorulan|soru|faq|frequently asked)/i.test(h.text));
  // 9) Bağımsız, alıntılanabilir paragraflar
  const goodParas = paragraphs.filter((p) => {
    const n = wordsOf(p).length;
    return n >= 12 && n <= 90 && !PRONOUN_START.test(p.trim());
  }).length;
  const paraRatio = paragraphs.length ? goodParas / paragraphs.length : 0;
  // 10) Okunabilirlik
  const sents = sentencesOf(paragraphs.join(" "));
  const avgSentence = sents.length ? sents.reduce((a, s) => a + wordsOf(s).length, 0) / sents.length : 0;
  // 11) Anahtar kelime doldurma
  const freq = new Map<string, number>();
  for (const w of words) {
    const k = w.toLocaleLowerCase("tr").replace(/[^\p{L}\p{N}]/gu, "");
    if (k.length < 4 || STOP.has(k)) continue;
    freq.set(k, (freq.get(k) ?? 0) + 1);
  }
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
  const topRatio = top && wc ? top[1] / wc : 0;
  const stuffed = wc > 150 && topRatio > 0.035;
  // 12) Derinlik
  const depthPart = Math.min(1, wc / 700);
  // 13) Güncellik
  const fresh = new RegExp(`\\b(${year}|${year - 1})\\b`).test(text);
  // 14) Doldurulmamış yer tutucular
  const placeholders = (text.match(/\[NEEDS:[^\]]*\]/g) ?? []).length;

  const checks: CitCheck[] = [
    {
      key: "answer",
      label: `Cevap-önce bölümler (${answerFirst}/${sections.length})`,
      ok: sections.length > 0 && answerFirst / sections.length >= 0.7,
      part: sections.length ? answerFirst / sections.length : 0,
      hint: "Her ara başlığın altındaki ilk cümle soruyu doğrudan cevaplasın (6–40 kelime, 'Bu…' gibi zamirle başlamasın). AI motorları en çok bu cümleyi alıntılar.",
      weight: 12,
    },
    {
      key: "lead",
      label: "Giriş kısa bir cevap/tanım veriyor",
      ok: leadWords >= 20 && leadWords <= 90 && (hasDef || (!!opts.keyword && plain(lead).toLocaleLowerCase("tr").includes(opts.keyword.toLocaleLowerCase("tr")))),
      part: leadWords >= 20 && leadWords <= 90 ? (hasDef ? 1 : 0.6) : 0.2,
      hint: "İlk paragraf 2–3 cümlede konuyu tanımlasın ve soruyu cevaplasın ('X, … olan bir …dır.'). Bu 'cevap kapsülü' AI özetlerine en sık giren kısımdır.",
      weight: 10,
    },
    {
      key: "stats",
      label: `Somut sayı ve veriler (${stats})`,
      ok: stats >= 5,
      part: Math.min(1, stats / 5),
      hint: "Yüzde, fiyat aralığı, süre, ölçü, yıl gibi doğrulanabilir sayılar ekleyin (uydurmayın). Araştırmada istatistik eklemek görünürlüğü ortalama ~%40 artırdı.",
      weight: 10,
    },
    {
      key: "cite",
      label: `Kaynak gösterme (${input.externalLinks} dış link, ${attributions} atıf)`,
      ok: citeScore >= 1,
      part: citeScore,
      hint: "İddiaları güvenilir kaynaklara bağlayın: '… araştırmasına göre', resmi siteye/rapora link. Kaynak gösterme en etkili GEO yöntemlerinden biri.",
      weight: 10,
    },
    {
      key: "chunks",
      label: `Bağımsız, alıntılanabilir paragraflar (%${Math.round(paraRatio * 100)})`,
      ok: paraRatio >= 0.7,
      part: Math.min(1, paraRatio / 0.7),
      hint: "Her paragraf 2–4 cümle olsun ve tek başına anlaşılsın; 'Bu yüzden', 'Ayrıca' gibi önceki paragrafa bağlı açılışlardan kaçının. AI motorları metni parça parça alır.",
      weight: 10,
    },
    {
      key: "format",
      label: `Liste / tablo (${input.lists} liste, ${input.tables} tablo)`,
      ok: formatPart >= 0.7,
      part: formatPart,
      hint: "Adımları numaralı listeyle, karşılaştırmaları tabloyla verin — yapılandırılmış bilgi daha kolay alıntılanır.",
      weight: 8,
    },
    {
      key: "questions",
      label: `Soru biçimli başlıklar (${qHeads})`,
      ok: qHeads >= 2,
      part: Math.min(1, qHeads / 2),
      hint: "Başlıkları insanların AI'a sorduğu gibi yazın: 'X nasıl seçilir?', 'X ile Y farkı nedir?'.",
      weight: 6,
    },
    {
      key: "faq",
      label: "SSS bölümü",
      ok: hasFaq,
      hint: "Sona 3–5 soruluk bir 'Sık sorulan sorular' bölümü ekleyin; kısa, net cevaplarla.",
      weight: 6,
    },
    {
      key: "readability",
      label: `Okunabilirlik (cümle ort. ${Math.round(avgSentence)} kelime)`,
      ok: avgSentence > 0 && avgSentence <= 22,
      part: avgSentence === 0 ? 0 : avgSentence <= 22 ? 1 : Math.max(0, 1 - (avgSentence - 22) / 15),
      hint: "Cümleleri ortalama 20 kelimenin altında tutun; teknik terimleri ilk geçtiği yerde açıklayın.",
      weight: 6,
    },
    {
      key: "quotes",
      label: `Alıntı / uzman görüşü (${quotes})`,
      ok: quotes >= 1,
      hint: "Bir uzmandan, müşteriden ya da resmi kaynaktan tırnak içinde kısa bir alıntı ekleyin (gerçek olmalı).",
      weight: 4,
    },
    {
      key: "depth",
      label: `Kapsam (${wc} kelime)`,
      ok: wc >= 700,
      part: depthPart,
      hint: "Konuyu eksiksiz cevaplayın; bilgilendirici yazılarda 700+ kelime hedefleyin.",
      weight: 6,
    },
    {
      key: "fresh",
      label: "Güncellik sinyali",
      ok: fresh,
      hint: `Metinde güncel yılı (${year}) ya da son güncelleme tarihini belirtin; AI motorları güncel kaynakları tercih eder.`,
      weight: 4,
    },
    {
      key: "stuffing",
      label: stuffed ? `Kelime tekrarı yüksek ("${top?.[0]}" %${(topRatio * 100).toFixed(1)})` : "Doğal kelime kullanımı",
      ok: !stuffed,
      hint: "Aynı kelimeyi aşırı tekrarlamayın; eş anlamlılar kullanın. Anahtar kelime doldurma araştırmada görünürlüğü düşürdü.",
      weight: 4,
    },
    {
      key: "placeholders",
      label: placeholders ? `Doldurulmamış alan (${placeholders} adet [NEEDS])` : "Doldurulmamış alan yok",
      ok: placeholders === 0,
      hint: "[NEEDS: …] yazan yerleri gerçek bilgiyle doldurun; eksik bilgi güveni düşürür.",
      weight: 4,
    },
  ];

  const total = checks.reduce((a, c) => a + c.weight, 0);
  const got = checks.reduce((a, c) => a + c.weight * Math.max(0, Math.min(1, c.part ?? (c.ok ? 1 : 0))), 0);
  // Çok kısa metinler tek tek kontrolleri geçse bile alıntılanacak kadar içerik sunmaz.
  const thinFactor = wc >= 300 ? 1 : Math.max(0.4, wc / 300);
  const score = Math.round((got / total) * 100 * thinFactor);
  const grade = score >= 80 ? "Çok iyi" : score >= 65 ? "İyi" : score >= 45 ? "Orta" : "Zayıf";
  const topIssues = checks
    .filter((c) => !c.ok)
    .sort((a, b) => b.weight * (1 - (b.part ?? 0)) - a.weight * (1 - (a.part ?? 0)))
    .slice(0, 3)
    .map((c) => c.label.replace(/\s*\(.*\)$/, ""));
  return { score, grade, checks, top: topIssues };
}

export function citabilityOfMarkdown(md: string, keyword?: string): CitabilityResult {
  return scoreCitability(citInputFromMarkdown(md), { keyword });
}
