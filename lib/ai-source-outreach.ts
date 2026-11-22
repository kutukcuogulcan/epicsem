import type { GeoRunResult, SourceDomainType } from "../types";

/**
 * Backlinkler: AI'ın GEO testinde kaynak gösterdiği dış siteler = en değerli link/anılma fırsatları.
 * Burada saf kısım: kaynakları topla (kendi ve rakip siteleri hariç) ve sayfa kontrolünden sonra
 * "durum + nasıl ulaşılır" planını çıkar. Sayfa açma/sayma API'de (app/api/backlinks/ai-sources).
 */

export interface AiSource {
  url: string;
  domain: string;
  type: SourceDomainType;
  /** Kaç AI cevabında kaynak gösterildi. */
  cites: number;
  /** Hangi sorularda. */
  prompts: string[];
  /** Kaynak gösterildiği cevaplardan kaçında markan anılmadı. */
  withoutYou: number;
}

const host = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

export function aggregateSources(runs: GeoRunResult[], ownDomain: string, rivalDomains: string[], classify: (domain: string, url: string) => SourceDomainType): AiSource[] {
  const skip = [ownDomain, ...rivalDomains].map((d) => d.toLowerCase().replace(/^www\./, "")).filter(Boolean);
  const by = new Map<string, AiSource>();
  for (const r of runs) {
    for (const c of r.citations) {
      const d = host(c.url);
      if (!d || c.isOwnDomain || skip.some((s) => d === s || d.endsWith(`.${s}`))) continue;
      const key = `${d}${(() => {
        try {
          return new URL(c.url).pathname.replace(/\/+$/, "");
        } catch {
          return "";
        }
      })()}`; // www, protokol ve sorgu farkı aynı sayfa
      const e = by.get(key) ?? { url: c.url, domain: d, type: classify(d, c.url), cites: 0, prompts: [], withoutYou: 0 };
      e.cites++;
      if (!e.prompts.includes(r.promptText)) e.prompts.push(r.promptText);
      if (!r.mentioned) e.withoutYou++;
      by.set(key, e);
    }
  }
  return [...by.values()].sort((a, b) => b.withoutYou - a.withoutYou || b.cites - a.cites);
}

export type OutreachStatus = "rakip-var-sen-yok" | "kimse-yok" | "aniliyorsun" | "okunamadi";

export function outreachPlan(type: SourceDomainType, page: { rivals: string[]; you: boolean; linksYou: boolean } | null): { status: OutreachStatus; label: string; action: string } {
  if (!page) return { status: "okunamadi", label: "Sayfa okunamadı", action: "Sayfayı tarayıcıda açıp kim anılıyor kendin kontrol et." };
  if (page.you)
    return {
      status: "aniliyorsun",
      label: page.linksYou ? "Anılıyorsun, link de var" : "Anılıyorsun ama link yok",
      action: page.linksYou ? "Durum iyi; bilgilerin (fiyat, özellik) güncel mi kontrol et." : "Yazara ulaşıp adının geçtiği yere sitene link eklemesini rica et.",
    };
  const how: Record<SourceDomainType, string> = {
    Editorial: "Yazara ya da editöre ulaş: listeye/karşılaştırmaya eklenmeyi öner, güncel fiyat ve farkını gösteren kısa bir bilgi notu gönder.",
    UGC: "Başlıkta açık bir marka hesabıyla, reklam değil gerçekten yardım eden bir cevap yaz; şikâyet sitesiyse şikâyetlere çözümle yanıt ver.",
    Reference: "Tarafsız, kaynaklı bilgi ekle (kurallara uy, kendi markanı tanıtma); referans siteler AI için güvenilir kaynak.",
    Government: "Resmi listede (ör. lisans, entegratör, onaylı sağlayıcı) yer almanın şartlarını kontrol et ve başvur.",
    Corporate: "Şirket sitesi: senin rakibin olan bir ürünse atla; değilse iş ortaklığı, entegrasyon dizini ya da ortak içerik için iletişime geç.",
    Competitor: "Rakip sitesi; buradan link beklenmez.",
    You: "Kendi siten.",
    Other: "Sayfanın sahibine ulaş: içerikte seni de anmasını sağlayacak somut bir veri, örnek ya da görüş sun.",
  };
  return page.rivals.length
    ? { status: "rakip-var-sen-yok", label: `Rakip anılıyor (${page.rivals.join(", ")}), sen yoksun`, action: how[type] }
    : { status: "kimse-yok", label: "Hiçbir takip edilen marka anılmıyor", action: how[type] };
}
