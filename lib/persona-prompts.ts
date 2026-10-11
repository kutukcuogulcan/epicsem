/**
 * Persona bazlı GEO soru üretimi — kalıplarla, AI KULLANMADAN (ücretsiz).
 * Her persona, gerçek bir müşterinin AI asistana nasıl soracağını taklit eden kalıplar taşır.
 * {k} = ürün/hizmet kategorisi, {m} = marka, {r} = bir rakip, {s} = şehir/bölge.
 * İstenirse /api/geo/persona-prompts aynı personalarla AI'dan daha doğal sorular da üretir.
 */

export interface Persona {
  id: string;
  label: string;
  /** Kısa tanım — AI ile zenginleştirmede modele de verilir. */
  description: string;
  templates: string[];
}

export const PERSONAS: Persona[] = [
  {
    id: "first-time",
    label: "İlk kez alan",
    description: "Bu kategoride ilk alışverişini yapacak, bilgisi az, yönlendirme bekleyen kişi",
    templates: [
      "İlk kez {k} alacağım, nelere dikkat etmeliyim?",
      "{k} nasıl seçilir, yeni başlayan biri için hangi markayı önerirsin?",
      "{k} alırken yapılan en yaygın hatalar neler?",
      "Yeni başlayanlar için en iyi {k} markaları hangileri?",
      "{k} almadan önce bilmem gerekenler neler?",
    ],
  },
  {
    id: "price",
    label: "Fiyat karşılaştıran",
    description: "Bütçesi kısıtlı, en uygun fiyat/performansı arayan, karşılaştırma yapan kişi",
    templates: [
      "En uygun fiyatlı {k} nereden alınır?",
      "{k} fiyatları ne kadar, hangi marka fiyat/performans olarak en iyisi?",
      "{m} mi {r} mi daha uygun?",
      "Uygun fiyatlı ama kaliteli {k} önerir misin?",
      "{k} için indirim ve kampanya yapan markalar hangileri?",
    ],
  },
  {
    id: "quality",
    label: "Kaliteyi önemseyen",
    description: "Fiyattan çok kaliteye, dayanıklılığa ve marka itibarına bakan kişi",
    templates: [
      "En kaliteli {k} markaları hangileri?",
      "Uzun ömürlü ve sağlam {k} için hangi markayı önerirsin?",
      "{k} konusunda en güvenilir marka hangisi?",
      "Premium {k} markalarını karşılaştırır mısın?",
    ],
  },
  {
    id: "urgent",
    label: "Acil ihtiyacı olan",
    description: "Hemen, hızlı teslimatla ya da yakınından almak isteyen kişi",
    templates: [
      "{k} acil lazım, hızlı kargo ile nereden alabilirim?",
      "Aynı gün teslim {k} satan yerler hangileri?",
      "{s} içinde {k} nereden alınır?",
      "Yarına kadar {k} bulabileceğim online mağazalar hangileri?",
    ],
  },
  {
    id: "gift",
    label: "Hediye alan",
    description: "Başkasına hediye arayan, fikir ve güvenli seçim isteyen kişi",
    templates: [
      "Hediye olarak {k} almak istiyorum, ne önerirsin?",
      "{k} hediye etmek için en iyi markalar hangileri?",
      "Hediye paketi seçeneği olan {k} markaları hangileri?",
    ],
  },
  {
    id: "trust",
    label: "Güven arayan",
    description: "Satın almadan önce markanın güvenilirliğini, yorumlarını ve iade koşullarını araştıran kişi",
    templates: [
      "{m} güvenilir mi?",
      "{m} yorumları nasıl, alan memnun mu?",
      "{m} iade ve değişim koşulları nasıl?",
      "{k} alırken hangi markalara güvenebilirim?",
    ],
  },
  {
    id: "b2b",
    label: "İşletme / toptan",
    description: "Kendi işletmesi için tedarikçi, toptancı ya da hizmet sağlayıcı arayan kişi",
    templates: [
      "Toptan {k} tedarikçisi önerir misin?",
      "İşletmem için {k} nereden tedarik edebilirim?",
      "Kurumsal müşterilere {k} sunan firmalar hangileri?",
      "{k} için en iyi B2B tedarikçiler kimler?",
    ],
  },
];

export interface PersonaPrompt {
  persona: string;
  text: string;
}

/** Kalıplardan soru üretir. Rakip/şehir yoksa o kalıpları atlar. */
export function generatePersonaPrompts(opts: {
  category: string;
  brand: string;
  competitors?: string[];
  city?: string;
  personaIds: string[];
  customPersonas?: string[];
  perPersona?: number;
}): PersonaPrompt[] {
  const k = opts.category.trim();
  if (!k) return [];
  const per = opts.perPersona ?? 4;
  const comp = (opts.competitors ?? []).filter(Boolean);
  const out: PersonaPrompt[] = [];
  const fill = (t: string, i: number) =>
    t
      .replace(/\{k\}/g, k)
      .replace(/\{m\}/g, opts.brand || k)
      .replace(/\{r\}/g, comp[i % Math.max(1, comp.length)] ?? "")
      .replace(/\{s\}/g, opts.city ?? "");
  for (const p of PERSONAS.filter((x) => opts.personaIds.includes(x.id))) {
    const usable = p.templates.filter((t) => (!t.includes("{r}") || comp.length) && (!t.includes("{s}") || opts.city));
    usable.slice(0, per).forEach((t, i) => out.push({ persona: p.label, text: fill(t, i) }));
  }
  for (const custom of opts.customPersonas ?? []) {
    const c = custom.trim();
    if (!c) continue;
    [
      `${c} olarak ${k} arıyorum, ne önerirsin?`,
      `${c} için en uygun ${k} hangisi?`,
      `${c} biri ${k} alırken nelere dikkat etmeli?`,
    ]
      .slice(0, per)
      .forEach((text) => out.push({ persona: c.slice(0, 40), text }));
  }
  for (const o of out) o.text = o.text.charAt(0).toLocaleUpperCase("tr") + o.text.slice(1);
  const seen = new Set<string>();
  return out.filter((p) => !seen.has(p.text.toLowerCase()) && seen.add(p.text.toLowerCase()));
}
