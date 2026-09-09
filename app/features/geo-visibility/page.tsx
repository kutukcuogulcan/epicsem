import FAQSection from "@/components/FAQSection";
import FeatureHero from "@/components/FeatureHero";
import FeatureGrid from "@/components/FeatureGrid";
import FeatureCTA from "@/components/FeatureCTA";
import FeatureComparison from "@/components/FeatureComparison";
import FeatureSteps from "@/components/FeatureSteps";

const COMPARISON = {
  without: {
    title: "Klasik SEO/rank takip araçlarıyla",
    items: [
      "Sadece Google sıralamasını ölçer",
      "ChatGPT, Claude, Gemini'de marka anılıyor mu bilmezsiniz",
      "Marka-bilinen ve keşif sorguları arasındaki farkı göstermez",
      "Türkçe ve İngilizce promptlar arasında ayrım yapmaz",
    ],
  },
  withItems: {
    title: "Epicsem GEO/AEO Visibility ile",
    items: [
      "ChatGPT, Claude, Gemini, Perplexity'e gerçek promptlar gönderilir",
      "Marka-bilinen ve keşif görünürlüğü ayrı ölçülür",
      "Hangi kaynakların referans gösterildiği görülür",
      "Türkçe promptlar İngilizce eşdeğerinden ayrı test edilir",
    ],
  },
};

export const metadata = {
  title: "AI'da Marka Görünürlüğü Testi (ChatGPT, Claude, Gemini) — Epicsem GEO/AEO",
  description:
    "Markanız ChatGPT, Claude, Gemini ve Perplexity'e soru sorulduğunda rakiplerinize karşı ne kadar görünüyor? Epicsem'in GEO/AEO aracıyla gerçek promptlarla ücretsiz test edin.",
};

const SCENARIO_STEPS = [
  {
    title: "Marka ve rakipler girilir",
    body: "Marka adı, domain ve iki rakip eklenir.",
  },
  {
    title: "Prompt önerisi istenir",
    body: "\"✨ Prompt öner\" ile hem markayı adıyla soran hem de kategoriyi genel soran promptlar otomatik oluşturulur; \"Fiyat: X ne kadar tutar?\" gibi konu etiketleriyle işaretlenir.",
  },
  {
    title: "Test dört motora gönderilir",
    body: "ChatGPT, Claude, Gemini ve Perplexity'e aynı promptlar gönderilir.",
  },
  {
    title: "Sonuç: marka-bilinende görünür, keşifte görünmez",
    body: "Marka adıyla sorulan promptlarda %90 görünürlük çıkar, ama \"bu kategoride en iyi markalar hangileri?\" gibi keşif promptlarında %10'un altında kalır — markayı henüz bilmeyen biri AI'dan onu hiç duymuyor.",
  },
  {
    title: "Konu kırılımı zayıf noktayı gösterir",
    body: "\"Fiyat\" konulu promptlarda görünürlük en düşük çıkar — bu bulgu hangi içeriğin öncelikli üretilmesi gerektiğini gösterir.",
  },
];

const FAQ_ITEMS = [
  {
    q: "Hangi AI motorlarını gerçekten test ediyor?",
    a: "ChatGPT (OpenAI), Claude (Anthropic), Gemini (Google) ve Perplexity gerçek API entegrasyonuyla çalışır; DeepSeek ve Grok da gerçek entegre. Meta AI ve Microsoft Copilot'un genel API'si olmadığı için bu ikisi her zaman simüle çalışır — ekranda \"demo only\" olarak işaretli.",
  },
  {
    q: "Sonuçlar gerçek mi, simülasyon mu?",
    a: "İlgili motorun API anahtarı tanımlıysa gerçek bir sorgu gönderilir. Tanımlı değilse sistem demo modda çalışır ve sonuçlar gerçekçi ama simüle edilmiştir — bu durum ekranda açıkça \"demo mode\" olarak belirtilir.",
  },
  {
    q: "Marka-bilinen (branded) ve keşif (discovery) prompt farkı ne?",
    a: "Marka-bilinen bir prompt markanı adıyla soruyor (\"X güvenilir mi?\"); keşif promptu ise markanı hiç duymamış birinin sorabileceği genel bir kategori sorusu (\"bu alanda en iyi araçlar hangileri?\"). İkisi ayrı ölçülür çünkü biri seni zaten bilenler, diğeri seni henüz keşfetmemiş olanlar için görünürlüğünü gösterir.",
  },
  {
    q: "Aylık kaç sorgu hakkım var?",
    a: "Ücretsiz planda GEO/AEO ve Gap Analysis birlikte, ayda toplam 300 AI motor sorgusu (prompt sayısı × motor sayısı) içeriyor. Demo modda hiçbir sorgu bu kotadan düşmez.",
  },
  {
    q: "Neden Türkçe promptları ayrı test etmeliyim?",
    a: "LLM'ler bir soruya hangi dilde sorulduğuna göre farklı kaynaklara (haber siteleri, forumlar, resmi sayfalar) yönelebiliyor — İngilizce sonuç Türkçe için otomatik geçerli olmuyor. Hedef kitleniz Türkiye ise iki dilde de test etmek, sadece İngilizce test etmekten daha doğru bir tablo verir.",
  },
];

