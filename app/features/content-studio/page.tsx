import ExampleScenario from "@/components/ExampleScenario";
import FAQSection from "@/components/FAQSection";
import FeatureHero from "@/components/FeatureHero";
import FeatureGrid from "@/components/FeatureGrid";
import FeatureCTA from "@/components/FeatureCTA";

export const metadata = {
  title: "Content Studio — Kaybedilen Promptlardan Yayına Hazır İçerik | Epicsem",
  description:
    "Gap Analysis'in bulduğu içerik boşluklarını, gerçek verilere dayanan WordPress taslaklarına dönüştürün — hiçbir istatistik uydurulmaz.",
};

const SCENARIO_STEPS = [
  {
    title: "Gap Analysis bir boşluk bulur",
    body: "\"En iyi mobilya markaları hangileri?\" promptunda hiçbir sayfa anılmıyor bulgusu content brief'e dönüşür.",
  },
  {
    title: "\"Generate article\" tıklanır",
    body: "Brief, Content Studio'ya gönderilir ve taslak otomatik oluşturulur.",
  },
  {
    title: "Uydurma yerine [NEEDS: ...] işaretlenir",
    body: "Modelin dayanak bulamadığı bir istatistik varsa, onu uydurmak yerine açıkça [NEEDS: gerçek rakam] olarak bırakılır.",
  },
  {
    title: "İnsan incelemesi yapılır",
    body: "Taslak, [NEEDS: ...] alanları doldurulup gözden geçirilir.",
  },
  {
    title: "WordPress taslağı olarak yayınlanır",
    body: "\"Publish as WordPress draft\" ile içerik canlıya değil, WordPress'te bir taslak olarak gönderilir — yayına alma kararı kullanıcıya kalır.",
  },
];

const FAQ_ITEMS = [
  {
    q: "İçerik uyduruluyor mu, nereden geliyor?",
    a: "Hayır. Her taslak sadece Gap Analysis'teki gerçek bir content brief'e dayanır. Modelin dayanak bulamadığı bir bilgi varsa, onu uydurmak yerine açıkça [NEEDS: ...] şeklinde işaretleyip sana bırakır.",
  },
  {
    q: "Yayınladığımda direkt canlıya mı çıkıyor?",
    a: "Hayır — yayınlama her zaman WordPress'te bir taslak (draft) oluşturur, asla otomatik yayına almaz. İncelemeyi ve yayına alma kararını sen WordPress üzerinden veriyorsun.",
  },
  {
    q: "Birden fazla müşterinin WordPress'ine bağlanabilir miyim?",
    a: "Evet — her müşteri için ayrı bir bağlantı (site adresi, kullanıcı adı, application password) kaydedebilir, taslağı yayınlarken hangi bağlantıyı kullanacağını seçebilirsin.",
  },
  {
    q: "Aylık kaç içerik üretebilirim?",
    a: "Ücretsiz planda ayda 20 içerik üretimi hakkın var. Demo modda (API anahtarı tanımlı değilken) üretim bu kotadan düşmez.",
  },
];

const FEATURES = [
  { title: "Gap Analysis'ten otomatik brief", body: "Kaybedilen promptlar, doğrudan bir content brief'e ve oradan taslağa dönüşür." },
  { title: "Uydurma yok, [NEEDS: ...] var", body: "Model dayanak bulamadığı bir bilgiyi uydurmaz, açıkça işaretleyip insana bırakır." },
  { title: "WordPress taslağı, asla canlı değil", body: "Yayınlama her zaman bir draft oluşturur — yayına alma kararı her zaman sizde." },
  { title: "Çoklu müşteri WordPress bağlantısı", body: "Her müşteri için ayrı bir WordPress bağlantısı kaydedip taslağı doğru siteye gönderin." },
  { title: "Bağlantı testi", body: "Yayınlamadan önce \"Test connection\" ile WordPress kimlik bilgilerinizi doğrulayın." },
  { title: "Ayda 20 içerik", body: "Ücretsiz planda aylık 20 içerik üretim hakkı — demo modda kotadan düşmez." },
];

export default function ContentStudioLandingPage() {
  return (
    <div className="space-y-10">
      <FeatureHero
        breadcrumbLabel="Content Studio"
        eyebrow="CONTENT STUDIO"
        title={<>Kaybettiğiniz her prompt, <span className="text-accent">yayına hazır bir içerik fikri</span> olabilir.</>}
        body={<>Gap Analysis&apos;in bulduğu &quot;bu sayfaların hiçbirinde anılmıyorsunuz&quot; sonuçları, Content Studio&apos;da gerçek verilere dayanan bir WordPress veya Shopify taslağına dönüşür — hiçbir istatistik uydurulmaz, dayanaksız bir bilgi varsa açıkça <code>[NEEDS: ...]</code> olarak işaretlenir.</>}
        primaryCta={{ href: "/gap", label: "Gap Analysis'ten başlayın" }}
        secondaryCta={{ href: "/content", label: "Content Studio'ya git" }}
        image={{ src: "/screenshots/content-studio-form.png", alt: "Epicsem Content Studio — CMS bağlantı formu", path: "epicsem.app/content", width: 1399, height: 423 }}
      />

      <FeatureGrid items={FEATURES} />

      <ExampleScenario heading="Kaybedilen bir prompt, yayına hazır bir taslağa dönüşüyor" steps={SCENARIO_STEPS} />

      <FAQSection items={FAQ_ITEMS} />

      <FeatureCTA
        title="Bir Gap Analysis çalıştırıp ilk brief'inizi çıkarın"
        body="Hesap açmadan, ücretsiz test modunda deneyebilirsiniz."
        cta={{ href: "/gap", label: "Gap Analysis'i başlat" }}
      />
    </div>
  );
}
