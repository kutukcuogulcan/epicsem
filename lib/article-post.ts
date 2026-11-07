/**
 * Yazıya AI kullanmadan son dokunuşlar — otomatik içindekiler listesi.
 * İlk "## " başlığından hemen önce, tüm ## başlıklarının listesini ekler.
 */
export function addTableOfContents(markdown: string, language = "tr"): string {
  const lines = markdown.split("\n");
  const heads = lines.filter((l) => /^##\s+/.test(l)).map((l) => l.replace(/^##\s+/, "").trim());
  if (heads.length < 3 || /^##\s+(İçindekiler|Table of contents)/im.test(markdown)) return markdown;
  const first = lines.findIndex((l) => /^##\s+/.test(l));
  const label = language === "tr" ? "İçindekiler" : "Table of contents";
  // Bağlantılı liste: markdownToHtml ## başlıklara aynı slug ile id verir.
  const seen = new Map<string, number>();
  const link = (h: string) => {
    const base = slugify(h.replace(/[*_`]/g, "")) || "bolum";
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return `#${n ? `${base}-${n + 1}` : base}`;
  };
  const toc = [`## ${label}`, "", ...heads.map((h) => `- [${h.replace(/[[\]]/g, "")}](${link(h)})`), ""];
  return [...lines.slice(0, first), ...toc, ...lines.slice(first)].join("\n");
}

/** Türkçe karakterleri sadeleştirip URL'ye uygun kısa ad (slug) üretir. */
export function slugify(text: string, max = 70): string {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u", Ç: "c", Ğ: "g", Ö: "o", Ş: "s", Ü: "u", â: "a", î: "i", û: "u" };
  const s = text
    .replace(/[çğıİöşüÇĞÖŞÜâîû]/g, (c) => map[c] ?? c)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.length > max ? s.slice(0, max).replace(/-[^-]*$/, "") : s;
}

/** "## Sık sorulan sorular" (SSS/FAQ) bölümündeki ### soru + cevap çiftleri. */
export function extractFaq(markdown: string): { q: string; a: string }[] {
  const m = markdown.match(/^##\s+(Sık sorulan sorular|Sıkça sorulan sorular|SSS|FAQ|Frequently asked questions)[^\n]*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/im);
  if (!m) return [];
  const out: { q: string; a: string }[] = [];
  const parts = m[2].split(/^###\s+/m).slice(1);
  for (const p of parts) {
    const [qLine, ...rest] = p.split("\n");
    const a = rest
      .join(" ")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_`>#]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const q = qLine.replace(/[*_`]/g, "").trim();
    if (q && a && !/\[NEEDS:/i.test(a)) out.push({ q, a: a.slice(0, 1000) });
  }
  return out.slice(0, 10);
}

/** Yazı için JSON-LD: BlogPosting + (varsa) FAQPage. AI motorları ve Google için. */
export function buildArticleSchema(p: { title: string; description: string; markdown: string; brandName?: string; siteUrl?: string; url?: string; datePublished?: string; imageUrl?: string | null; language?: string }): string {
  const graph: Record<string, unknown>[] = [
    {
      "@type": "BlogPosting",
      headline: p.title.slice(0, 110),
      description: p.description || undefined,
      inLanguage: p.language ?? "tr",
      datePublished: p.datePublished,
      dateModified: p.datePublished,
      ...(p.url ? { mainEntityOfPage: p.url, url: p.url } : {}),
      ...(p.imageUrl ? { image: p.imageUrl } : {}),
      ...(p.brandName ? { author: { "@type": "Organization", name: p.brandName, ...(p.siteUrl ? { url: p.siteUrl } : {}) }, publisher: { "@type": "Organization", name: p.brandName, ...(p.siteUrl ? { url: p.siteUrl } : {}) } } : {}),
    },
  ];
  const faq = extractFaq(p.markdown);
  if (faq.length >= 2) {
    graph.push({ "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) });
  }
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
}
