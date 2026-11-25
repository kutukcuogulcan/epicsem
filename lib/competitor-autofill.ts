import { getClient, updateClient } from "@/lib/db";
import { fetchPageSummary } from "@/lib/content-fetch";
import { buildHomeSummary, discoverCompetitors } from "@/lib/competitor-discovery";

/**
 * Rakipsiz açılan projeye rakipleri otomatik yazar (proje seçiciden "yeni proje" kurulum sihirbazındaki
 * rakip adımından geçmiyordu). Sihirbazla aynı kod: AI web aramasıyla önerir, kod her sitenin açıldığını
 * doğrular. 1 AI sorgusu. Hata olursa sessizce vazgeçer (proje rakipsiz kalır, elle eklenebilir).
 */
export async function autofillCompetitors(userId: number, clientId: number, domain: string, max = 6): Promise<number> {
  try {
    const page = await fetchPageSummary(`https://${domain}`);
    const r = await discoverCompetitors({ domain, homeSummary: buildHomeSummary(page), country: "Türkiye", language: "tr" });
    if (r.demoMode) return 0;
    const picked = r.competitors.filter((c) => c.name && c.domain).slice(0, max).map((c) => ({ name: c.name, domain: c.domain }));
    if (!picked.length) return 0;
    const cur = await getClient(userId, clientId);
    if (!cur || cur.competitors.length) return 0; // bu arada kullanıcı eklediyse dokunma
    await updateClient(userId, clientId, { competitors: picked });
    return picked.length;
  } catch (e) {
    console.error("[competitor-autofill]", domain, e instanceof Error ? e.message : e);
    return 0;
  }
}
