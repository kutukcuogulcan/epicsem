import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import ExampleScenario from "@/components/ExampleScenario";
import FAQSection from "@/components/FAQSection";

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
      <div className="space-y-4">
        <Breadcrumb items={[{ label: "Ana Sayfa", href: "/" }, { label: "Content Studio" }]} />
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight max-w-3xl">
          Kaybettiğiniz her prompt, yayına hazır bir içerik fikri olabilir.
        </h1>
        <p className="text-ink/60 text-base max-w-2xl">
          Gap Analysis&apos;in bulduğu &quot;bu sayfaların hiçbirinde anılmıyorsunuz&quot; sonuçları, Content
          Studio&apos;da gerçek verilere dayanan bir WordPress taslağına dönüşür — hiçbir istatistik uydurulmaz,
          dayanaksız bir bilgi varsa açıkça <code>[NEEDS: ...]</code> olarak işaretlenir.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/gap" className="rounded-lg bg-accent text-white px-6 py-3 text-sm font-medium hover:opacity-90 transition-opacity">
            Gap Analysis'ten başlayın
          </Link>
          <Link href="/content" className="rounded-lg border border-border bg-panel/60 px-6 py-3 text-sm font-medium hover:bg-muted transition-colors">
            Content Studio'ya git
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

      <ExampleScenario heading="Kaybedilen bir prompt, yayına hazır bir taslağa dönüşüyor" steps={SCENARIO_STEPS} />

      <FAQSection items={FAQ_ITEMS} />

      <div className="rounded-3xl bg-accent text-white px-6 sm:px-10 py-10 text-center space-y-4">
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">Bir Gap Analysis çalıştırıp ilk brief'inizi çıkarın</h2>
        <p className="text-white/80 max-w-xl mx-auto text-sm">Hesap açmadan, ücretsiz test modunda deneyebilirsiniz.</p>
        <Link href="/gap" className="inline-block rounded-lg bg-white text-accent px-6 py-3 text-sm font-medium hover:opacity-90 transition-opacity">
          Gap Analysis'i başlat
        </Link>
      </div>
    </div>
  );
}
