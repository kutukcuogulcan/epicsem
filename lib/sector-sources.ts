/**
 * Sektöre göre AI'ın Türkiye'de kaynak gösterdiği siteler (off-page haritası).
 *
 * Kaynak (19 Kasım 2026 analizi):
 *  - Finans: Peec AI'da gerçek bir banka projesinin son 30 günü (≈112 bin AI cevabı; ChatGPT,
 *    Gemini, Google AI Overview, AI Mode). Yüzdeler "cevapların yüzde kaçında kaynak olarak
 *    kullanıldı" (retrieved) değeridir.
 *  - Diğer sektörler: her sektörde 6 tipik Türkçe soru Gemini + Google arama ile soruldu,
 *    gösterilen kaynaklar sayıldı. "6/6" = 6 sorunun 6'sında çıktı. Küçük örneklem, yalnızca
 *    Google tarafı; yön göstericidir, kesin istatistik değildir.
 *  - Genel bulgular: Peec'in 30M kaynaklık ABD analizi ve Reddit çeviri araştırması.
 * Bu liste başlangıç ayarıdır; projenin kendi GEO test kaynakları her zaman daha doğrudur.
 */

export type SourceKind = "video" | "community" | "complaint" | "listicle" | "comparison" | "marketplace" | "review-blog" | "editorial" | "institutional" | "directory";

export const KIND_META: Record<SourceKind, { label: string; action: string; outreach: boolean }> = {
  video: { label: "Video", action: "İnceleme yapan kanallara ürününü/hizmetini denemeyi öner; kendi kanalında soruyu cevaplayan video yayınla ve otomatik altyazıyı kontrol et (AI altyazıyı da okuyor).", outreach: false },
  community: { label: "Topluluk / forum", action: "Konulara reklam değil, deneyim anlatan gerçek cevaplarla katıl; uygun yerde yazını kaynak olarak ver.", outreach: false },
  complaint: { label: "Şikâyet sitesi", action: "Markana gelen şikâyetleri hızlı ve çözüm odaklı cevapla; AI çözülmüş şikâyetleri olumlu sinyal olarak okuyor.", outreach: false },
  listicle: { label: "Liste / öneri sitesi", action: "\"En iyi X\" yazılarında yer almak için yazara kısa bir e-posta gönder; AI'ın sık gösterdiği bir listede 1. sırada olmak anılma ihtimalini belirgin artırıyor.", outreach: true },
  comparison: { label: "Karşılaştırma sitesi", action: "Bu sitelerdeki ürün/fiyat bilgilerinin doğru ve güncel olduğundan emin ol; eksikse iş ortaklığı ya da profil güncellemesi iste.", outreach: true },
  marketplace: { label: "Pazar yeri / mağaza", action: "Ürün sayfalarında başlık, özellik ve yorumların eksiksiz olmasını sağla; AI ürün önerirken bu sayfaları okuyor.", outreach: false },
  "review-blog": { label: "İnceleme / gezi blogu", action: "Blog yazarlarıyla işbirliği (deneme, ziyaret, röportaj) öner; e-posta taslağı hazırlanabilir.", outreach: true },
  editorial: { label: "Haber / teknoloji sitesi", action: "Basın bülteni, veri/araştırma ya da uzman görüşüyle haberlere kaynak olmaya çalış.", outreach: true },
  institutional: { label: "Resmi kurum", action: "Bu kaynakları kendi içeriklerinde doğru alıntıla; ChatGPT özellikle resmi kaynaklara güveniyor.", outreach: false },
  directory: { label: "Rehber / profil sitesi", action: "Profilini oluştur ya da güncelle (hizmetler, fiyat aralığı, iletişim, yorumlar).", outreach: false },
};

export interface SectorSource {
  host: string;
  label: string;
  kind: SourceKind;
  /** Veriden kısa kanıt, ör. "AI Overview cevaplarının %27'si" ya da "6 sorunun 5'i". */
  evidence: string;
  /** Ağırlıklı olarak hangi motorlarda öne çıkıyor. */
  engines?: "google" | "chatgpt" | "all";
}

