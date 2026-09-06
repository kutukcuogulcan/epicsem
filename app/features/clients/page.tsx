import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import ExampleScenario from "@/components/ExampleScenario";
import FAQSection from "@/components/FAQSection";

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
    title: "Rapor müşteri adına indirilir",
    body: "Her koşudan sonra Epicsem markalı PDF, o müşteriyle ilişkilendirilmiş olarak indirilir.",
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
];

const FEATURES = [
  { title: "Bir kere kaydet, her yerde kullan", body: "Marka adı, domain ve rakip bilgisi Audit, GEO ve Gap Analysis'te otomatik doldurulur." },
  { title: "Notlar", body: "Hesap contact'ı, sözleşme kapsamı veya hatırlamak istediğiniz her şeyi müşteri kaydına ekleyin." },
  { title: "Sınırsız rakip", body: "Her müşteri için istediğiniz kadar rakip ekleyip karşılaştırmalarda kullanabilirsiniz." },
  { title: "Kendi hesabınıza özel", body: "Kayıtlı müşteriler yalnızca sizin hesabınızla ilişkilendirilir, başka kullanıcılar göremez." },
  { title: "Markalı PDF ile teslim", body: "Her koşudan Epicsem markalı bir PDF üretip müşterinize kendi ajansınızın çıktısı olarak gönderin." },
  { title: "Geçmiş tek yerde", body: "Bir müşteri için yapılan her audit, GEO testi ve gap analizi otomatik olarak o kayda bağlanır." },
];

export default function ClientsLandingPage() {
  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <Breadcrumb items={[{ label: "Ana Sayfa", href: "/" }, { label: "Clients" }]} />
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight max-w-3xl">
          5-10 müşteri yönetiyorsanız, marka bilgisini her seferinde yeniden yazmayın.
        </h1>
        <p className="text-ink/60 text-base max-w-2xl">
          Epicsem&apos;in Clients aracı, her müşterinizin marka adını, domainini ve rakiplerini bir kere kaydetmenizi
          sağlar — sonraki her Audit, GEO testi ve Gap Analysis koşusunda bu bilgi otomatik doldurulmuş olarak açılır.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/clients" className="rounded-lg bg-accent text-white px-6 py-3 text-sm font-medium hover:opacity-90 transition-opacity">
            Ücretsiz müşteri ekle
          </Link>
          <Link href="/features/seo-axo-audit" className="rounded-lg border border-border bg-panel/60 px-6 py-3 text-sm font-medium hover:bg-muted transition-colors">
            Audit'i incele
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FEATURES.map((f) => (
          <div key={f.title} className="card">
            <div className="font-medium text-sm">{f.title}</div>
            <p className="mt-1.5 text-sm text-ink/60">{f.body}</p>
          </div>
        ))}
      </div>

      <ExampleScenario heading="Bir ajans 5 müşteriyi tek panelde yönetiyor" steps={SCENARIO_STEPS} />

      <FAQSection items={FAQ_ITEMS} />

      <div className="rounded-3xl bg-accent text-white px-6 sm:px-10 py-10 text-center space-y-4">
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">İlk müşterinizi şimdi kaydedin</h2>
        <p className="text-white/80 max-w-xl mx-auto text-sm">Hesap açmadan, ücretsiz test modunda deneyebilirsiniz.</p>
        <Link href="/clients" className="inline-block rounded-lg bg-white text-accent px-6 py-3 text-sm font-medium hover:opacity-90 transition-opacity">
          Müşteri ekle
        </Link>
      </div>
    </div>
  );
}
