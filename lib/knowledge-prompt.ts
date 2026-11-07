/** Marka bilgi bankasını AI prompt'una eklenecek bloğa çevirir (boşsa boş döner). */
export function knowledgeBlock(knowledge: string | null | undefined): string {
  const k = (knowledge ?? "").trim();
  if (!k) return "";
  // lib/project-context.ts'in ürettiği hazır blok: tekrar sarmalama.
  if (k.startsWith("MARKA BAĞLAMI") || k.startsWith("MARKA BİLGİ BANKASI")) return `\n\n${k}\n`;
  return `\n\nMARKA BİLGİ BANKASI (marka sahibinin verdiği, doğru kabul edilecek bilgiler — ürün, hizmet, fiyat, adres, avantaj vb. için YALNIZCA bunları ve sayfadaki bilgileri kullan; burada olmayanı uydurma):\n"""\n${k.slice(0, 6000)}\n"""\n`;
}
