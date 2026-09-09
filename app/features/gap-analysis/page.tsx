import FAQSection from "@/components/FAQSection";
import FeatureHero from "@/components/FeatureHero";
import FeatureGrid from "@/components/FeatureGrid";
import FeatureCTA from "@/components/FeatureCTA";
import FeatureComparison from "@/components/FeatureComparison";
import FeatureSteps from "@/components/FeatureSteps";

const COMPARISON = {
  without: {
    title: "Audit ve GEO'yu ayrı okuyunca",
    items: [
      "Bir sayfa teknik olarak sağlam mı, ayrı görürsünüz",
      "Bir sayfa AI'da anılıyor mu, ayrı görürsünüz",
      "İkisini aynı satırda birleştirmek elle, sayfa sayfa yapılır",
      "\"Sağlam ama görünmez\" sayfalar gözden kaçar",
    ],
  },
  withItems: {
    title: "Epicsem Gap Analysis ile",
    items: [
      "Audit + GEO sonucu her sayfa için tek satırda",
      "Blocked / Invisible / Cited / Needs work etiketi otomatik",
      "\"Sağlam ama görünmez\" sayfalar tek bakışta listelenir",
      "Kaybedilen promptlardan otomatik content brief üretilir",
    ],
  },
};

export const metadata = {
  title: "Gap Analysis — Sağlam Ama AI'da Görünmeyen Sayfalarınızı Bulun | Epicsem",
  description:
    "SEO + AXO denetimini GEO görünürlük testiyle çaprazlayın: hangi sayfalarınız teknik olarak sağlam ama hiçbir AI motorunda anılmıyor? Ücretsiz test edin.",
};

const SCENARIO_STEPS = [
  {
    title: "Marka, rakip ve sayfa URL'leri girilir",
    body: "Marka bilgisi, promptlar ve denetlenecek sayfa URL'leri (ör. ana sayfa ve en çok trafik alan blog yazısı) girilir.",
  },
  {
    title: "Audit + GEO aynı anda çaprazlanır",
    body: "Her sayfa için teknik SEO/AXO skoru ile GEO testinin o sayfayı gerçekten anıp anmadığı aynı tabloda birleştirilir.",
  },
  {
    title: "\"Strong but invisible\" etiketi çıkar",
    body: "Bir blog yazısı teknik olarak sağlam, hiçbir crawler engellenmemiş, ama hiçbir AI yanıtında anılmıyor — \"Invisible\" olarak işaretlenir.",
  },
  {
    title: "Content brief otomatik üretilir",
    body: "Sayfanın kaybettiği promptlar somut başlık/FAQ önerilerine çevrilir.",
  },
  {
    title: "Content Studio'ya gönderilir",
    body: "\"Generate article\" ile brief, Content Studio'da bir WordPress taslağına dönüşür.",
  },
];

const FAQ_ITEMS = [
  {
    q: "Gap Analysis tam olarak neyi karşılaştırıyor?",
    a: "Her sayfa için Audit'in ölçtüğü teknik sağlamlığı ve AI crawler erişimini, GEO testinin o sayfayı gerçekten anıp anmadığıyla çaprazlar. Yalnız birini okuduğunda göremeyeceğin şeyi gösterir: teknik olarak sağlam ama hiç anılmayan bir sayfa.",
  },
  {
    q: "\"Blocked\", \"Invisible\", \"Cited\", \"Needs work\" etiketleri ne anlama geliyor?",
    a: "Blocked: sayfa AI crawler'lara kapalı. Invisible: teknik olarak sağlam ve erişilebilir ama hiçbir AI yanıtında anılmıyor. Cited: en az bir AI yanıtında anılıyor. Needs work: kısmi teknik veya erişim sorunları var.",
  },
  {
    q: "İçerik brief'leri (Content Briefs) nereden geliyor?",
    a: "Girdiğin promptlardan hangilerinin hiçbir sayfanı bulamadığını tespit edip, o kaybedilen promptları somut bir başlık/FAQ önerisine çeviriyor. Buradan \"Generate article\" ile Content Studio'da bir WordPress taslağına dönüştürebilirsin.",
  },
  {
    q: "Audit ve GEO'yu ayrı ayrı çalıştırmak yetmez mi?",
    a: "Ayrı ayrı okuduğunda ikisi de yarım bir cevap verir: Audit \"teknik olarak sağlam\" der, GEO \"anılıyor mu\" der. Gap Analysis ikisini aynı satırda birleştirip asıl soruyu cevaplar: sağlam olduğu halde neden anılmıyor?",
  },
];

const FEATURES = [
  { title: "Audit + GEO tek tabloda", body: "Teknik sağlamlık ve gerçek AI anılma durumu, sayfa sayfa aynı satırda karşılaştırılır." },
  { title: "4 net verdict etiketi", body: "Blocked, Invisible, Cited, Needs work — her sayfanın durumu tek bakışta anlaşılır." },
  { title: "Otomatik content brief", body: "Kaybedilen promptlar, somut başlık ve FAQ önerilerine çevrilir — uydurma değil, bu koşunun kendi verisinden." },
  { title: "Content Studio entegrasyonu", body: "\"Generate article\" ile brief tek tıkla bir WordPress taslağına dönüşür." },
  { title: "Kendi markanızla PDF rapor", body: "\"Ajans adınız\" kutusuna adınızı yazın — gap matrix ve content brief'ler, sizin adınızın göründüğü bir PDF olarak müşteriyle paylaşılsın." },
  { title: "Gerçek 4 motorla test", body: "ChatGPT, Claude, Gemini ve Perplexity'e gerçek promptlar gönderilir." },
];

export default function GapAnalysisLandingPage() {
  return (
    <div className="space-y-10">
      <FeatureHero
        breadcrumbLabel="Gap Analysis"
        eyebrow="GAP ANALYSIS"
        title={<>Sitenizde teknik olarak sağlam ama <span className="text-accent">AI&apos;da hiç anılmayan</span> sayfalar var mı?</>}
        body="Audit &quot;teknik olarak sağlam&quot; der, GEO testi &quot;anılıyor mu&quot; der — ama ikisini ayrı ayrı okuduğunuzda asıl soruyu cevaplayamazsınız. Epicsem'in Gap Analysis'i, her sayfanız için ikisini aynı satırda birleştirir ve sağlam olduğu halde neden anılmadığını gösterir."
        primaryCta={{ href: "/gap", label: "Ücretsiz analiz yap" }}
        secondaryCta={{ href: "/features/content-studio", label: "Content Studio'yu incele" }}
        image={{ src: "/screenshots/gap-analysis-form.png", alt: "Epicsem Gap Analysis formu — marka, rakip ve prompt girişi", path: "epicsem.app/gap", width: 1399, height: 534 }}
      />

      <FeatureComparison without={COMPARISON.without} withItems={COMPARISON.withItems} />

      <FeatureSteps
        heading="Gap Analysis nasıl çalışır?"
        subheading="Marka girmekten content brief'e, üç adımda"
        steps={SCENARIO_STEPS}
      />

      <FeatureGrid items={FEATURES} />

      <FAQSection items={FAQ_ITEMS} />

      <FeatureCTA
        title="Görünmez sayfalarınızı şimdi bulun"
        body="Hesap açmadan, ücretsiz test modunda deneyebilirsiniz."
        cta={{ href: "/gap", label: "Gap Analysis'i başlat" }}
      />
    </div>
  );
}
