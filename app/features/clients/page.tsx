import FAQSection from "@/components/FAQSection";
import FeatureHero from "@/components/FeatureHero";
import FeatureGrid from "@/components/FeatureGrid";
import FeatureCTA from "@/components/FeatureCTA";
import FeatureComparison from "@/components/FeatureComparison";
import FeatureSteps from "@/components/FeatureSteps";

const COMPARISON = {
  without: {
    title: "Her koşuda yeniden yazarak",
    items: [
      "Her Audit/GEO/Gap koşusunda marka+rakip bilgisini yeniden girersiniz",
      "5-10 müşteride bu hızla zaman kaybına dönüşür",
      "Geçmiş koşuların hangi müşteriye ait olduğunu hatırlamanız gerekir",
      "PDF raporlar hep Epicsem markasıyla çıkar",
    ],
  },
  withItems: {
    title: "Epicsem Clients ile",
    items: [
      "Marka, domain ve rakip bilgisi bir kere kaydedilir",
      "Audit, GEO ve Gap koşuları otomatik dolu açılır",
      "Her koşu otomatik olarak doğru müşteriye bağlanır",
      "PDF raporda kendi ajans adınız görünür",
    ],
  },
};

export const metadata = {
  title: "Clients — Ajansınız İçin Çoklu Müşteri Yönetimi | Epicsem",
  description:
    "Her müşterinizin marka ve rakip bilgisini bir kere kaydedin, audit, GEO ve gap koşularında otomatik doldurulmuş olarak tekrar kullanın.",
};

const SCENARIO_STEPS = [
  {
    title: "Müşteri bir kere kaydedilir",
    body: "Marka adı, domain ve iki rakip /clients'a kaydedilir.",
  },
  {
    title: "Audit tek tıkla önceden dolu açılır",
    body: "Müşteri kartındaki \"Audit\" linkine tıklanınca, denetim formu domain otomatik dolu şekilde açılır.",
  },
  {
    title: "Aynı marka GEO ve Gap'te de kullanılır",
    body: "Aynı kayıt, GEO testi ve Gap Analysis linklerinde de marka/rakip bilgisini otomatik doldurur — hiçbir şey yeniden yazılmaz.",
  },
  {
    title: "Rapor kendi ajans adınızla indirilir",
    body: "Audit veya Gap'te \"Ajans adınız\" kutusuna yazılan isim, o müşteriyle ilişkilendirilmiş PDF'in üst kısmında Epicsem yerine görünür.",
  },
];

const FAQ_ITEMS = [
  {
    q: "Müşteri bilgim nerede saklanıyor?",
    a: "Kendi hesabına bağlı Postgres veritabanında, sadece senin hesabınla ilişkilendirilmiş olarak — başka Epicsem kullanıcıları göremez.",
  },
  {
    q: "Bir müşteriyi sildiğimde o müşteri için yapılmış audit/GEO sonuçları da silinir mi?",
    a: "Hayır. Kayıtlı müşteri sadece bir marka/rakip/not kısayolu — audit, GEO testi ve gap analizi sonuçları alan adına (domain) bağlı olarak ayrı saklanır ve müşteri kaydını silmek onları etkilemez.",
  },
  {
    q: "Aynı müşteriyi birden fazla araçta nasıl kullanırım?",
    a: "Bir müşteriyi kaydettikten sonra kart üzerindeki Audit, GEO test ve Gap analysis linklerine tıkladığında o aracın formu marka/domain/rakip bilgisiyle otomatik dolu açılır — yeniden yazmana gerek kalmaz.",
  },
  {
    q: "PDF raporda kendi ajans adım görünebilir mi?",
    a: "Evet. Audit veya Gap Analysis sonuç ekranında \"Ajans adınız\" kutusuna kendi ajans/marka adınızı yazmanız yeterli — indirilen PDF'in üst kısmında Epicsem yerine o isim görünür. İsim hesabınıza değil tarayıcınıza kaydedilir.",
  },
];

const FEATURES = [
  { title: "Bir kere kaydet, her yerde kullan", body: "Marka adı, domain ve rakip bilgisi Audit, GEO ve Gap Analysis'te otomatik doldurulur." },
  { title: "Notlar", body: "Hesap contact'ı, sözleşme kapsamı veya hatırlamak istediğiniz her şeyi müşteri kaydına ekleyin." },
  { title: "Sınırsız rakip", body: "Her müşteri için istediğiniz kadar rakip ekleyip karşılaştırmalarda kullanabilirsiniz." },
  { title: "Kendi hesabınıza özel", body: "Kayıtlı müşteriler yalnızca sizin hesabınızla ilişkilendirilir, başka kullanıcılar göremez." },
  { title: "Kendi markanızla PDF teslimi", body: "\"Ajans adınız\" kutusuna kendi adınızı yazın — PDF'in üst kısmında Epicsem yerine sizin adınız görünsün, müşteriye kendi ajansınızın çıktısı olarak gönderin." },
  { title: "Geçmiş tek yerde", body: "Bir müşteri için yapılan her audit, GEO testi ve gap analizi otomatik olarak o kayda bağlanır." },
];

export default function ClientsLandingPage() {
  return (
    <div className="space-y-10">
      <FeatureHero
        breadcrumbLabel="Clients"
        eyebrow="CLIENTS"
        title={<>5-10 müşteri yönetiyorsanız, marka bilgisini <span className="text-accent">her seferinde yeniden yazmayın.</span></>}
        body="Epicsem'in Clients aracı, her müşterinizin marka adını, domainini ve rakiplerini bir kere kaydetmenizi sağlar — sonraki her Audit, GEO testi ve Gap Analysis koşusunda bu bilgi otomatik doldurulmuş olarak açılır."
        primaryCta={{ href: "/clients", label: "Ücretsiz müşteri ekle" }}
        secondaryCta={{ href: "/features/seo-axo-audit", label: "Audit'i incele" }}
        image={{ src: "/screenshots/clients-form.png", alt: "Epicsem Clients — müşteri ekleme formu", path: "epicsem.app/clients", width: 1399, height: 398 }}
      />

      <FeatureComparison without={COMPARISON.without} withItems={COMPARISON.withItems} />

      <FeatureSteps
        heading="Müşteri yönetimi nasıl çalışır?"
        subheading="Bir kere kaydetmekten otomatik dolu formlara, üç adımda"
        steps={SCENARIO_STEPS}
      />

      <FeatureGrid items={FEATURES} />

      <FAQSection items={FAQ_ITEMS} />

      <FeatureCTA
        title="İlk müşterinizi şimdi kaydedin"
        body="Hesap açmadan, ücretsiz test modunda deneyebilirsiniz."
        cta={{ href: "/clients", label: "Müşteri ekle" }}
      />
    </div>
  );
}
