import Breadcrumb from "@/components/Breadcrumb";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

export const metadata = {
  title: "Kullanım Şartları — Epicsem",
  description: "Epicsem'i kullanırken geçerli olan şartlar — hizmetin kapsamı, sorumluluklar ve sınırlamalar.",
};

const SECTIONS = [
  {
    title: "1. Şartların kabulü",
    body: (
      <p>
        {SITE_NAME}&apos;i kullanarak bu şartları kabul etmiş olursunuz. Kabul etmiyorsanız hizmeti kullanmayın.
      </p>
    ),
  },
  {
    title: "2. Hizmetin tanımı",
    body: (
      <p>
        {SITE_NAME} şu an test aşamasındadır ve tüm özellikleriyle ücretsiz sunulmaktadır. Test süreci bittiğinde
        ücretli planlar devreye girebilir; bu durumda mevcut kullanıcılar önceden bilgilendirilir. Hizmet
        &quot;olduğu gibi&quot; sunulur — kesintisiz veya hatasız çalışacağı garanti edilmez.
      </p>
    ),
  },
  {
    title: "3. Hesabınız",
    body: (
      <p>
        Hesap bilgilerinizin (e-posta, şifre) gizliliğinden ve hesabınız üzerinden yapılan işlemlerden siz
        sorumlusunuz. Hesabınızla ilgili yetkisiz bir kullanım fark ederseniz bize bildirin.
      </p>
    ),
  },
  {
    title: "4. Kabul edilebilir kullanım",
    body: (
      <>
        <p>Şunları yapmamayı kabul edersiniz:</p>
        <p>
          Hizmeti başka bir siteye zarar verecek şekilde (aşırı otomatik istek, kazıma/scraping saldırısı gibi)
          kullanmak; sahibi olmadığınız veya denetleme izniniz olmayan bir domaini kötü niyetle analiz etmek; aylık
          kullanım kotalarını veya rate limit&apos;leri aşmaya çalışan otomatik araçlar kullanmak; hizmeti yasa dışı
          bir amaçla kullanmak.
        </p>
      </>
    ),
  },
  {
    title: "5. Yapay zeka çıktıları hakkında",
    body: (
      <p>
        GEO/AEO testleri, Article Writer ve Content Studio gibi araçlar üçüncü taraf yapay zeka modellerinden
        (OpenAI, Anthropic, Google, Perplexity, DeepSeek, xAI) yanıt alır. Bu yanıtların doğruluğu, güncelliği veya
        eksiksizliği garanti edilmez — üretilen içerik taslakları, schema önerileri ve fix prompt&apos;ları her zaman
        yayınlamadan önce sizin tarafınızdan gözden geçirilmelidir. {SITE_NAME} bu içeriklerin kullanımından doğacak
        sonuçlardan sorumlu tutulamaz.
      </p>
    ),
  },
  {
    title: "6. Fikri mülkiyet",
    body: (
      <p>
        {SITE_NAME}&apos;in kendi arayüzü, kodu ve tasarımı bize aittir. Sizin girdiğiniz veriler (marka bilgisi,
        promptlar, içerik taslakları) size aittir; hizmeti size sağlamak dışında bir amaçla kullanılmaz.
      </p>
    ),
  },
  {
    title: "7. Sorumluluğun sınırlanması",
    body: (
      <p>
        Yasaların izin verdiği azami ölçüde, {SITE_NAME} hizmetin kullanımından veya kullanılamamasından doğan
        dolaylı, arızi veya sonuç niteliğindeki zararlardan sorumlu değildir.
      </p>
    ),
  },
  {
    title: "8. Hesap feshi",
    body: (
      <p>
        Bu şartları ihlal ettiğinizi tespit edersek hesabınızı askıya alabilir veya kapatabiliriz. Siz de
        istediğiniz zaman hesabınızın silinmesini talep edebilirsiniz.
      </p>
    ),
  },
  {
    title: "9. Değişiklikler",
    body: <p>Bu şartlar zaman zaman güncellenebilir; önemli değişikliklerde bu sayfa üzerinden bilgilendirme yapılır.</p>,
  },
  {
    title: "10. İletişim",
    body: (
      <p>
        Sorularınız için: <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:underline">{CONTACT_EMAIL}</a>
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <div className="space-y-8 max-w-3xl">
      <div className="space-y-2">
        <Breadcrumb items={[{ label: "Ana Sayfa", href: "/" }, { label: "Kullanım Şartları" }]} />
        <h1 className="text-3xl font-extrabold tracking-tight">Kullanım Şartları</h1>
        <p className="text-ink/40 text-xs">Son güncelleme: bu sayfa {SITE_NAME} test aşamasındayken hazırlanmıştır.</p>
      </div>

      <div className="card border-warn/40 text-sm text-ink/70">
        <strong className="text-warn">Taslak metin.</strong> Bir hukuk danışmanı tarafından gözden geçirilmedi —
        gerçek kullanıcılara açmadan önce bir avukata gösterilmesi önerilir. İletişim e-postası da bir yer
        tutucudur — {CONTACT_EMAIL} gerçek bir destek adresiyle değiştirilmelidir.
      </div>

      <div className="space-y-6">
        {SECTIONS.map((s) => (
          <section key={s.title} className="space-y-2">
            <h2 className="font-bold text-lg">{s.title}</h2>
            <div className="text-sm text-ink/60 space-y-2">{s.body}</div>
          </section>
        ))}
      </div>
    </div>
  );
}
