import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import ExampleScenario from "@/components/ExampleScenario";
import FAQSection from "@/components/FAQSection";

export const metadata = {
  title: "AXO Monitoring — AI Crawler Engellemelerini Anında Yakalayın | Epicsem",
  description:
    "robots.txt veya bir CDN/WAF güncellemesi GPTBot'u ya da ClaudeBot'u sessizce engellerse, haftalar sonra değil anında Slack'ten haberdar olun.",
};

const SCENARIO_STEPS = [
  {
    title: "Kritik sayfa izlemeye eklenir",
    body: "Müşterinin en çok trafik alan ürün sayfası /monitor'e eklenir.",
  },
  {
    title: "İlk kontrol baseline oluşturur",
    body: "\"Check now\" ile SEO 80, AXO 90, hiçbir bot engellenmemiş şeklinde bir başlangıç kaydı oluşur.",
  },
  {
    title: "Bir CDN güncellemesi robots.txt'i değiştirir",
    body: "İki hafta sonra ajans bir güvenlik kuralı ekler; bu, fark edilmeden GPTBot'u engeller.",
  },
  {
    title: "Sıradaki kontrolde engelleme yakalanır",
    body: "Bir sonraki kontrolde AXO skoru 90'dan 40'a düşer ve GPTBot \"Blocked\" olarak işaretlenir — Slack'e anında bildirim gider.",
  },
  {
    title: "Sorun görünürlük düşmeden çözülür",
    body: "Ajans, müşteri fark etmeden robots.txt'i geri düzeltir — AI görünürlüğünde haftalar sonra fark edilecek bir düşüş hiç yaşanmaz.",
  },
];

const FAQ_ITEMS = [
  {
    q: "Ne sıklıkla kontrol ediliyor, otomatik mi?",
    a: "Arayüzden istediğin an \"Check now\" ile manuel tetikleyebilirsin. Otomatik, zamanlanmış kontrol için kendi cron job'unu scripts/check-monitors.mjs ve bir CRON_SECRET ile kurabilirsin — bu, /api/monitor/check'i tüm kullanıcıların izlenen sayfaları için tek seferde tarar.",
  },
  {
    q: "Bir engelleme tespit edilince ne oluyor?",
    a: "Daha önce izinli olan bir AI crawler robots.txt'te engellenmişse, sayfaya özel bir Slack webhook'una (yoksa .env'deki varsayılana) anında bildirim gider ve site içinde \"Active alerts\" olarak da görünür.",
  },
  {
    q: "Trend grafiğini görmek için kaç kontrol gerekiyor?",
    a: "En az 2 kayıtlı kontrol gerekiyor. Farklı günlerde birkaç kez \"Check now\" çalıştırdıkça SEO ve AXO skorlarının zaman içindeki değişimini gösteren bir çizgi grafik açılıyor.",
  },
];

const FEATURES = [
  { title: "Sürekli izleme", body: "Kritik sayfalarınızı bir kere ekleyin, arkasında çalışsın — elle her seferinde kontrol etmenize gerek kalmaz." },
  { title: "Slack anlık bildirim", body: "Daha önce izinli bir AI crawler engellenirse, sayfaya özel veya varsayılan webhook'a anında bildirim gider." },
  { title: "SEO/AXO trend grafiği", body: "En az 2 kontroldan sonra skorların zaman içindeki değişimini çizgi grafikte görün." },
  { title: "Sayfa başına özel webhook", body: "Her izlenen sayfaya kendi Slack webhook'unu tanımlayabilirsiniz." },
  { title: "Aktif uyarı listesi", body: "Tüm tespit edilen engellemeler, onaylanana kadar \"Active alerts\" olarak panelde görünür kalır." },
  { title: "Müşteri sitelerinde kritik", body: "Siteyi siz yönetmiyorsanız, bir engellemeyi müşterinizden önce fark edip haber vermiş olursunuz." },
];

export default function AxoMonitoringLandingPage() {
  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <Breadcrumb items={[{ label: "Ana Sayfa", href: "/" }, { label: "AXO Monitoring" }]} />
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight max-w-3xl">
          Bir robots.txt değişikliği AI görünürlüğünüzü sessizce sıfırlayabilir.
        </h1>
        <p className="text-ink/60 text-base max-w-2xl">
          robots.txt ve CDN bot-engelleme kuralları sessizce değişebilir — bir WAF güncellemesi, bir CDN varsayılanı.
          Epicsem&apos;in AXO Monitoring&apos;i kritik sayfalarınızı zamanla izler ve daha önce izinli olan bir AI
          crawler engellenirse, haftalar sonra bir görünürlük düşüşünden değil anında Slack&apos;ten haberdar olursunuz.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/monitor" className="rounded-lg bg-accent text-white px-6 py-3 text-sm font-medium hover:opacity-90 transition-opacity">
            Ücretsiz izlemeye başla
          </Link>
          <Link href="/features/seo-axo-audit" className="rounded-lg border border-border bg-panel/60 px-6 py-3 text-sm font-medium hover:bg-muted transition-colors">
            SEO + AXO Audit&apos;i incele
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

      <ExampleScenario heading="Bir müşteri sitesinde sessiz bir engelleme yakalanıyor" steps={SCENARIO_STEPS} />

      <FAQSection items={FAQ_ITEMS} />

      <div className="rounded-3xl bg-accent text-white px-6 sm:px-10 py-10 text-center space-y-4">
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">Kritik sayfalarınızı şimdi izlemeye alın</h2>
        <p className="text-white/80 max-w-xl mx-auto text-sm">Hesap açmadan, ücretsiz test modunda deneyebilirsiniz.</p>
        <Link href="/monitor" className="inline-block rounded-lg bg-white text-accent px-6 py-3 text-sm font-medium hover:opacity-90 transition-opacity">
          İzlemeyi başlat
        </Link>
      </div>
    </div>
  );
}
