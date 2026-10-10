/**
 * AI SEO Editör için canlı puanlama — tamamen kural tabanlı (AI/token harcamaz).
 * SEO puanı: anahtar kelime yerleşimi, uzunluk, başlık yapısı, meta, okunabilirlik.
 * GEO puanı: metnin ChatGPT/Gemini/Perplexity'de alıntılanmaya uygunluğu
 * (cevap-önce paragraflar, soru biçimli başlıklar, SSS, liste/tablo, somut veri).
 */

export type BlockType = "h1" | "h2" | "h3" | "p" | "ul" | "ol" | "quote" | "img" | "table";
export interface Block {
  id: string;
  type: BlockType;
  text: string;
}
export interface Check {
  key: string;
  label: string;
  ok: boolean;
  /** 0-1 kısmi puan (ok yerine). */
  part?: number;
  hint: string;
  weight: number;
}

let n = 0;
export const uid = () => `b${Date.now().toString(36)}${(n++).toString(36)}`;

/** Markdown → bloklar (editörün iç yapısı). */
export function mdToBlocks(md: string): Block[] {
  const out: Block[] = [];
  const lines = md.replace(/\r/g, "").split("\n");
  let para: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  let table: string[] = [];
  const flushPara = () => {
    if (para.length) out.push({ id: uid(), type: "p", text: para.join(" ").trim() });
    para = [];
  };
  const flushList = () => {
    if (list) out.push({ id: uid(), type: list.type, text: list.items.join("\n") });
    list = null;
  };
  const flushTable = () => {
    if (table.length) out.push({ id: uid(), type: "table", text: table.join("\n") });
    table = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const t = line.trim();
    if (/^\|.*\|$/.test(t)) {
      flushPara();
      flushList();
      table.push(t);
      continue;
    } else flushTable();
    if (!t) {
      flushPara();
      flushList();
      continue;
    }
    const h = t.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flushPara();
      flushList();
      out.push({ id: uid(), type: (["h1", "h2", "h3"] as const)[h[1].length - 1], text: h[2].trim() });
      continue;
    }
    const img = t.match(/^!\[(.*?)\]\((.*?)\)$/);
    if (img) {
      flushPara();
      flushList();
      out.push({ id: uid(), type: "img", text: `${img[1]}|${img[2]}` });
      continue;
    }
    const ul = t.match(/^[-*+]\s+(.*)$/);
    const ol = t.match(/^\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const type = ul ? "ul" : "ol";
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push((ul ?? ol)![1]);
      continue;
    }
    if (t.startsWith(">")) {
      flushPara();
      flushList();
      out.push({ id: uid(), type: "quote", text: t.replace(/^>\s?/, "") });
      continue;
    }
    flushList();
    para.push(t);
  }
  flushPara();
  flushList();
  flushTable();
  return out.length ? out : [{ id: uid(), type: "p", text: "" }];
}

export function blocksToMd(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "h1":
          return `# ${b.text}`;
        case "h2":
          return `## ${b.text}`;
        case "h3":
          return `### ${b.text}`;
        case "ul":
          return b.text.split("\n").filter(Boolean).map((x) => `- ${x}`).join("\n");
        case "ol":
          return b.text.split("\n").filter(Boolean).map((x, i) => `${i + 1}. ${x}`).join("\n");
        case "quote":
          return `> ${b.text}`;
        case "img": {
          const [alt, src] = b.text.split("|");
          return `![${alt ?? ""}](${src ?? ""})`;
        }
        default:
          return b.text;
      }
    })
    .join("\n\n");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s: string) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');

export function blocksToHtml(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "h1":
        case "h2":
        case "h3":
          return `<${b.type}>${inline(b.text)}</${b.type}>`;
        case "ul":
        case "ol":
          return `<${b.type}>${b.text.split("\n").filter(Boolean).map((x) => `<li>${inline(x)}</li>`).join("")}</${b.type}>`;
        case "quote":
          return `<blockquote>${inline(b.text)}</blockquote>`;
        case "img": {
          const [alt, src] = b.text.split("|");
          return `<img src="${esc(src ?? "")}" alt="${esc(alt ?? "")}">`;
        }
        case "table": {
          const rows = b.text.split("\n").filter((r) => !/^\|\s*:?-+/.test(r));
          return `<table>${rows.map((r, i) => `<tr>${r.split("|").slice(1, -1).map((c) => (i === 0 ? `<th>${inline(c.trim())}</th>` : `<td>${inline(c.trim())}</td>`)).join("")}</tr>`).join("")}</table>`;
        }
        default:
          return `<p>${inline(b.text)}</p>`;
      }
    })
    .join("\n");
}

