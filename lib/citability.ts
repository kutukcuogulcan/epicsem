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
 *
 * Ek içerik kontrolleri (belirsiz açılış, özet kutusu, uzun bölüm, kaynaksız istatistik,
 * açılmamış kısaltma, belirsiz başlık, uzun giriş, SSS derinliği) geo-lint projesinin
 * (IJONIS, MIT lisansı — github.com/IJONIS/geo-lint) kural fikirlerinden uyarlanmıştır.
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
  /** H2 bölümleri: kelime sayısı ve içindeki H3 sayısı (geo-lint kontrolleri için). */
  h2Sections?: { heading: string; words: number; h3: number }[];
  /** İlk H2'den önceki giriş metninin kelime sayısı. */
  introWords?: number;
}

const PRONOUN_START = /^(bu|bunlar|bunu|bunun|şu|o|onlar|ayrıca|ancak|fakat|yani|dolayısıyla|this|these|it|they|also|however|so)\b/i;
const QUESTION_HEAD = /\?\s*$|^(ne|neden|nasıl|hangi|kim|nerede|ne zaman|kaç|niçin|what|how|why|which|when|where|who|can|is|are|does)\b/i;
const ATTRIBUTION = /\b(göre|kaynağına göre|verilerine göre|raporuna göre|araştırmasına göre|araştırma|çalışma|rapor|istatistik|according to|study|survey|report|research|data from)\b/gi;
const VAGUE_OPEN = /^(bu (yazıda|yazımızda|makalede|içerikte|rehberde)|günümüzde|hepimizin bildiği|son yıllarda|merhaba|herkese merhaba|in this (article|post|guide)|in today's|nowadays|welcome to)/i;
const SUMMARY_HEAD = /(özet|kısaca|önemli noktalar|öne çıkanlar|tl;?dr|key takeaways|summary|in short|at a glance)/i;
const VAGUE_HEAD = /^(giriş|sonuç|özet sonuç|genel bakış|genel bilgi|detaylar|diğer|bilgi|hakkında|açıklama|son söz|introduction|conclusion|overview|details|more|other|info)$/i;
const KNOWN_ACRONYMS = new Set(
  "AI SEO GEO AEO URL PDF HTML CSS API ABD AB TL KDV SSS FAQ CEO USB TV PC SMS PDF GPS LED SUV PVC ATM TC IT HR UX UI KPI ROI PR B2B B2C SaaS CRM ERP SSL HTTP HTTPS WWW USA UK EU OK DIY TL;DR GB MB KB TB CPU GPU RAM SSD HDD NATO BM TBMM SGK MEB YKS KPSS ÖSYM PTT".split(" ")
);
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
  const h2Sections: NonNullable<CitInput["h2Sections"]> = [];
  let introWords = 0;
  const addWords = (t: string) => {
    const n = wordsOf(t).length;
    const cur = h2Sections[h2Sections.length - 1];
    if (cur) cur.words += n;
    else introWords += n;
  };

  const flush = () => {
    if (!para.length) return;
    const p = para.join(" ").trim();
    para = [];
    if (!p) return;
    addWords(p);
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
      if (pendingHead.level === 2) h2Sections.push({ heading: pendingHead.text, words: 0, h3: 0 });
      else if (pendingHead.level >= 3 && h2Sections.length) h2Sections[h2Sections.length - 1].h3++;
      inList = inTable = false;
      continue;
    }
    if (/^([-*+]|\d+[.)])\s+/.test(l)) {
      flush();
      addWords(l.replace(/^([-*+]|\d+[.)])\s+/, ""));
      if (!inList) lists++;
      inList = true;
      continue;
    }
    if (/^\|.*\|$/.test(l)) {
      flush();
      if (!/^\|[\s:|-]+\|$/.test(l)) addWords(l);
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
  return { headings, sectionLeads, paragraphs, lists, tables, externalLinks, text: plain(md), h2Sections, introWords };
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
  const h2Sections: NonNullable<CitInput["h2Sections"]> = [];
  let introWords = 0;
  root.find("h1, h2, h3, h4, p, li, td").each((_: number, el: any) => {
    const tag = (el.tagName || el.name || "").toLowerCase();
    const t = clean($(el).text());
    if (!t) return;
    if (tag === "li" || tag === "td") {
      if ($(el).closest("nav, header, footer").length || $(el).find("p").length) return;
      const n = wordsOf(t).length;
      if (h2Sections.length) h2Sections[h2Sections.length - 1].words += n;
      else introWords += n;
      return;
    }
    if (/^h\d$/.test(tag)) {
      const lv = Number(tag[1]);
      if (lv === 2) h2Sections.push({ heading: t, words: 0, h3: 0 });
      else if (lv >= 3 && h2Sections.length) h2Sections[h2Sections.length - 1].h3++;
      if (pending) sectionLeads.push({ level: pending.level, heading: pending.text, lead: "" });
      pending = { level: Number(tag[1]), text: t };
      headings.push(pending);
    } else {
      if ($(el).closest("li, td").length) return;
      const n = wordsOf(t).length;
      if (h2Sections.length) h2Sections[h2Sections.length - 1].words += n;
      else introWords += n;
      if (n < 4) return;
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
    h2Sections,
    introWords,
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

  // --- geo-lint kökenli kontroller ---
  // 15) Belirsiz / dolgu açılış
  const vagueOpen = VAGUE_OPEN.test(plain(lead).trim());
  // 16) Özet kutusu (uzun yazılarda)
  const needsSummary = wc >= 600;
  const hasSummary = headings.some((h) => SUMMARY_HEAD.test(h.text)) || /^(kısaca|özetle|tl;dr|in short)\s*[:—-]/im.test(text.slice(0, 1500));
  // 17) Ara başlıksız uzun bölümler
  const longSections = (input.h2Sections ?? []).filter((s) => s.words > 300 && s.h3 === 0 && !isFaqHead(s.heading));
  // 18) Kaynaksız istatistik
  const statSents = sentencesOf(paragraphs.join(" ")).filter((x) => /%\s?\d|\d\s?%|\b\d+([.,]\d+)?\s?(milyon|milyar|million|billion)\b/i.test(x));
  const unsourced = statSents.filter((x) => !new RegExp(ATTRIBUTION.source, "i").test(x)).length;
  // 19) Açılmamış kısaltmalar
  const acronyms = [...new Set((text.match(/\b[A-ZÇĞİÖŞÜ]{2,6}\b/g) ?? []).filter((a) => !KNOWN_ACRONYMS.has(a)))];
  const unexpanded = acronyms.filter((a) => {
    const re = new RegExp(`\\(${a}\\)|\\b${a}\\s*\\(|${a}\\s*[:—–-]\\s*\\p{Lu}`, "u");
    return !re.test(text) && (text.match(new RegExp(`\\b${a}\\b`, "g")) ?? []).length >= 1;
  });
  // 20) Belirsiz başlıklar
  const vagueHeads = headings.filter((h) => h.level >= 2 && VAGUE_HEAD.test(h.text.trim().replace(/[:.]$/, "")));
  // 21) Uzun giriş
  const introW = input.introWords ?? 0;
  // 22) SSS derinliği
  const faqIdx = headings.findIndex((h) => isFaqHead(h.text));
  let faqCount = 0;
  if (faqIdx >= 0) {
    const fl = headings[faqIdx].level;
    for (let i = faqIdx + 1; i < headings.length && headings[i].level > fl; i++) faqCount++;
    if (faqCount < 3) {
      const at = text.toLocaleLowerCase("tr").indexOf(headings[faqIdx].text.toLocaleLowerCase("tr").slice(0, 30));
      if (at >= 0) faqCount = Math.max(faqCount, (text.slice(at).match(/\?/g) ?? []).length);
    }
  }

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
    {
      key: "vague-open",
      label: vagueOpen ? "Dolgu cümlesiyle açılış" : "Doğrudan açılış",
      ok: !vagueOpen,
      hint: "'Bu yazıda…', 'Günümüzde…' gibi dolgu açılışları silin; ilk cümle doğrudan cevabı ya da tanımı versin.",
      weight: 3,
    },
    {
      key: "summary",
      label: needsSummary ? (hasSummary ? "Özet / kısaca bölümü var" : "Özet / kısaca bölümü yok") : "Özet bölümü (kısa yazıda gerekmez)",
      ok: !needsSummary || hasSummary,
      hint: "600+ kelimelik yazılarda başa 'Kısaca' ya da 'Önemli noktalar' başlıklı 3–5 maddelik bir özet koyun; AI özetleri bu bloğu sık kullanır.",
      weight: 3,
    },
    {
      key: "long-section",
      label: longSections.length ? `Ara başlıksız uzun bölüm (${longSections.length})` : "Bölüm uzunlukları dengeli",
      ok: longSections.length === 0,
      part: input.h2Sections?.length ? 1 - longSections.length / input.h2Sections.length : 1,
      hint: `300 kelimeyi geçen bölümleri H3 alt başlıklarla bölün${longSections[0] ? ` (ör. "${longSections[0].heading.slice(0, 50)}")` : ""}. AI motorları metni başlık başlık parçalar.`,
      weight: 3,
    },
    {
      key: "stat-source",
      label: unsourced ? `Kaynaksız istatistik (${unsourced}/${statSents.length})` : "İstatistikler kaynaklı",
      ok: statSents.length === 0 || unsourced / statSents.length <= 0.5,
      part: statSents.length ? 1 - unsourced / statSents.length : 1,
      hint: "Yüzde ve büyük rakamların geçtiği cümlelere kaynağını ekleyin ('… raporuna göre %32'). Kaynaksız sayı AI'ın güvenini azaltır.",
      weight: 3,
    },
    {
      key: "acronyms",
      label: unexpanded.length ? `Açılmamış kısaltma (${unexpanded.slice(0, 4).join(", ")})` : "Kısaltmalar açıklanmış",
      ok: unexpanded.length <= 1,
      hint: "Kısaltmaları ilk geçtiği yerde açın: 'Yapay Zekâ Optimizasyonu (GEO)'. AI motorları ve okuyucu terimi ancak böyle eşleştirir.",
      weight: 2,
    },
    {
      key: "vague-heads",
      label: vagueHeads.length ? `Belirsiz başlık (${vagueHeads.slice(0, 3).map((h) => h.text).join(", ")})` : "Başlıklar açıklayıcı",
      ok: vagueHeads.length === 0,
      hint: "'Giriş', 'Detaylar', 'Sonuç' gibi tek kelimelik başlıkları konuyu anlatan başlıklarla değiştirin ('X seçerken 5 kriter').",
      weight: 2,
    },
    {
      key: "intro-len",
      label: introW > 150 ? `Uzun giriş (${introW} kelime)` : "Giriş kısa",
      ok: introW <= 150 || !(input.h2Sections ?? []).length,
      hint: "İlk ara başlıktan önceki giriş 150 kelimeyi geçmesin; okuyucu ve AI cevaba hızla ulaşsın.",
      weight: 2,
    },
    {
      key: "faq-depth",
      label: faqIdx >= 0 ? `SSS soru sayısı (${faqCount})` : "SSS derinliği (SSS yok)",
      ok: faqIdx < 0 || faqCount >= 3,
      hint: "SSS bölümünde en az 3 soru-cevap olsun; her soruyu ayrı başlık ya da kalın satırla yazın.",
      weight: 2,
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

// ---------------------------------------------------------------------------
// Bölüm (pasaj) bazlı alıntılanabilirlik
// AI motorları sayfayı bütün olarak değil, başlık başlık parçalar halinde alır. Her bölüm ayrı
// puanlanır; en zayıf bölümler "önce bunu düzelt" diye gösterilir. Yöntem, geo-seo-claude
// projesinin citability_scorer.py betiğinden (zubair-trabzada, MIT lisansı) Türkçe için uyarlanmıştır:
// cevap bloğu (30) · bağımsızlık (25) · yapı (20) · istatistik (15) · özgünlük (10).
// ---------------------------------------------------------------------------

export interface PassageInput {
  heading: string;
  text: string;
}

export interface CitPassage {
  heading: string;
  words: number;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  breakdown: { answer: number; selfContained: number; structure: number; stats: number; unique: number };
  preview: string;
  /** En çok puan kaybettiren boyut için kısa öneri. */
  tip: string;
}

export interface PassageReport {
  count: number;
  avg: number | null;
  /** 134–167 kelimelik (AI'ın en çok alıntıladığı uzunluk) bölüm sayısı. */
  optimal: number;
  grades: Record<CitPassage["grade"], number>;
  top: CitPassage[];
  weak: CitPassage[];
  all: CitPassage[];
}

/** Türkçe karakterlerle doğru çalışan kelime sınırı (\b, ğ/ş/ö gibi harfleri tanımaz). */
const wb = (src: string, flags = "iu") => new RegExp(`(?<![\\p{L}\\p{N}])(?:${src})(?![\\p{L}\\p{N}])`, flags);
const P_DEF = new RegExp(`${wb("nedir|demektir|olarak tanımlanır|anlamına gelir|kısaca|yani|başka bir deyişle|is an?|is the|refers to|means|defined as|in other words").source}|(dır|dir|dur|dür|tır|tir|tur|tür)[.,]`, "iu");
const P_FIRST = new RegExp(`${wb("ise|olan|olur|sağlar|gerekir|yapılır|is|are|was|were|means").source}|%\\s?\\d|\\d+\\s?%|[₺$€]\\s?\\d|\\d+\\s?(tl|milyon|milyar|bin|million|billion|thousand)(?![\\p{L}])`, "iu");
const P_SOURCE = wb("göre|araştırma(sı|sına göre)?|çalışma(sı)?|rapor(u|una göre)?|verilerine göre|istatistik(ler)?|according to|research shows|studies (show|found)|data shows");
const P_PRON = /^(bu|şu|o|bunlar|şunlar|onlar|bunu|şunu|onu|bunun|şunun|onun|buna|ona|bunda|onda|it|they|them|their|this|that|these|those|he|she|his|her)$/i;
const P_TRANS = wb("ilk olarak|öncelikle|ikinci olarak|üçüncü|son olarak|ayrıca|ek olarak|bunun yanı sıra|first|second|third|finally|additionally|moreover|furthermore");
const P_STEP = /(^|\s)(\d+[.)]\s|adım\s?\d|\d+\.\s?adım|step\s?\d|tip\s?\d)/iu;
const P_UNIT = wb("\\d+([.,]\\d+)?\\s?(kullanıcı|müşteri|kişi|sayfa|kat|gün|saat|dakika|ay|yıl|adet|kg|gr|cm|mm|km|m²|bar|litre|fincan|users|customers|pages|times|x)", "giu");
const P_ORG = wb("TÜİK|TCMB|BDDK|BTK|Statista|Nielsen|Gartner|Forrester|McKinsey|Deloitte|PwC|Harvard|Stanford|MIT|Google|Microsoft|OpenAI|Anthropic|Meta|Ahrefs|Semrush|Similarweb|Eurostat|OECD|WHO|Dünya Bankası", "u");
const P_OWN = wb("araştırmamız|anketimiz|verilerimiz|analizimiz|testlerimiz|test ettik|ölçtük|inceledik|analiz ettik|deneyimlerimize göre|our (research|study|data|analysis|survey|findings)|we (found|discovered|analyzed|surveyed|measured)");
const P_EXAMPLE = wb("örneğin|mesela|örnek olarak|vaka|uygulamada|gerçek hayatta|deneyimle|case study|for example|for instance|in practice|real-world|hands-on");

export function scorePassage(p: PassageInput): CitPassage {
  const text = plain(p.text).replace(/\s+/g, " ").trim();
  const ws = wordsOf(text);
  const wc = ws.length;
  const sents = sentencesOf(text);

  // A) Cevap bloğu (30)
  let answer = 0;
  if (P_DEF.test(text)) answer += 15;
  if (P_FIRST.test(ws.slice(0, 60).join(" "))) answer += 15;
  if (/\?\s*$/.test(p.heading.trim()) || QUESTION_HEAD.test(p.heading.trim())) answer += 10;
  if (sents.length) answer += Math.floor((sents.filter((x) => {
    const n = wordsOf(x).length;
    return n >= 5 && n <= 25;
  }).length / sents.length) * 10);
  if (P_SOURCE.test(text)) answer += 10;
  answer = Math.min(30, answer);

  // B) Bağımsızlık (25)
  let self = wc >= 134 && wc <= 167 ? 10 : wc >= 100 && wc <= 200 ? 7 : wc >= 80 && wc <= 250 ? 4 : wc < 30 || wc > 400 ? 0 : 2;
  const pron = ws.filter((w) => P_PRON.test(w.toLocaleLowerCase("tr").replace(/[^\p{L}]/gu, ""))).length / Math.max(1, wc);
  self += pron < 0.02 ? 8 : pron < 0.04 ? 5 : pron < 0.06 ? 3 : 0;
  // Cümle başı dışındaki büyük harfli kelimeler → özel isim/varlık sinyali
  const entities = (text.match(/(?<![.!?]\s)(?<!^)(?<![\p{L}])\p{Lu}[\p{Ll}]{2,}/gu) ?? []).length;
  self += entities >= 3 ? 7 : entities >= 1 ? 4 : 0;
  self = Math.min(25, self);

  // C) Yapı (20)
  const avgS = sents.length ? sents.reduce((a, x) => a + wordsOf(x).length, 0) / sents.length : 0;
  let structure = avgS >= 10 && avgS <= 20 ? 8 : avgS >= 8 && avgS <= 25 ? 5 : 2;
  if (P_TRANS.test(text)) structure += 4;
  if (P_STEP.test(p.text)) structure += 4;
  if (/\n\s*([-*+]|\d+[.)])\s/.test(p.text) || /\|.*\|/.test(p.text)) structure += 4;
  structure = Math.min(20, structure);

  // D) İstatistik yoğunluğu (15)
  let stats = Math.min(6, (text.match(/%\s?\d+|\d+([.,]\d+)?\s?%/g) ?? []).length * 3);
  stats += Math.min(5, (text.match(/[₺$€]\s?\d|\d[\d.,]*\s?(tl|₺|usd|eur)\b/gi) ?? []).length * 3);
  stats += Math.min(4, (text.match(P_UNIT) ?? []).length * 2);
  if (/(?<!\d)(19|20)\d{2}(?!\d)/.test(text)) stats += 2;
  if (P_ORG.test(text)) stats += 2;
  if (/\(\p{Lu}[\p{L}&. ]+,?\s(19|20)\d{2}\)/u.test(text)) stats += 2;
  stats = Math.min(15, stats);

  // E) Özgünlük (10)
  let unique = 0;
  if (P_OWN.test(text)) unique += 5;
  if (P_EXAMPLE.test(text)) unique += 3;
  if (/(?<![\p{L}])(ile|kullanarak|using|with|via)\s+\p{Lu}/u.test(text)) unique += 2;
  unique = Math.min(10, unique);

  const score = answer + self + structure + stats + unique;
  const grade = score >= 80 ? "A" : score >= 65 ? "B" : score >= 50 ? "C" : score >= 35 ? "D" : "F";
  const gaps: [number, string][] = [
    [1 - answer / 30, "İlk cümlede soruyu doğrudan cevaplayın ya da tanımı verin ('X, … olan bir …dır.')."],
    [1 - self / 25, wc < 100 ? `Bölüm kısa (${wc} kelime); 130–170 kelimeye tamamlayın.` : wc > 250 ? `Bölüm uzun (${wc} kelime); H3 ile ikiye bölün.` : "'Bu', 'o' gibi zamirler yerine konunun adını tekrar yazın; bölüm tek başına anlaşılsın."],
    [1 - structure / 20, "Adımları numaralı listeyle verin, cümleleri 10–20 kelimede tutun."],
    [1 - stats / 15, "Doğrulanabilir bir sayı, yüzde ya da kaynaklı bir veri ekleyin."],
    [1 - unique / 10, "Kendi deneyiminizden bir örnek ya da ölçüm ekleyin ('Örneğin…')."],
  ];
  gaps.sort((a, b) => b[0] - a[0]);
  return {
    heading: p.heading || "Giriş",
    words: wc,
    score,
    grade,
    breakdown: { answer, selfContained: self, structure, stats, unique },
    preview: ws.slice(0, 24).join(" ") + (wc > 24 ? "…" : ""),
    tip: gaps[0][1],
  };
}

export function analyzePassages(list: PassageInput[]): PassageReport {
  const all = list.filter((p) => wordsOf(p.text).length >= 20).map(scorePassage);
  const grades = { A: 0, B: 0, C: 0, D: 0, F: 0 } as PassageReport["grades"];
  for (const p of all) grades[p.grade]++;
  const sorted = [...all].sort((a, b) => b.score - a.score);
  return {
    count: all.length,
    avg: all.length ? Math.round(all.reduce((a, p) => a + p.score, 0) / all.length) : null,
    optimal: all.filter((p) => p.words >= 134 && p.words <= 167).length,
    grades,
    top: sorted.slice(0, 3),
    weak: sorted.length > 3 ? sorted.slice(-3).reverse() : sorted.filter((p) => p.score < 50).reverse(),
    all,
  };
}

/** Markdown'ı H2/H3 başlıklarına göre bölümlere ayırır (H1 ve SSS soruları dahil). */
export function passagesFromMarkdown(md: string): PassageInput[] {
  const out: PassageInput[] = [];
  let cur: PassageInput = { heading: "Giriş", text: "" };
  for (const raw of md.replace(/\r/g, "").split("\n")) {
    const h = raw.trim().match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      if (h[1].length === 1) continue;
      if (cur.text.trim()) out.push(cur);
      cur = { heading: h[2].trim(), text: "" };
      continue;
    }
    if (/^!\[/.test(raw.trim())) continue;
    cur.text += raw + "\n";
  }
  if (cur.text.trim()) out.push(cur);
  return out;
}

/** HTML (cheerio) içeriğini başlıklara göre bölümlere ayırır. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function passagesFromHtml($: any): PassageInput[] {
  const root = $("article").first().length ? $("article").first() : $("main").first().length ? $("main").first() : $("body");
  const out: PassageInput[] = [];
  let cur: PassageInput = { heading: "Giriş", text: "" };
  root.find("h2, h3, h4, p, li, table").each((_: number, el: any) => {
    const tag = (el.tagName || el.name || "").toLowerCase();
    if ($(el).closest("nav, header, footer, aside, form").length) return;
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (!t) return;
    if (/^h\d$/.test(tag)) {
      if (cur.text.trim()) out.push(cur);
      cur = { heading: t.slice(0, 140), text: "" };
    } else if (tag === "li") {
      if ($(el).parents("li").length) return;
      cur.text += `\n- ${t}`;
    } else if (tag === "table") {
      cur.text += `\n| ${t} |`;
    } else if (!$(el).closest("li, table").length && wordsOf(t).length >= 5) {
      cur.text += `\n${t}`;
    }
  });
  if (cur.text.trim()) out.push(cur);
  return out;
}
