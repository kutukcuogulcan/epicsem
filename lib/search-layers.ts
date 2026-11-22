import type { Pillar } from "@/lib/audit-insights";

/**
 * Arama görünürlüğünün 5 katmanı (SEO → AEO → GEO → AIO → SXO). Yeni ölçüm yapmaz; var olan veriyi toplar:
 * SEO/AEO/AIO = Site Denetimi sütunları, GEO = son gerçek GEO testindeki görünürlük, SXO = PageSpeed mobil puanı.
 * Ölçülmemiş katman null kalır (uydurma puan yok).
 */

export type LayerKey = "seo" | "aeo" | "geo" | "aio" | "sxo";

export interface SearchLayer {
  key: LayerKey;
  label: string;
  question: string;
  score: number | null;
  /** En çok puan kaybettiren tek iş (yoksa null). */
  fix: string | null;
  href: string;
  missing: string;
}

const weakest = (p: Pillar | undefined) => {
  const c = p?.checks.filter((x) => x.score != null && x.score < 1).sort((a, b) => b.weight * (1 - (b.score as number)) - a.weight * (1 - (a.score as number)))[0];
  return c ? `${c.label} · şu an: ${c.found}` : null;
};

export function searchLayers(input: { pillars: Pillar[] | null; geoVisibility: number | null; sxoScore: number | null }): SearchLayer[] {
  const p = (k: string) => input.pillars?.find((x) => x.key === k);
  const audit = (k: string) => (p(k) ? p(k)!.score : null);
  const vis = input.geoVisibility == null ? null : Math.round(input.geoVisibility * 100);
  return [
    { key: "seo", label: "SEO", question: "Google seni bulup doğru anlıyor mu?", score: audit("seo"), fix: weakest(p("seo")), href: "/audit", missing: "Site Denetimi çalıştır" },
    { key: "aeo", label: "AEO", question: "Sayfaların soruları doğrudan cevaplıyor mu?", score: audit("aeo"), fix: weakest(p("aeo")), href: "/audit", missing: "Site Denetimi çalıştır" },
    {
      key: "geo",
      label: "GEO",
      question: "ChatGPT, Gemini, Claude seni anıyor mu?",
      score: vis,
      fix: vis == null ? null : vis < 50 ? "AI cevaplarının yarısından azında anılıyorsun: GEO'da kaybettiğin sorulara bak" : null,
      href: "/geo",
      missing: "GEO testi çalıştır",
    },
    { key: "aio", label: "AIO", question: "AI tarayıcıları siteni okuyabiliyor mu?", score: audit("axo"), fix: weakest(p("axo")), href: "/audit", missing: "Site Denetimi çalıştır" },
    {
      key: "sxo",
      label: "SXO",
      question: "Gelen ziyaretçi hızlı ve rahat bir sayfa görüyor mu?",
      score: input.sxoScore,
      fix: input.sxoScore != null && input.sxoScore < 50 ? "Mobil hız düşük: Site Denetimi'ndeki hız önerilerine bak" : null,
      href: "/audit",
      missing: "Hız ölçülemedi",
    },
  ];
}

/** En zayıf ölçülmüş katman (eşitlikte sıradaki ilk); hiçbiri ölçülmediyse null. */
export const weakestLayer = (layers: SearchLayer[]) =>
  layers.filter((l) => l.score != null).sort((a, b) => (a.score as number) - (b.score as number))[0] ?? null;
