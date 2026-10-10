import FAQSection from "@/components/FAQSection";
import FeatureHero from "@/components/FeatureHero";
import FeatureGrid from "@/components/FeatureGrid";
import FeatureCTA from "@/components/FeatureCTA";
import FeatureComparison from "@/components/FeatureComparison";
import FeatureSteps from "@/components/FeatureSteps";
import AiAnswerDemo from "@/components/marketing/AiAnswerDemo";

const COMPARISON = {
  without: {
    title: "Tek tek URL taramayla",
    items: [
      "Yüzlerce sayfayı tek tek /audit'e girmeniz gerekir",
      "Site genelinde ortak sorunları görmek zor",
      "Hangi sayfanın hangi kategoriye girdiğini elle gruplamanız gerekir",
      "Ayrı bir masaüstü crawler'ı kurup çıktısını yorumlamanız gerekir",
    ],
  },
  withItems: {
    title: "Epicsem Site Taraması ile",
    items: [
      "Sadece alan adını yazın, tüm site otomatik taransın",
      "13 sorun kategorisi tüm site genelinde otomatik çıkar",
      "Sorun tipine göre filtrelenebilir özet tablo",
      "Kategoriye göre gruplanmış tek fix prompt'u",
    ],
  },
};

export const metadata = {
  title: "Site Taraması — Tüm Sitenizin SEO Sorunlarını Tek Seferde Görün | Epicsem",
  description:
    "Sadece alan adını yazın: Epicsem tüm sitenizi tarar, eksik meta, kırık link, thin content ve noindex sorunlarını site genelinde tek panoda gösterir.",
};

const SCENARIO_STEPS = [
  {
    title: "Sadece site adresi yazılır",
    body: "Kurulum, eklenti ya da masaüstü programı yok — alan adını yazıp \"Siteyi tara\"ya basmak yeterli.",
  },
  {
    title: "Epicsem tüm siteyi kendisi tarar",
    body: "robots.txt ve sitemap'ler okunur, iç linkler takip edilir; her sayfanın durum kodu, title'ı, meta açıklaması, H1'leri, kelime sayısı, canonical ve noindex bilgisi toplanır.",
  },
  {
    title: "Site genelinde sorunlar tek seferde çıkar",
    body: "12 sayfada eksik meta açıklaması, 3 sayfada kırık link, 5 sayfada thin content tespit edilir — hepsi grafikli tek bir panoda.",
  },
  {
    title: "Fix prompt'u kategoriye göre gruplanır",
    body: "\"Fix with Claude Code\" ile her sorun kategorisi için örnek URL'li bir prompt üretilir.",
  },
  {
    title: "Düzelt, tekrar tara, farkı gör",
    body: "Düzeltmelerden sonra aynı siteyi yeniden tara — pano, sorun sayısının taramadan taramaya nasıl düştüğünü gösterir.",
  },
];

const FAQ_ITEMS = [
  {
    q: "Ek bir program ya da dosya gerekiyor mu?",
    a: "Hayır. Epicsem siteyi kendi tarayıcısıyla tarar: robots.txt ve sitemap'leri okur, iç linkleri takip eder. Sadece alan adını yazman yeterli.",
  },
  {
    q: "Kaç sayfa taranıyor?",
    a: "Tarama başına 50, 150 ya da 300 sayfa seçebilirsin. Büyük sitelerde sitemap'teki sayfalar önceliklidir; süre sınırına takılan taramalar \"kısmi\" olarak işaretlenir.",
  },
  {
    q: "Bunun Audit'ten farkı ne?",
    a: "Audit tek bir URL'yi derinlemesine (SEO + AI erişimi) inceler. Site Taraması ise tüm siteyi gezip eksik/tekrarlayan title ve meta açıklaması, thin content, kırık link, eksik H1 ve noindex sayfaları site genelinde tek panoda gösterir.",
  },
  {
    q: "Bulunan sorunları nasıl düzeltirim?",
    a: "\"Fix with Claude Code\" ile her sorun kategorisine göre gruplanmış, örnek URL'li bir prompt üretilir — bunu kendi site kodun/deposu üzerinde çalışan Claude Code'a yapıştırıp toplu düzeltebilirsin.",
  },
];

const FEATURES = [
  { title: "Kurulumsuz tüm-site taraması", body: "Sitemap ve iç linkler üzerinden yüzlerce sayfa otomatik taranır — program ya da dosya gerekmez." },
  { title: "13 sorun kategorisi", body: "Eksik/tekrarlayan title ve meta açıklaması, thin content, kırık link, eksik H1, noindex ve daha fazlası." },
  { title: "Filtrelenebilir sorun tablosu", body: "Sorun tipine göre filtreleyip yalnızca ilgilendiğiniz URL'leri görün." },
  { title: "Kategoriye göre gruplanmış fix prompt'u", body: "Tek prompt, her sorun kategorisi için örnek URL'lerle birlikte üretilir." },
  { title: "Tarama geçmişi ve trend", body: "Önceki taramaları tekrar açın, sorun sayısının zamanla nasıl düştüğünü grafikte görün." },
  { title: "Tek URL'lik Audit'in tamamlayıcısı", body: "Audit tek sayfayı anlık tarar; Site Taraması tüm siteyi toplu işler." },
];

export default function BulkImportLandingPage() {
  return (
    <div className="space-y-24 sm:space-y-28 pb-8">
      <FeatureHero
        breadcrumbLabel="Site Taraması"
        eyebrow="SİTE TARAMASI"
        title={<>Yüzlerce sayfanın SEO sorunlarını tek tek değil, <span className="text-accent">tek seferde</span> görün.</>}
        body="Sadece alan adını yazın — Epicsem tüm sitenizi kendisi tarar ve eksik/tekrarlayan title ve meta açıklaması, thin content, kırık link ve noindex sayfaları site genelinde, grafikli tek bir panoda gösterir."
        primaryCta={{ href: "/import", label: "Siteni ücretsiz tara" }}
        secondaryCta={{ href: "/features/seo-axo-audit", label: "Tek sayfa Audit'i incele" }}
        image={{ src: "/screenshots/bulk-import-form.png", alt: "Epicsem Site Taraması panosu", path: "epicsem.app/import", width: 1116, height: 482 }}
      />

      <FeatureComparison without={COMPARISON.without} withItems={COMPARISON.withItems} />

      <AiAnswerDemo />

      <FeatureSteps
        heading="Site taraması nasıl çalışır?"
        subheading="Adres yazmaktan toplu düzeltmeye"
        steps={SCENARIO_STEPS}
      />

      <FeatureGrid items={FEATURES} />

      <FAQSection items={FAQ_ITEMS} />

      <FeatureCTA
        title="Sitenizi şimdi tarayın"
        body="Hesap açmadan, ücretsiz test modunda deneyebilirsiniz."
        cta={{ href: "/import", label: "Taramayı başlat" }}
      />
    </div>
  );
}
