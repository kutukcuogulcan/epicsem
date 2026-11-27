// Pazar yeri / fiyat karşılaştırma / mağaza: bilinen siteler ya da adres sinyalleri (alan adında shop/store/market,
// atıf adresinde fiyat/en-ucuz/sepet/ürün). shortcut: adı ve adresi mağaza olduğunu belli etmeyen pet/kozmetik
// mağazaları Kurumsal kalır; elle tip değiştirme (Kart §8) gelince düzelir.
const RETAIL_DOMAINS = ["trendyol.com", "hepsiburada.com", "n11.com", "amazon.com.tr", "amazon.com", "akakce.com", "cimri.com", "epey.com", "ciceksepeti.com", "pazarama.com", "migros.com.tr", "getir.com", "a101.com.tr", "teknosa.com", "mediamarkt.com.tr", "vatanbilgisayar.com", "boyner.com.tr", "gittigidiyor.com", "ebay.com", "etsy.com", "aliexpress.com", "temu.com", "walmart.com"];
export function isRetailSource(domain: string, urls: string[]): boolean {
  const d = domain.replace(/^www\./i, "").toLowerCase();
  if (RETAIL_DOMAINS.some((r) => d === r || d.endsWith("." + r))) return true;
  if (/(shop|store|magaza|mağaza|sepet|market(?!ing))/.test(d.split(".")[0])) return true; // "marketing" ajansları değil
  const sig = urls.filter((u) => /(fiyat|en-ucuz|sepet|\/urun|\/ürün|\/product|-p-\d|\/p\/\d|add-to-cart)/i.test(u)).length;
  return urls.length > 0 && sig * 2 >= urls.length;
}
