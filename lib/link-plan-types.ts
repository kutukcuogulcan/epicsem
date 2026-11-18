/** Link planı — istemci tarafında da kullanılabilen türler ve sınıflandırma (sunucu bağımlılığı yok). */

export type AssetType = "guide" | "listicle" | "comparison" | "stats" | "tool" | "glossary" | "template" | "case" | "other";
export const ASSET_LABEL: Record<AssetType, string> = {
  guide: "Rehber / nasıl yapılır",
  listicle: "Liste yazısı",
  comparison: "Karşılaştırma",
  stats: "İstatistik / araştırma",
  tool: "Araç / hesaplama",
  glossary: "Sözlük / nedir",
  template: "Şablon / kontrol listesi",
  case: "Vaka çalışması",
  other: "Diğer",
};

export function assetType(urlOrTitle: string): AssetType {
  const s = urlOrTitle.toLocaleLowerCase("tr").replace(/[-_/]+/g, " ");
  if (/(istatistik|statistic|arastirma|araştırma|research|rapor|report|veri|data|anket|survey|trend)/.test(s)) return "stats";
  if (/(hesapla|calculator|araci|aracı|tool|generator|olusturucu|oluşturucu|checker|test et)/.test(s)) return "tool";
  if (/(sablon|şablon|template|kontrol listesi|checklist|ornek|örnek)/.test(s)) return "template";
  if (/(vaka|case study|basari hikaye|başarı hikaye|musteri hikaye)/.test(s)) return "case";
  if (/(\bvs\b|karsilastir|karşılaştır|compare|comparison|alternatif|alternative|farki|farkı)/.test(s)) return "comparison";
  if (/(\ben iyi\b|\btop\b|\bbest\b|\d+ (yol|ipucu|adim|adım|madde|araç|arac|site|yontem|yöntem)|listesi)/.test(s)) return "listicle";
  if (/(nasil|nasıl|how to|rehber|guide|kilavuz|kılavuz|adim adim|adım adım)/.test(s)) return "guide";
  if (/(nedir|what is|ne demek|sozluk|sözlük|glossary|anlami|anlamı)/.test(s)) return "glossary";
  return "other";
}

export interface LinkIdea {
  title: string;
  type: AssetType;
  targetKeyword: string;
  why: string;
  outline: string[];
  anchors: { exact: string; partial: string[]; branded: string; generic: string };
  pitchTo: string[];
  internalFrom: { url: string; anchor: string }[];
  inspiredBy: string | null;
}