const plain = (s: string) => s.replace(/\[(.+?)\]\((.+?)\)/g, "$1").replace(/[*_`#>|]/g, " ");
const words = (s: string) => plain(s).split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
const norm = (s: string) => s.toLocaleLowerCase("tr").replace(/\s+/g, " ").trim();

function countOcc(text: string, kw: string) {
  if (!kw) return 0;
  const t = norm(plain(text));
  const k = norm(kw);
  let c = 0;
  let i = t.indexOf(k);
  while (i !== -1) {
    c++;
    i = t.indexOf(k, i + k.length);
  }
  return c;
}

export interface ScoreResult {
  seo: number;
  geo: number;
  seoChecks: Check[];
  geoChecks: Check[];
  stats: { words: number; readingMin: number; h2: number; paragraphs: number; avgSentence: number; density: number; links: number; images: number };
}

function score(checks: Check[]) {
  const total = checks.reduce((a, c) => a + c.weight, 0) || 1;
  const got = checks.reduce((a, c) => a + c.weight * (c.part ?? (c.ok ? 1 : 0)), 0);
  return Math.round((got / total) * 100);
}

export function scoreDoc(blocks: Block[], meta: { title: string; metaDescription: string; keyword: string }): ScoreResult {
  const kw = meta.keyword.trim();
  const all = blocks.map((b) => b.text).join("\n");
  const w = words(all.replace(/\|?https?:\/\/\S+/g, ""));
  const wc = w.length;
  const h1 = blocks.find((b) => b.type === "h1");
  const h2s = blocks.filter((b) => b.type === "h2");
  const paras = blocks.filter((b) => b.type === "p" && b.text.trim());
  const firstP = paras[0]?.text ?? "";
  const sentences = plain(paras.map((p) => p.text).join(" ")).split(/[.!?]+\s/).filter((s) => s.trim().length > 3);
  const avgSentence = sentences.length ? Math.round(sentences.reduce((a, s) => a + words(s).length, 0) / sentences.length) : 0;
  const occ = countOcc(all, kw);
  const density = wc && kw ? Math.round(((occ * words(kw).length) / wc) * 1000) / 10 : 0;
  const longParas = paras.filter((p) => words(p.text).length > 120).length;
  const links = (all.match(/\[[^\]]+\]\([^)]+\)/g) ?? []).length;
  const images = blocks.filter((b) => b.type === "img").length;
  const tl = meta.title.trim().length;
  const ml = meta.metaDescription.trim().length;

  const seoChecks: Check[] = [
    { key: "kw", label: "Hedef anahtar kelime belirlendi", ok: !!kw, hint: "Üstteki kutuya bu yazının hedeflediği arama ifadesini yazın.", weight: 2 },
    { key: "len", label: `Uzunluk yeterli (${wc} kelime)`, ok: wc >= 800, part: Math.min(1, wc / 800), hint: "Bilgilendirici yazılarda 800+ kelime hedefleyin; konuyu eksiksiz cevaplayın.", weight: 3 },
    { key: "h1", label: "Tek bir H1 başlık var", ok: blocks.filter((b) => b.type === "h1").length === 1, hint: "Yazının en üstüne bir H1 ekleyin (birden fazlaysa birini H2 yapın).", weight: 2 },
    { key: "kwh1", label: "Anahtar kelime H1'de", ok: !!kw && !!h1 && countOcc(h1.text, kw) > 0, hint: "Anahtar kelimeyi ana başlığa doğal şekilde ekleyin.", weight: 3 },
    { key: "kwfirst", label: "Anahtar kelime ilk paragrafta", ok: !!kw && countOcc(firstP, kw) > 0, hint: "İlk 100 kelimede anahtar kelimeyi kullanın.", weight: 2 },
    { key: "kwh2", label: "Anahtar kelime en az bir H2'de", ok: !!kw && h2s.some((h) => countOcc(h.text, kw) > 0), hint: "Ara başlıklardan birinde anahtar kelimeyi ya da yakın bir varyasyonunu kullanın.", weight: 1 },
    { key: "density", label: `Anahtar kelime yoğunluğu %${density}`, ok: density >= 0.5 && density <= 2.5, hint: density > 2.5 ? "Fazla tekrar var; bazılarını eş anlamlılarla değiştirin." : "Anahtar kelimeyi metinde birkaç kez daha doğal şekilde geçirin (%0,5–2,5).", weight: 2 },
    { key: "h2", label: `Yeterli ara başlık (${h2s.length} H2)`, ok: h2s.length >= 3, part: Math.min(1, h2s.length / 3), hint: "Metni en az 3 H2 ile bölümlere ayırın.", weight: 2 },
    { key: "title", label: `SEO title ${tl ? `(${tl} karakter)` : "yok"}`, ok: tl >= 30 && tl <= 60, hint: "30–60 karakterlik, anahtar kelimeyle başlayan bir title yazın.", weight: 2 },
    { key: "kwtitle", label: "Anahtar kelime title'da", ok: !!kw && countOcc(meta.title, kw) > 0, hint: "Title'a anahtar kelimeyi ekleyin.", weight: 2 },
    { key: "meta", label: `Meta açıklama ${ml ? `(${ml} karakter)` : "yok"}`, ok: ml >= 120 && ml <= 160, hint: "120–160 karakterlik, fayda ve çağrı içeren bir açıklama yazın.", weight: 2 },
    { key: "paras", label: "Paragraflar kısa ve okunur", ok: longParas === 0 && avgSentence <= 22, hint: longParas ? `${longParas} paragraf 120 kelimeden uzun; bölün.` : "Cümleleri ortalama 20 kelimenin altında tutun.", weight: 1 },
    { key: "links", label: `Link var (${links})`, ok: links >= 2, hint: "Sağdaki 'Linkler' sekmesinden en az 2 iç link ekleyin.", weight: 1 },
    { key: "img", label: `Görsel var (${images})`, ok: images >= 1, hint: "En az bir açıklayıcı görsel ve alt metni ekleyin.", weight: 1 },
  ];

  // --- GEO / AI alıntılanabilirlik ---
  const answerFirst = h2s.filter((h) => {
    const i = blocks.indexOf(h);
    const next = blocks.slice(i + 1).find((b) => b.type !== "img");
    if (!next || next.type !== "p") return false;
    const first = plain(next.text).split(/[.!?]\s/)[0] ?? "";
    const wl = words(first).length;
    return wl >= 6 && wl <= 35;
  }).length;
  const qH = h2s.concat(blocks.filter((b) => b.type === "h3")).filter((h) => /\?\s*$/.test(h.text) || /^(ne|nasıl|neden|hangi|kim|nerede|ne zaman|kaç|what|how|why|which|when)\b/i.test(h.text.trim())).length;
  const hasFaq = blocks.some((b) => (b.type === "h2" || b.type === "h3") && /(sss|sık sorulan|faq|soru)/i.test(b.text));
  const hasList = blocks.some((b) => b.type === "ul" || b.type === "ol");
  const hasTable = blocks.some((b) => b.type === "table");
  const numbers = (plain(all).match(/\b\d+([.,]\d+)?\s?(%|tl|₺|\$|€|kg|cm|mm|gün|saat|dakika|yıl|adet|kişi)?/gi) ?? []).length;
  const hasDef = !!firstP && /\b(nedir|demektir|olarak tanımlanır|is a|is the|refers to)\b|,?\s(bir|birer)\s.+(dır|dir|dur|dür|tır|tir|tur|tür)\b/i.test(plain(firstP));
  const kwEarly = !!kw && countOcc(plain(firstP).split(/[.!?]\s/)[0] ?? "", kw) > 0;

  const geoChecks: Check[] = [
    { key: "answer", label: `Cevap-önce bölümler (${answerFirst}/${h2s.length || 0})`, ok: h2s.length > 0 && answerFirst / h2s.length >= 0.7, part: h2s.length ? answerFirst / h2s.length : 0, hint: "Her H2'nin hemen altında ilk cümlede soruyu doğrudan cevaplayın (6–35 kelime). AI motorları bu cümleyi alıntılar.", weight: 3 },
    { key: "lead", label: "Giriş tek cümlede konuyu tanımlıyor", ok: hasDef || kwEarly, hint: "İlk cümlede '<konu>, … olan bir …dır.' kalıbında net bir tanım verin.", weight: 2 },
    { key: "qh", label: `Soru biçimli başlıklar (${qH})`, ok: qH >= 2, part: Math.min(1, qH / 2), hint: "Kullanıcıların AI'a sorduğu gibi başlıklar yazın: 'X nasıl seçilir?', 'X ile Y farkı nedir?'.", weight: 2 },
    { key: "faq", label: "SSS (Sık Sorulan Sorular) bölümü", ok: hasFaq, hint: "Yazının sonuna 4–6 soruluk bir SSS bölümü ekleyin; 'SSS ekle' düğmesi yazabilir.", weight: 2 },
    { key: "list", label: "Liste veya tablo kullanımı", ok: hasList || hasTable, part: hasList && hasTable ? 1 : hasList || hasTable ? 0.75 : 0, hint: "Adımları numaralı listeyle, karşılaştırmaları tabloyla verin — AI motorları yapılandırılmış veriyi sever.", weight: 2 },
    { key: "facts", label: `Somut veri ve sayılar (${numbers})`, ok: numbers >= 5, part: Math.min(1, numbers / 5), hint: "Ölçü, fiyat aralığı, süre, yüzde gibi doğrulanabilir sayılar ekleyin (uydurmayın).", weight: 2 },
    { key: "short", label: "Kısa, alıntılanabilir paragraflar", ok: paras.length > 0 && paras.filter((p) => words(p.text).length <= 80).length / paras.length >= 0.8, hint: "Paragrafları 2–4 cümlede tutun; her paragraf tek bir fikri anlatsın.", weight: 1 },
  ];

  return {
    seo: score(seoChecks),
    geo: score(geoChecks),
    seoChecks,
    geoChecks,
    stats: { words: wc, readingMin: Math.max(1, Math.round(wc / 200)), h2: h2s.length, paragraphs: paras.length, avgSentence, density, links, images },
  };
}
