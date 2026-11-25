import { getClient, updateClient } from "@/lib/db";
import { fetchPageSummary } from "@/lib/content-fetch";
import { buildHomeSummary, discoverCompetitors } from "@/lib/competitor-discovery";
import { verifyOwnBrands } from "@/lib/alias-verify";
import { discoverSiteUrls } from "@/lib/site-urls";

/**
 * Rakipsiz açılan projeye rakipleri otomatik yazar (proje seçiciden "yeni proje" kurulum sihirbazındaki
 * rakip adımından geçmiyordu). Sihirbazla aynı kod: AI web aramasıyla önerir, kod her sitenin açıldığını
 * doğrular. 1 AI sorgusu. Hata olursa sessizce vazgeçer (proje rakipsiz kalır, elle eklenebilir).
 */
/** Aday alt markaları şirketin kendi sitesiyle doğrulayıp projeye yazar (proje alt markası boşsa). AI çağrısı yok. */
export async function saveVerifiedAliases(userId: number, clientId: number, domain: string, candidates: string[]): Promise<number> {
  try {
    if (!candidates.length) return 0;
    const [page, site] = await Promise.all([fetchPageSummary(`https://${domain}`), discoverSiteUrls(domain, 15_000).catch(() => null)]);
    const cur = await getClient(userId, clientId);
    if (!cur || cur.aliases.length) return 0;
    const aliases = verifyOwnBrands(candidates, cur.name, `${page.title ?? ""} ${page.metaDescription ?? ""} ${page.bodyText}`, site?.urls ?? []);
    if (aliases.length) await updateClient(userId, clientId, { aliases });
    return aliases.length;
  } catch (e) {
    console.error("[alias-verify]", domain, e instanceof Error ? e.message : e);
    return 0;
  }
}

export async function autofillCompetitors(userId: number, clientId: number, domain: string, max = 6): Promise<number> {
  try {
    const page = await fetchPageSummary(`https://${domain}`);
    const r = await discoverCompetitors({ domain, homeSummary: buildHomeSummary(page), country: "Türkiye", language: "tr" });
    if (r.demoMode) return 0;
    const picked = r.competitors.filter((c) => c.name && c.domain).slice(0, max).map((c) => ({ name: c.name, domain: c.domain }));
    const cur = await getClient(userId, clientId);
    if (!cur) return 0;
    // Alt markalar: AI'ın önerdiklerinden yalnızca şirketin kendi sitesinde (sayfa metni / site haritası) geçenler.
    const site = r.ownBrands?.length ? await discoverSiteUrls(domain, 15_000).catch(() => null) : null;
    const aliases = r.ownBrands?.length ? verifyOwnBrands(r.ownBrands, cur.name, `${page.title ?? ""} ${page.metaDescription ?? ""} ${page.bodyText}`, site?.urls ?? []) : [];
    // Bu arada kullanıcı elle eklediyse dokunma.
    const next = { competitors: cur.competitors.length ? undefined : picked, aliases: cur.aliases.length || !aliases.length ? undefined : aliases };
    if (!next.competitors?.length && !next.aliases) return 0;
    await updateClient(userId, clientId, next);
    return next.competitors?.length ?? 0;
  } catch (e) {
    console.error("[competitor-autofill]", domain, e instanceof Error ? e.message : e);
    return 0;
  }
}
