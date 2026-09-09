import ExampleScenario from "@/components/ExampleScenario";
import FAQSection from "@/components/FAQSection";
import FeatureHero from "@/components/FeatureHero";
import FeatureGrid from "@/components/FeatureGrid";
import FeatureCTA from "@/components/FeatureCTA";

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
      <FeatureHero
        breadcrumbLabel="AXO Monitoring"
        eyebrow="AXO MONITORING"
        title={<>Bir robots.txt değişikliği AI görünürlüğünüzü <span className="text-accent">sessizce sıfırlayabilir.</span></>}
        body="robots.txt ve CDN bot-engelleme kuralları sessizce değişebilir — bir WAF güncellemesi, bir CDN varsayılanı. Epicsem'in AXO Monitoring'i kritik sayfalarınızı zamanla izler ve daha önce izinli olan bir AI crawler engellenirse, haftalar sonra bir görünürlük düşüşünden değil anında Slack'ten haberdar olursunuz."
        primaryCta={{ href: "/monitor", label: "Ücretsiz izlemeye başla" }}
        secondaryCta={{ href: "/features/seo-axo-audit", label: "SEO + AXO Audit'i incele" }}
        image={{ src: "/screenshots/axo-monitoring-form.png", alt: "Epicsem AXO Monitoring — izlenecek sayfa ekleme formu", path: "epicsem.app/monitor", width: 1399, height: 198 }}
      />

      <FeatureGrid items={FEATURES} />

      <ExampleScenario heading="Bir müşteri sitesinde sessiz bir engelleme yakalanıyor" steps={SCENARIO_STEPS} />

      <FAQSection items={FAQ_ITEMS} />

      <FeatureCTA
        title="Kritik sayfalarınızı şimdi izlemeye alın"
        body="Hesap açmadan, ücretsiz test modunda deneyebilirsiniz."
        cta={{ href: "/monitor", label: "İzlemeyi başlat" }}
      />
    </div>
  );
}
