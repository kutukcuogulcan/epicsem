import type { GapVerdict } from "@/types";

/**
 * İçerik brifi: bir sayfanın kaybettiği sorular + somut içerik eksikleri. Eskiden Rakip Boşluğu
 * (kaldırıldı) üretirdi; kayıtlı eski brifler Autoblog, Asistan ve içerik üretiminde okunmaya devam eder.
 */
export interface ContentBrief {
  url: string;
  verdict: GapVerdict;
  reason: string;
  targetQuestions: string[];
  suggestedHeadings: string[];
  contentGaps: string[];
}