export interface Sector {
  id: string;
  label: string;
  /** Sektörün kaynak haritasının özeti (kullanıcıya gösterilir). */
  insight: string;
  /** Veri kalitesi notu. */
  basis: string;
  sources: SectorSource[];
  /** Proje açıklamasından sektör tahmini için anahtar kelimeler. */
  keywords: string[];
}

const SAMPLE = "Google tarafı örneklemi: 6 tipik Türkçe soru (19 Kasım 2026). Yön göstericidir.";

export const SECTORS: Sector[] = [
  {
    id: "finance",
    label: "Finans / bankacılık / sigorta",
    insight: "Google'ın AI cevaplarında karşılaştırma siteleri (hesapkurdu, hangikredi) baskın; Instagram, YouTube ve ŞikayetVar gibi topluluk siteleri de güçlü. ChatGPT ise topluluk sitelerini neredeyse hiç alıntılamıyor; resmi kurumlara (TCMB, BDDK) ve karşılaştırma sitelerine bakıyor. Reddit küçük, Ekşi Sözlük ondan daha etkili.",
    basis: "Gerçek veri: bir banka projesinde son 30 günde ≈112 bin AI cevabı (Peec AI).",
    keywords: ["banka", "kredi", "kart", "finans", "sigorta", "yatırım", "mevduat", "ödeme", "fintech", "borsa", "faiz", "bes"],
    sources: [
      { host: "hesapkurdu.com", label: "HesapKurdu", kind: "comparison", evidence: "Cevapların %20'si; AI Overview'da %27", engines: "google" },
      { host: "hangikredi.com", label: "HangiKredi", kind: "comparison", evidence: "Cevapların %14'ü; AI Overview'da %26", engines: "google" },
      { host: "enuygunfinans.com", label: "Enuygun Finans", kind: "comparison", evidence: "Cevapların %8,5'i", engines: "all" },
      { host: "teklifimgelsin.com", label: "Teklifimgelsin", kind: "comparison", evidence: "Cevapların %2'si", engines: "all" },
      { host: "kartavantaj.com", label: "KartAvantaj", kind: "comparison", evidence: "Cevapların %2,4'ü", engines: "all" },
      { host: "tcmb.gov.tr", label: "TCMB", kind: "institutional", evidence: "ChatGPT cevaplarının %15'i", engines: "chatgpt" },
      { host: "bddk.org.tr", label: "BDDK", kind: "institutional", evidence: "Cevapların %3,3'ü", engines: "all" },
      { host: "instagram.com", label: "Instagram", kind: "community", evidence: "AI Overview cevaplarının %19'u", engines: "google" },
      { host: "youtube.com", label: "YouTube", kind: "video", evidence: "AI Overview cevaplarının %9'u", engines: "google" },
      { host: "facebook.com", label: "Facebook", kind: "community", evidence: "AI Overview cevaplarının %12'si", engines: "google" },
      { host: "sikayetvar.com", label: "ŞikayetVar", kind: "complaint", evidence: "AI Overview cevaplarının %6'sı", engines: "google" },
      { host: "eksisozluk.com", label: "Ekşi Sözlük", kind: "community", evidence: "Cevapların %1,1'i (Reddit'ten fazla)", engines: "google" },
      { host: "reddit.com", label: "Reddit", kind: "community", evidence: "Cevapların %1'i; ChatGPT'de alıntı yok", engines: "google" },
      { host: "onedio.com", label: "Onedio", kind: "community", evidence: "Cevapların %0,8'i", engines: "google" },
      { host: "kizlarsoruyor.com", label: "Kızlarsoruyor", kind: "community", evidence: "AI Overview cevaplarının %1'i", engines: "google" },
      { host: "hurriyet.com.tr", label: "Hürriyet", kind: "editorial", evidence: "Cevapların %1,2'si", engines: "all" },
      { host: "bloomberght.com", label: "Bloomberg HT", kind: "editorial", evidence: "Cevapların %0,5'i", engines: "all" },
    ],
  },
  {
    id: "electronics",
    label: "E-ticaret / elektronik",
    insight: "YouTube neredeyse her cevapta. Ardından büyük mağazalar (MediaMarkt, Trendyol), teknoloji siteleri (Webtekno, Donanımhaber, ShiftDelete) ve \"en iyi X\" liste siteleri geliyor.",
    basis: SAMPLE,
    keywords: ["elektronik", "telefon", "bilgisayar", "laptop", "kulaklık", "beyaz eşya", "e-ticaret", "teknoloji", "gadget", "akıllı saat"],
    sources: [
      { host: "youtube.com", label: "YouTube", kind: "video", evidence: "6 sorunun 5'i", engines: "google" },
      { host: "mediamarkt.com.tr", label: "MediaMarkt", kind: "marketplace", evidence: "6 sorunun 5'i", engines: "google" },
      { host: "webtekno.com", label: "Webtekno", kind: "editorial", evidence: "6 sorunun 3'ü", engines: "all" },
      { host: "donanimhaber.com", label: "Donanımhaber", kind: "community", evidence: "6 sorunun 3'ü", engines: "google" },
      { host: "shiftdelete.net", label: "ShiftDelete", kind: "editorial", evidence: "6 sorunun 1'i", engines: "all" },
      { host: "trendyol.com", label: "Trendyol", kind: "marketplace", evidence: "6 sorunun 1'i", engines: "google" },
      { host: "hepsiburada.com", label: "Hepsiburada", kind: "marketplace", evidence: "Örneklemde çıktı", engines: "google" },
      { host: "eniyilerden.com", label: "Eniyilerden", kind: "listicle", evidence: "6 sorunun 1'i", engines: "google" },
      { host: "iyininiyisi.com", label: "İyinin İyisi", kind: "listicle", evidence: "6 sorunun 1'i", engines: "google" },
      { host: "technopat.net", label: "Technopat", kind: "community", evidence: "Finans verisinde de çıkıyor", engines: "google" },
      { host: "reddit.com", label: "Reddit", kind: "community", evidence: "6 sorunun 1'i", engines: "google" },
    ],
  },
  {
    id: "fashion",
    label: "Moda / giyim",
    insight: "Mağazalar (Boyner, Beymen, Network, Trendyol), \"en iyi marka\" liste siteleri ve butik blogları öne çıkıyor. Reddit ve YouTube da var.",
    basis: SAMPLE,
    keywords: ["moda", "giyim", "elbise", "ayakkabı", "mont", "butik", "tekstil", "aksesuar", "çanta", "abiye"],
    sources: [
      { host: "youtube.com", label: "YouTube", kind: "video", evidence: "6 sorunun 3'ü", engines: "google" },
      { host: "boyner.com.tr", label: "Boyner", kind: "marketplace", evidence: "6 sorunun 2'si", engines: "google" },
      { host: "beymen.com", label: "Beymen", kind: "marketplace", evidence: "6 sorunun 2'si", engines: "google" },
      { host: "network.com.tr", label: "Network", kind: "marketplace", evidence: "6 sorunun 2'si", engines: "google" },
      { host: "reddit.com", label: "Reddit", kind: "community", evidence: "6 sorunun 2'si", engines: "google" },
      { host: "iyioneri.tr", label: "İyi Öneri", kind: "listicle", evidence: "6 sorunun 2'si", engines: "google" },
      { host: "eniyilerden.com", label: "Eniyilerden", kind: "listicle", evidence: "6 sorunun 1'i", engines: "google" },
      { host: "onedio.com", label: "Onedio", kind: "community", evidence: "6 sorunun 1'i", engines: "google" },
      { host: "trendyol.com", label: "Trendyol", kind: "marketplace", evidence: "6 sorunun 1'i", engines: "google" },
    ],
  },
  {
    id: "travel",
    label: "Seyahat / turizm / otel",
    insight: "Rezervasyon siteleri (Enuygun, Agoda, Etstur, Tatilsepeti, Skyscanner) ve gezi blogları (gezipgordum, bujuyollarda, bizevdeyokuz, oteltavsiyeleri) baskın. Onedio ve Reddit de çıkıyor.",
    basis: SAMPLE,
    keywords: ["otel", "tatil", "seyahat", "tur", "turizm", "uçak", "bilet", "villa", "pansiyon", "acente"],
    sources: [
      { host: "enuygun.com", label: "Enuygun", kind: "comparison", evidence: "6 sorunun 3'ü", engines: "google" },
      { host: "oteltavsiyeleri.com", label: "Otel Tavsiyeleri", kind: "listicle", evidence: "6 sorunun 2'si", engines: "google" },
      { host: "gezipgordum.com", label: "Gezip Gördüm", kind: "review-blog", evidence: "6 sorunun 2'si", engines: "google" },
      { host: "bujuyollarda.com", label: "Bu Juyollarda", kind: "review-blog", evidence: "6 sorunun 2'si", engines: "google" },
      { host: "bizevdeyokuz.com", label: "Biz Evde Yokuz", kind: "review-blog", evidence: "6 sorunun 2'si", engines: "google" },
      { host: "onedio.com", label: "Onedio", kind: "community", evidence: "6 sorunun 2'si", engines: "google" },
      { host: "etstur.com", label: "Etstur", kind: "marketplace", evidence: "6 sorunun 1'i", engines: "google" },
      { host: "tatilsepeti.com", label: "Tatilsepeti", kind: "marketplace", evidence: "6 sorunun 1'i", engines: "google" },
      { host: "agoda.com", label: "Agoda", kind: "marketplace", evidence: "6 sorunun 1'i", engines: "google" },
      { host: "skyscanner.com.tr", label: "Skyscanner", kind: "comparison", evidence: "6 sorunun 1'i", engines: "google" },
      { host: "tripadvisor.com.tr", label: "Tripadvisor", kind: "directory", evidence: "ABD verisinde ilk 100 alıntılanan site", engines: "all" },
      { host: "reddit.com", label: "Reddit", kind: "community", evidence: "6 sorunun 1'i", engines: "google" },
    ],
  },
  {
    id: "health",
    label: "Sağlık / klinik / estetik",
    insight: "Klinik ve hastanelerin kendi siteleri baskın (ör. Medicana); topluluk siteleri neredeyse yok. Off-page'de sağlık turizmi aracı siteleri ve YouTube öne çıkıyor; asıl iş kendi sitendeki içerik.",
    basis: SAMPLE,
    keywords: ["klinik", "hastane", "diş", "estetik", "saç ekimi", "doktor", "sağlık", "tedavi", "implant", "göz"],
    sources: [
      { host: "youtube.com", label: "YouTube", kind: "video", evidence: "6 sorunun 2'si", engines: "google" },
      { host: "clinall.com", label: "Clinall", kind: "directory", evidence: "İki ayrı testte çıktı", engines: "google" },
      { host: "safemedigo.com", label: "Safemedigo", kind: "directory", evidence: "6 sorunun 1'i", engines: "google" },
    ],
  },
  {
    id: "education",
    label: "Eğitim / kurs",
    insight: "YouTube, Reddit, Donanımhaber ve BTK Akademi gibi kaynaklar ile \"en iyi kurs\" inceleme siteleri (ingilizcetavsiye, ingilizceyorum) öne çıkıyor.",
    basis: SAMPLE,
    keywords: ["eğitim", "kurs", "okul", "dershane", "akademi", "online ders", "sertifika", "dil", "üniversite"],
    sources: [
      { host: "youtube.com", label: "YouTube", kind: "video", evidence: "6 sorunun 2'si", engines: "google" },
      { host: "reddit.com", label: "Reddit", kind: "community", evidence: "6 sorunun 2'si", engines: "google" },
      { host: "donanimhaber.com", label: "Donanımhaber", kind: "community", evidence: "6 sorunun 2'si", engines: "google" },
      { host: "btkakademi.gov.tr", label: "BTK Akademi", kind: "institutional", evidence: "6 sorunun 2'si", engines: "all" },
      { host: "ingilizcetavsiye.com", label: "İngilizce Tavsiye", kind: "listicle", evidence: "6 sorunun 1'i", engines: "google" },
      { host: "ingilizceyorum.com", label: "İngilizce Yorum", kind: "listicle", evidence: "6 sorunun 1'i", engines: "google" },
    ],
  },
  {
    id: "automotive",
    label: "Otomotiv",
    insight: "YouTube araç incelemeleri en güçlü kaynak; ardından otomotiv yorum siteleri (araclo, vidyoto, yorumoto), arabam.com ve sigorta siteleri geliyor. Reddit de çıkıyor.",
    basis: SAMPLE,
    keywords: ["otomobil", "araba", "araç", "otomotiv", "kasko", "lastik", "bayi", "elektrikli araç", "galeri"],
    sources: [
      { host: "youtube.com", label: "YouTube", kind: "video", evidence: "6 sorunun 4'ü", engines: "google" },
      { host: "araclo.com", label: "Araçlo", kind: "review-blog", evidence: "6 sorunun 3'ü", engines: "google" },
      { host: "arabam.com", label: "arabam.com", kind: "marketplace", evidence: "6 sorunun 2'si", engines: "google" },
      { host: "vidyoto.com", label: "Vidyoto", kind: "review-blog", evidence: "6 sorunun 2'si", engines: "google" },
      { host: "reddit.com", label: "Reddit", kind: "community", evidence: "6 sorunun 2'si", engines: "google" },
      { host: "yorumoto.com", label: "Yorumoto", kind: "review-blog", evidence: "6 sorunun 1'i", engines: "google" },
    ],
  },
  {
    id: "saas",
    label: "Yazılım / B2B SaaS",
    insight: "Rakip yazılımların kendi karşılaştırma blogları (Paraşüt, İdeasoft, Logo, Mikro), karşılaştırma siteleri ve yabancı inceleme siteleri baskın. Perplexity'de G2 ilk 5 kaynak arasında.",
    basis: SAMPLE,
    keywords: ["yazılım", "saas", "crm", "erp", "muhasebe", "platform", "uygulama", "b2b", "otomasyon", "seo aracı"],
    sources: [
      { host: "g2.com", label: "G2", kind: "directory", evidence: "Perplexity'de ilk 5 kaynak (ABD verisi)", engines: "all" },
      { host: "muhasebekarsilastir.com", label: "Muhasebe Karşılaştır", kind: "comparison", evidence: "6 sorunun 1'i", engines: "google" },
      { host: "thedigitalprojectmanager.com", label: "The Digital Project Manager", kind: "listicle", evidence: "6 sorunun 2'si", engines: "all" },
      { host: "linkedin.com", label: "LinkedIn", kind: "community", evidence: "ABD verisinde 3. en çok alıntılanan", engines: "all" },
      { host: "reddit.com", label: "Reddit", kind: "community", evidence: "Örneklemde çıktı", engines: "google" },
      { host: "medium.com", label: "Medium", kind: "community", evidence: "Örneklemde çıktı", engines: "google" },
    ],
  },
  {
    id: "realestate",
    label: "Gayrimenkul / ev / yapı",
    insight: "YouTube, emlak verisi ve ilan siteleri (Endeksa, Hepsiemlak), kredi karşılaştırma siteleri ve niş ev siteleri öne çıkıyor.",
    basis: SAMPLE,
    keywords: ["emlak", "gayrimenkul", "konut", "daire", "inşaat", "mobilya", "kombi", "dekorasyon", "yapı", "ev"],
    sources: [
      { host: "youtube.com", label: "YouTube", kind: "video", evidence: "6 sorunun 3'ü", engines: "google" },
      { host: "endeksa.com", label: "Endeksa", kind: "comparison", evidence: "6 sorunun 2'si", engines: "google" },
      { host: "hepsiemlak.com", label: "Hepsiemlak", kind: "marketplace", evidence: "6 sorunun 2'si", engines: "google" },
      { host: "hangikredi.com", label: "HangiKredi", kind: "comparison", evidence: "6 sorunun 2'si", engines: "google" },
      { host: "hesapkurdu.com", label: "HesapKurdu", kind: "comparison", evidence: "6 sorunun 2'si", engines: "google" },
      { host: "donanimhaber.com", label: "Donanımhaber", kind: "community", evidence: "6 sorunun 1'i", engines: "google" },
      { host: "trendyol.com", label: "Trendyol", kind: "marketplace", evidence: "6 sorunun 1'i", engines: "google" },
    ],
  },
];

export const SECTOR_BY_ID: Record<string, Sector> = Object.fromEntries(SECTORS.map((s) => [s.id, s]));

/** Proje açıklamasından sektör tahmini (bulamazsa null). */
export function guessSector(text: string): string | null {
  const t = text.toLocaleLowerCase("tr");
  let best: { id: string; n: number } | null = null;
  for (const s of SECTORS) {
    const n = s.keywords.filter((k) => t.includes(k)).length;
    if (n && (!best || n > best.n)) best = { id: s.id, n };
  }
  return best?.id ?? null;
}