const FEATURES = [
  { title: "Gerçek API testi", body: "Simülasyon değil — ChatGPT, Claude, Gemini, Perplexity, DeepSeek ve Grok'a gerçek promptlar gönderilir." },
  { title: "Marka-bilinen / keşif ayrımı", body: "Seni zaten bilenlerin sorduğu sorularla, kategoriyi araştıranların sorduğu sorular ayrı ölçülür." },
  { title: "Konu bazında kırılım", body: "\"Fiyat: ...\" gibi etiketlerle hangi konuda görünür, hangi konuda görünmez olduğunu gör." },
  { title: "Kaynak dağılımı", body: "AI motorlarının cevaplarında hangi domainleri kaynak gösterdiğini — seni, rakiplerini veya üçüncü taraf siteleri — gör." },
  { title: "Trend takibi", body: "Aynı marka için tekrar test çalıştırdıkça görünürlüğün zaman içindeki değişimini grafikte izle." },
  { title: "Prompt önerisi", body: "Marka ve rakip bilgisinden otomatik, konu etiketli prompt seti üretilir — boş kutuyla başlamazsın." },
  { title: "Türkiye pazarına özel test", body: "Türkçe promptları İngilizce eşdeğerinden ayrı test edin — aynı soru LLM'lerden dile göre farklı bir kaynak karışımıyla yanıt alabiliyor, çoğu GEO aracı bunu hiç ayırt etmiyor." },
];

export default function GeoVisibilityLandingPage() {
  return (
    <div className="space-y-10">
      <FeatureHero
        breadcrumbLabel="GEO/AEO Görünürlük"
        eyebrow="GEO/AEO VISIBILITY"
        title={<>Markanız yapay zekâya soru sorulduğunda <span className="text-accent">gerçekten görünüyor mu?</span></>}
        body="Kullanıcılar artık sadece Google'a değil, ChatGPT'ye, Claude'a, Gemini'ye ve Perplexity'e de soruyor. Epicsem'in GEO/AEO Visibility testi, markanızın bu motorlarda gerçekten anılıp anılmadığını, rakiplerinize karşı nerede durduğunuzu ve hangi kaynakların referans gösterildiğini gerçek promptlarla ölçer — geleneksel SEO araçlarının hiçbiri bunu göstermez."
        primaryCta={{ href: "/geo", label: "Ücretsiz test et" }}
        secondaryCta={{ href: "/features/seo-axo-audit", label: "SEO + AXO Audit'i incele" }}
        image={{ src: "/screenshots/geo-visibility-stats.png", alt: "Epicsem GEO/AEO Visibility sonuç ekranı — gerçek görünürlük skoru", path: "epicsem.app/geo", width: 1400, height: 171 }}
      />

      <FeatureComparison without={COMPARISON.without} withItems={COMPARISON.withItems} />

      <FeatureSteps
        heading="GEO testi nasıl çalışır?"
        subheading="Marka girmekten konu bazlı bulguya, üç adımda"
        steps={SCENARIO_STEPS}
      />

      <FeatureGrid items={FEATURES} />

      <FAQSection items={FAQ_ITEMS} />

      <FeatureCTA
        title="Markanızın AI görünürlüğünü şimdi test edin"
        body="Hesap açmadan, ücretsiz test modunda deneyebilirsiniz."
        cta={{ href: "/geo", label: "GEO testini başlat" }}
      />
    </div>
  );
}
