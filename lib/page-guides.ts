import type { FAQItem } from "@/components/FAQSection";
import type { ScenarioStep } from "@/components/ExampleScenario";

/**
 * Sayfa altı "Nasıl çalışır" + SSS içerikleri — bu bölümleri henüz kendi içinde tanımlamamış
 * araç sayfaları için. Senaryolar kurgusaldır (bileşen bunu altta belirtir).
 */
export interface PageGuide {
  heading: string;
  steps: ScenarioStep[];
  faq: FAQItem[];
}

export const PAGE_GUIDES: Record<string, PageGuide> = {
  keywords: {
    heading: "\"Abiye elbise\" kelimesinden 3 dakikada içerik planı",
    steps: [
      { title: "Tohum kelimeyi yaz", body: "\"abiye elbise\" yazıp pazarı (Türkiye · Türkçe) seçersin; Google'ın arama önerileri toplanır." },
      { title: "Yüzlerce fikir gelir", body: "Sorular, ticari aramalar, karşılaştırmalar ve yerel aramalar ayrı ayrı gruplanır; benzerler kümelere toplanır." },
      { title: "Rakip sayfaları incele", body: "\"Google analizi\" ilk sayfadaki rakiplerin uzunluğunu, ara başlıklarını ve SSS'lerini gösterir." },
      { title: "Tek tıkla işe dök", body: "Seçtiğin kelimeler Autoblog'a, Sıralama Takibi'ne ya da hazır iskeletle Editör'e gider." },
    ],
    faq: [
      { q: "Arama hacmi neden görünmüyor?", a: "Arama hacmi Google Keyword Planner'dan gelir ve Google Ads API onayı gerektirir. Entegrasyonlar'dan Keyword Planner'ı bağlarsan tabloya aylık arama, rekabet ve tıklama başı maliyet sütunları eklenir. Bağlı değilse \"öneri sıklığı\" popülerlik için yön gösterir." },
      { q: "Ücretli mi, AI kredisi harcıyor mu?", a: "Hayır. Kelime fikirleri Google'ın herkese açık arama önerilerinden gelir, AI kullanılmaz. Sadece \"Google analizi\" SerpApi'den 1 arama harcar." },
      { q: "\"Öneri sıklığı\" ne demek?", a: "Bir kelimenin kaç farklı sorguda Google tarafından önerildiği. Daha sık önerilen kelimeler genelde daha çok aranır; kesin hacim değil, yön gösterir." },
      { q: "Hangi kelimeyle başlamalıyım?", a: "Önce \"Sorular\" grubuna bak: AI asistanları da insanların sorduğu soruları cevaplar. Bu sorulara net cevap veren içerikler hem Google'da hem ChatGPT'de görünme şansını artırır." },
    ],
  },
  rankings: {
    heading: "20 kelimenin Google sırası her sabah kendiliğinden güncelleniyor",
    steps: [
      { title: "Kelimeleri ekle", body: "Siteni ve takip etmek istediğin kelimeleri yazarsın ya da Anahtar Kelime Bulucu'dan seçip gönderirsin." },
      { title: "Her gün kontrol edilir", body: "Her kelime günde bir kez Google'ın ilk 100 sonucunda aranır; sıran ve sıralanan sayfan kaydedilir." },
      { title: "Değişimi gör", body: "Yükselen ve düşen kelimeler, son 60 günün mini grafiği ve ortalama sıra tek tabloda." },
      { title: "Düşüşe müdahale et", body: "Düşen kelimede \"Benzerleri\"ne tıklayıp içerik fırsatlarını bulur, sayfayı Editör'de güçlendirirsin." },
    ],
    faq: [
      { q: "Sıralama verisi nereden geliyor?", a: "İki seçenek var: SerpApi (ücretsiz planı var, her kontrol 1 arama) ya da kendi sunucundaki açık kaynak SerpBear. İkisini de Entegrasyonlar'dan bağlarsın." },
      { q: "Ne sıklıkla güncelleniyor?", a: "Günde bir kez otomatik. İstersen \"Şimdi kontrol et\" ile hemen de güncelleyebilirsin (saatte en fazla 6 kez)." },
      { q: "\"100+\" ne demek?", a: "Siten o kelimede Google'ın ilk 100 sonucunda yok demek. İçerik ya da teknik SEO çalışması gerekir." },
      { q: "SerpBear kullanıyorum, verilerim gelir mi?", a: "Evet. SerpBear'ı bağlayıp \"SerpBear'dan aktar\"a basınca kelimelerin ve son 60 günün geçmişi buraya taşınır; sonra her gün otomatik senkronlanır." },
    ],
  },
  bing: {
    heading: "Bing verisiyle ChatGPT aramasında görünmeyen sayfaları bulmak",
    steps: [
      { title: "Bing Webmaster'ı bağla", body: "Ücretsiz Bing Webmaster hesabından API anahtarı alıp Entegrasyonlar'a girersin." },
      { title: "Trafiği gör", body: "Son aylardaki günlük tıklama ve gösterimler grafikte, en çok gösterim alan sorgular tabloda." },
      { title: "Fırsatları yakala", body: "İlk 15'te görünüp neredeyse hiç tıklanmayan sorgular \"Tıklama fırsatları\" kutusunda listelenir." },
      { title: "Sayfaları gönder", body: "Yeni ya da güncellenen sayfaları \"Bing'e URL gönder\" ile hemen taranmaya yollarsın." },
    ],
    faq: [
      { q: "Neden Bing önemli?", a: "ChatGPT'nin web araması ve Microsoft Copilot, Bing'in indeksini kullanır. Bing'de görünmeyen bir sayfanın bu AI asistanlarında kaynak olarak çıkma şansı düşer." },
      { q: "Ücretli mi?", a: "Hayır, Bing Webmaster Tools ve API'si ücretsiz. Sadece sitenin Bing'de doğrulanmış olması gerekir; Google Search Console'dan içe aktarmak en hızlı yol." },
      { q: "Tıklama fırsatları nasıl belirleniyor?", a: "En az 50 gösterim almış, ortalama sırası 15 veya daha iyi olan ama tıklama oranı %2'nin altında kalan sorgular. Bu sorgularda sayfa başlığını ve açıklamasını iyileştirmek genelde hızlı sonuç verir." },
    ],
  },
  backlinks: {
    heading: "Rakiplerin link aldığı sitelerden link fırsatı listesi çıkarmak",
    steps: [
      { title: "Kaynağı bağla", body: "Bing Webmaster (ücretsiz) ve/veya Ahrefs'i Entegrasyonlar'dan bağlarsın." },
      { title: "Linklerini gör", body: "Sitene link veren alan adları, otorite puanları (DR), link metinleri ve kaybedilen linkler listelenir." },
      { title: "Rakipleri gir", body: "\"Link fırsatları\" sekmesine 2–4 rakip yazarsın." },
      { title: "Hedef listesi hazır", body: "Rakiplerine link verip sana vermeyen siteler, birden çok rakibe link verenler en üstte olacak şekilde sıralanır." },
    ],
    faq: [
      { q: "Backlink neden önemli?", a: "Başka sitelerin sana link vermesi Google'a güven sinyali verir. AI asistanları da sık bahsedilen, çok kaynakta geçen markaları daha çok önerir." },
      { q: "Ahrefs'e para vermem gerekiyor mu?", a: "Ücretsiz Ahrefs anahtarıyla link veren sitelerin otorite puanı (DR) gelir. Tam backlink listesi, kaybedilen linkler ve rakip karşılaştırması için Ahrefs Lite veya üstü plan gerekir. Sadece Bing'i bağlarsan da gelen linkleri ücretsiz görürsün." },
      { q: "DR (Domain Rating) nedir?", a: "Ahrefs'in bir sitenin backlink gücünü 0–100 arası puanladığı ölçü. 50 üstü güçlü kaynak sayılır." },
      { q: "Veriler ne sıklıkla yenileniyor?", a: "Sonuçlar 24 saat saklanır, böylece sayfayı her açışta Ahrefs kotası harcanmaz. \"Backlinkleri getir\" ile istediğinde yenileyebilirsin." },
      { q: "Kayıt listesi ne işe yarıyor?", a: "Markanın kaydolması gereken önemli harita, sosyal profil, yorum ve bilgi grafı sitelerini işletme türüne göre listeler. AI kayıt metinlerini (slogan, kısa ve uzun açıklama) hazırlar, sen kopyalayıp kaydolursun. Profil adresini girince sistem sitene link verilip verilmediğini kontrol eder. Formlar otomatik doldurulmaz; bu hem bot korumalarına takılmamak hem de spam sayılmamak için." },
    ],
  },
  editor: {
    heading: "Eski bir blog yazısını AI'da alıntılanacak hale getirmek",
    steps: [
      { title: "Sayfayı aç", body: "Yazının adresini yapıştırırsın; metin, başlıklar ve görseller editöre gelir." },
      { title: "Puanları gör", body: "SEO ve GEO puanı canlı hesaplanır; zayıf bölümler ve eksik kontroller sağ panelde listelenir." },
      { title: "Tek tıkla düzelt", body: "Zayıf paragrafı seçip \"Cevap-önce\", \"Sadeleştir\" ya da \"SSS ekle\" ile yeniden yazdırırsın." },
      { title: "Yayına gönder", body: "Kaydedip Content Studio'dan WordPress, Shopify ya da webhook ile yayınlarsın." },
    ],
    faq: [
      { q: "GEO puanı neye göre hesaplanıyor?", a: "Metnin AI asistanlarınca ne kadar kolay alıntılanabileceğini ölçen kurallarla: ilk cümlenin doğrudan cevap vermesi, somut veriler, kaynak gösterme, liste/tablo, soru biçimli başlıklar, SSS gibi. AI kullanılmaz, ücretsizdir." },
      { q: "AI düzenlemeleri kredi harcıyor mu?", a: "Puanlama ücretsiz. Paragrafı yeniden yazdırma, SSS ve meta önerisi gibi ✦ işaretli düğmeler AI çağrısı yapar ve aylık kotadan düşer." },
      { q: "Marka bilgi bankası ne işe yarıyor?", a: "Markan hakkındaki doğru bilgileri (kargo, iade, fiyat aralığı, ton) bir kez yazarsın; AI yazarken bunları esas alır ve olmayan bilgi uydurmaz." },
      { q: "Yazıyı sitemde doğrudan güncelleyebilir miyim?", a: "Evet. Kaydettikten sonra \"Yayınla\" ile Content Studio'ya geçer, bağlı WordPress/Shopify sitene taslak ya da yayın olarak gönderirsin." },
    ],
  },
  assistant: {
    heading: "\"Bu hafta neye odaklanmalıyım?\" sorusuna siteye özel cevap",
    steps: [
      { title: "Siteni seç", body: "Daha önce taradığın ya da GEO testi yaptığın siteyi üstten seçersin." },
      { title: "Soru sor", body: "\"ChatGPT'de neden rakiplerim çıkıyor?\", \"Ne yazmalıyım?\" gibi sorular sorarsın." },
      { title: "Veriye dayalı cevap", body: "Asistan taramaların, AI görünürlük testlerin ve sıralamalarından derlediği somut maddelerle cevap verir." },
      { title: "İlgili araca geç", body: "Cevaptaki linklerle doğrudan Editör'e, Site Taraması'na ya da Gap Analysis'e gidersin." },
    ],
    faq: [
      { q: "AI kredisi harcıyor mu?", a: "Hayır. Asistan kurallarla çalışır ve sadece kendi verilerine (taramalar, testler) bakar; ücretsizdir." },
      { q: "Neden bazı sorulara cevap veremiyor?", a: "Cevaplar senin sitene ait verilerden üretilir. Henüz Site Taraması ya da GEO testi yapmadıysan önce onları çalıştır; asistan çok daha somut cevap verir." },
      { q: "Hangi soruları sorabilirim?", a: "Öncelikler, teknik sorunlar, AI görünürlüğü, rakipler, içerik fikirleri ve sıralama değişimleri hakkında sorabilirsin." },
    ],
  },
  feeds: {
    heading: "Haftada 3 yazı için kendini yenileyen bir konu beslemesi kurmak",
    steps: [
      { title: "Besleme türünü seç", body: "Anahtar kelime, haber, RSS ya da YouTube kanalı beslemesi oluşturursun." },
      { title: "Konular dolar", body: "Kelime beslemesi Google önerileri, rakip site haritaları ve AI'da kaybettiğin sorulardan konu toplar." },
      { title: "Haftalık yenilenir", body: "Besleme her hafta kendini ücretsiz yeniler; kullanılan konular işaretlenir." },
      { title: "Autoblog'a bağla", body: "Bir beslemeyi bir ya da birden çok Autoblog kampanyasının kaynağı yaparsın." },
    ],
    faq: [
      { q: "Besleme yenilemesi ücretli mi?", a: "Hayır. Konu toplama ve haftalık yenileme AI kullanmaz. Sadece Autoblog yazı ürettiğinde içerik kotası harcanır." },
      { q: "YouTube beslemesi nasıl çalışıyor?", a: "Kanalın yeni videolarının başlık ve açıklamalarını konu olarak alır; Autoblog bu konulardan yazı üretir." },
      { q: "Aynı konu iki kez yazılır mı?", a: "Hayır. Kullanılan konular işaretlenir ve aynı beslemeden tekrar seçilmez." },
    ],
  },
  integrations: {
    heading: "Ücretsiz servislerle aracı tam güce getirmek",
    steps: [
      { title: "Kartı seç", body: "Bağlamak istediğin servisin kartına tıklarsın; sağdan adım adım kurulum açılır." },
      { title: "Anahtarı al", body: "Servisin kendi panelinden (çoğu ücretsiz) API anahtarını oluşturursun." },
      { title: "Kaydet ve test et", body: "Anahtarı girip kaydedersin; bağlantı hemen test edilir, sonuç kartta görünür." },
      { title: "Araçlar açılır", body: "Bağlanan servis ilgili sayfalarda kendiliğinden kullanılmaya başlar." },
    ],
    faq: [
      { q: "Hepsini bağlamam şart mı?", a: "Hayır. Hiçbiri zorunlu değil; bağlı olmayan yerlerde Epicsem'in ücretsiz yerleşik yöntemi çalışır." },
      { q: "En çok hangilerini önerirsin?", a: "Başlangıç için SerpApi (Google analizi ve sıralama), IndexNow (anında indeksleme) ve Bing Webmaster (ChatGPT aramasının kullandığı indeks). Üçü de ücretsiz." },
      { q: "Anahtarlarım güvende mi?", a: "Anahtarlar sunucuda saklanır, sana yalnızca son 4 hanesi gösterilir. Paylaşılan demo hesabında anahtar kaydı kapalıdır; kendi hesabınla giriş yapman gerekir." },
      { q: "Bir anahtarı nasıl değiştiririm?", a: "Kartı açıp yeni anahtarı yazman yeterli; boş bıraktığın alanlar eski değeri korur. \"Bağlantıyı kaldır\" ile tamamen silebilirsin." },
    ],
  },
};
