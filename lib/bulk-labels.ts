/** Site taraması sorun kodlarının Türkçe adları ve Screaming Frog sekmelerine benzer grupları. */
export const ISSUE_LABEL: Record<string, string> = {
  broken: "Kırık sayfa (4xx/5xx)",
  redirect: "Yönlendirme (3xx)",
  "redirect-chain": "Yönlendirme zinciri",
  "broken-outlinks": "Kırık iç link içeriyor",
  "orphan-page": "Yetim sayfa",
  "deep-page": "Çok derin (4+ tık)",
  "not-in-sitemap": "Sitemap'te yok",
  "missing-title": "Eksik title",
  "title-too-long": "Title çok uzun (60+)",
  "title-too-short": "Title çok kısa (<30)",
  "duplicate-title": "Tekrarlayan title",
  "missing-meta-description": "Eksik meta açıklaması",
  "meta-description-too-long": "Meta çok uzun (160+)",
  "meta-description-too-short": "Meta çok kısa (<70)",
  "duplicate-meta-description": "Tekrarlayan meta",
  "missing-h1": "Eksik H1",
  "multiple-h1": "Birden çok H1",
  "missing-h2": "H2 yok",
  "thin-content": "Yetersiz içerik (<200 kelime)",
  "images-missing-alt": "Alt metni eksik görsel",
  "missing-canonical": "Canonical yok",
  "non-indexable": "İndekslenemez",
  "noindex-tag": "Noindex etiketi",
  "missing-schema": "Schema (yapısal veri) yok",
  "missing-viewport": "Mobil viewport yok",
  "missing-lang": "Dil (lang) etiketi yok",
  "missing-open-graph": "Open Graph yok",
  "mixed-content": "Karışık içerik (http)",
  "slow-response": "Yavaş yanıt (1,5 sn+)",
  "large-page": "Büyük sayfa (500 KB+)",
};

export const ISSUE_GROUPS: { label: string; codes: string[] }[] = [
  { label: "Yanıt kodları", codes: ["broken", "redirect", "redirect-chain"] },
  { label: "Linkler & yapı", codes: ["broken-outlinks", "orphan-page", "deep-page", "not-in-sitemap"] },
  { label: "Title & meta", codes: ["missing-title", "title-too-long", "title-too-short", "duplicate-title", "missing-meta-description", "meta-description-too-long", "meta-description-too-short", "duplicate-meta-description"] },
  { label: "Başlıklar & içerik", codes: ["missing-h1", "multiple-h1", "missing-h2", "thin-content"] },
  { label: "Görseller", codes: ["images-missing-alt"] },
  { label: "İndekslenme", codes: ["non-indexable", "noindex-tag", "missing-canonical"] },
  { label: "Teknik & AI hazırlığı", codes: ["missing-schema", "missing-viewport", "missing-lang", "missing-open-graph", "mixed-content"] },
  { label: "Performans", codes: ["slow-response", "large-page"] },
];

/** Kritik (kırmızı) sayılan sorunlar. */
export const CRITICAL_ISSUES = new Set(["broken", "broken-outlinks", "missing-title", "noindex-tag", "redirect-chain", "mixed-content"]);
