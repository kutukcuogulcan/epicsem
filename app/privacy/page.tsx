import Breadcrumb from "@/components/Breadcrumb";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

export const metadata = {
  title: "Gizlilik Politikası — Epicsem",
  description: "Epicsem'in hangi verileri topladığı, neden topladığı ve üçüncü taraflarla ne zaman paylaştığı.",
};

const SECTIONS = [
  {
    title: "1. Hangi verileri topluyoruz",
    body: (
      <>
        <p>Hesap oluşturduğunuzda: e-posta adresiniz ve şifrenizin hash&apos;i (şifrenizin kendisi hiçbir zaman düz metin olarak saklanmaz).</p>
        <p>
          Araçları kullandığınızda: girdiğiniz marka adı, domain, rakip domainleri, test promptları, denetim/GEO
          sonuçları, içerik taslakları ve müşteri kayıtları (Clients) — bunların hepsi hesabınızla ilişkilendirilerek
          veritabanında saklanır.
        </p>
        <p>Kullanım verisi: hangi aracı ne sıklıkla kullandığınıza dair sayaçlar (aylık kota takibi için).</p>
        <p>
          WordPress/Shopify bağlantısı eklerseniz: girdiğiniz site adresi ve API kimlik bilgileri (uygulama parolası /
          erişim token&apos;ı) — bu bilgiler şifrelenmiş biçimde saklanır ve arayüzde maskelenmiş olarak gösterilir.
        </p>
      </>
    ),
  },
  {
    title: "2. Verilerinizi neden topluyoruz",
    body: (
      <p>
        Yalnızca talep ettiğiniz hizmeti sağlamak için: denetim çalıştırmak, GEO/AEO testlerini yürütmek, önceki
        koşularla karşılaştırma yapabilmeniz için geçmişi saklamak, ve hesabınızın aylık kullanım kotasını takip
        etmek. Verileriniz reklam hedeflemesi için kullanılmaz ve satılmaz — bu sitede reklam yayınlanmaz.
      </p>
    ),
  },
  {
    title: "3. Üçüncü taraflarla paylaşım",
    body: (
      <>
        <p>
          GEO/AEO Visibility, Article Writer ve Content Studio gibi araçlar çalıştığında, girdiğiniz prompt&apos;lar
          veya taranan sayfa içeriği — o an hesabınıza bağlı yapay zeka sağlayıcılarına (OpenAI, Anthropic, Google,
          Perplexity, DeepSeek ve/veya xAI, hangisi etkinse) gönderilir. Bu sağlayıcılar kendi gizlilik politikalarına
          tabidir; gönderilen veri yalnızca o isteğe yanıt üretmek içindir.
        </p>
        <p>
          WordPress/Shopify bağlantısı kaydettiyseniz, yalnızca siz bir taslağı yayınlamayı seçtiğinizde o platforma
          içerik gönderilir — otomatik/isteğiniz dışında hiçbir paylaşım yapılmaz.
        </p>
        <p>Verileriniz başka hiçbir üçüncü tarafla paylaşılmaz, kiralanmaz veya satılmaz.</p>
      </>
    ),
  },
  {
    title: "4. Çerezler",
    body: (
      <p>
        Yalnızca oturumunuzu açık tutmak için gerekli olan bir kimlik doğrulama çerezi kullanılır. Reklam veya
        izleme amaçlı üçüncü taraf çerezi kullanılmaz.
      </p>
    ),
  },
  {
    title: "5. Veri saklama süresi",
    body: (
      <p>
        Verileriniz hesabınız aktif olduğu sürece saklanır. Hesabınızın silinmesini talep ederseniz, hesabınıza
        bağlı tüm veriler (denetim geçmişi, kaydedilen müşteriler, CMS bağlantıları) makul bir süre içinde kalıcı
        olarak silinir.
      </p>
    ),
  },
  {
    title: "6. Haklarınız",
    body: (
      <p>
        Hesabınızla ilişkili verilere erişim, bunların düzeltilmesi veya silinmesi talebinde bulunma hakkına
        sahipsiniz. Bu taleplerinizi aşağıdaki iletişim adresinden iletebilirsiniz.
      </p>
    ),
  },
  {
    title: "7. Veri güvenliği",
    body: (
      <p>
        Şifreler hash&apos;lenerek, CMS erişim bilgileri şifrelenerek saklanır. Yine de internet üzerinden hiçbir
        aktarım veya saklama yönteminin %100 güvenli olduğu garanti edilemez.
      </p>
    ),
  },
  {
    title: "8. Çocukların gizliliği",
    body: <p>Bu hizmet 18 yaş altındaki kişilere yönelik değildir ve bilerek onlardan veri toplanmaz.</p>,
  },
  {
    title: "9. Bu politikadaki değişiklikler",
    body: (
      <p>
        Bu politika zaman zaman güncellenebilir. Önemli değişikliklerde bu sayfa üzerinden bilgilendirme yapılır.
      </p>
    ),
  },
  {
    title: "10. İletişim",
    body: (
      <p>
        Veri gizliliğiyle ilgili sorularınız için: <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:underline">{CONTACT_EMAIL}</a>
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <div className="space-y-8 max-w-3xl">
      <div className="space-y-2">
        <Breadcrumb items={[{ label: "Ana Sayfa", href: "/" }, { label: "Gizlilik Politikası" }]} />
        <h1 className="text-3xl font-extrabold tracking-tight">Gizlilik Politikası</h1>
        <p className="text-ink/40 text-xs">Son güncelleme: bu sayfa {SITE_NAME} test aşamasındayken hazırlanmıştır.</p>
      </div>

      <div className="card border-warn/40 text-sm text-ink/70">
        <strong className="text-warn">Taslak metin.</strong> Bu sayfa {SITE_NAME}&apos;in gerçekte topladığı verileri
        ve kullanım amaçlarını dürüstçe anlatır, ancak bir hukuk danışmanı tarafından gözden geçirilmedi. Gerçek
        kullanıcılardan veri toplamaya başlamadan önce (özellikle KVKK/GDPR kapsamında) bir avukata gösterilmesi
        önerilir. İletişim e-postası da bir yer tutucudur — {CONTACT_EMAIL} gerçek bir destek adresiyle
        değiştirilmelidir.
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
