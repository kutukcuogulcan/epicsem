import ExampleScenario from "@/components/ExampleScenario";
import FAQSection from "@/components/FAQSection";
import FeatureHero from "@/components/FeatureHero";
import FeatureGrid from "@/components/FeatureGrid";
import FeatureCTA from "@/components/FeatureCTA";

export const metadata = {
  title: "Bulk Import — Screaming Frog CSV'nizi Tek Seferde Analiz Edin | Epicsem",
  description:
    "Screaming Frog'la taranmış tüm bir sitenin eksik meta, kırık link, thin content ve noindex sorunlarını tek CSV yükleyerek tüm site genelinde ücretsiz görün.",
};

const SCENARIO_STEPS = [
  {
    title: "Screaming Frog ile site taranır",
    body: "Kullanıcı kendi Screaming Frog'unda siteyi tarar ve \"Internal → All\" olarak CSV dışa aktarır.",
  },
  {
    title: "CSV /import'a yüklenir",
    body: "Dosya sürükle-bırak ile yüklenir, 25MB'a kadar dosyalar kabul edilir.",
  },
  {
    title: "Site genelinde sorunlar tek seferde çıkar",
    body: "12 sayfada eksik meta açıklaması, 3 sayfada kırık link, 5 sayfada thin content tespit edilir — hepsi tek bir özet tabloda.",
  },
  {
    title: "Fix prompt'u kategoriye göre gruplanır",
    body: "\"Fix with Claude Code\" ile her sorun kategorisi için örnek URL'li bir prompt üretilir.",
  },
  {
    title: "Geliştirici toplu düzeltme yapar",
    body: "Prompt, sitenin reposunda çalışan Claude Code'a yapıştırılır ve sorunlar toplu şekilde düzeltilir.",
  },
];

const FAQ_ITEMS = [
  {
    q: "Hangi dosyayı yükleyebilirim?",
    a: "Screaming Frog'da Internal → All olarak dışa aktardığın CSV dosyasını, 25MB'a kadar. Başka bir crawler'ın CSV'si aynı sütun isimlerini kullanmıyorsa doğru eşlenmeyebilir.",
  },
  {
    q: "Bunun Audit'ten farkı ne?",
    a: "Audit tek bir URL'yi anlık olarak tarar. Bulk Import ise daha önce Screaming Frog'la taranmış tüm bir sitenin sonucunu işleyip eksik/tekrarlayan title ve meta açıklaması, thin content, kırık link, eksik H1 ve noindex sayfaları tek seferde, tüm site genelinde gösterir.",
  },
  {
    q: "Bulunan sorunları nasıl düzeltirim?",
    a: "\"Fix with Claude Code\" ile her sorun kategorisine göre gruplanmış, örnek URL'li bir prompt üretilir — bunu kendi site kodun/deposu üzerinde çalışan Claude Code'a yapıştırıp toplu düzeltebilirsin.",
  },
];

const FEATURES = [
  { title: "Tüm site, tek CSV", body: "Screaming Frog'la taranmış binlerce URL'yi tek seferde yükleyip analiz edin." },
  { title: "13 sorun kategorisi", body: "Eksik/tekrarlayan title ve meta açıklaması, thin content, kırık link, eksik H1, noindex ve daha fazlası." },
  { title: "Filtrelenebilir sorun tablosu", body: "Sorun tipine göre filtreleyip yalnızca ilgilendiğiniz URL'leri görün." },
  { title: "Kategoriye göre gruplanmış fix prompt'u", body: "Tek prompt, her sorun kategorisi için örnek URL'lerle birlikte üretilir." },
  { title: "Geçmiş içe aktarmalar", body: "Önceki CSV yüklemelerinizi tekrar açıp karşılaştırabilirsiniz." },
  { title: "Tek URL'lik Audit'in tamamlayıcısı", body: "Audit tek sayfayı anlık tarar; Bulk Import tüm siteyi toplu işler." },
];

export default function BulkImportLandingPage() {
  return (
    <div className="space-y-10">
      <FeatureHero
        breadcrumbLabel="Bulk Import"
        eyebrow="BULK IMPORT"
        title={<>Yüzlerce sayfanın SEO sorunlarını tek tek değil, <span className="text-accent">tek seferde</span> görün.</>}
        body="Epicsem'in Audit'i tek bir URL'yi anlık tarar. Bulk Import ise Screaming Frog'la taranmış tüm bir sitenin sonucunu işleyip eksik/tekrarlayan title ve meta açıklaması, thin content, kırık link ve noindex sayfaları tüm site genelinde, tek bir özet tabloda gösterir."
        primaryCta={{ href: "/import", label: "Ücretsiz CSV yükle" }}
        secondaryCta={{ href: "/features/seo-axo-audit", label: "Tek sayfa Audit'i incele" }}
        image={{ src: "/screenshots/bulk-import-form.png", alt: "Epicsem Bulk Import — Screaming Frog CSV yükleme alanı", path: "epicsem.app/import", width: 1399, height: 101 }}
      />

      <FeatureGrid items={FEATURES} />

      <ExampleScenario heading="50 sayfalık bir site, tek CSV ile toplu taranıyor" steps={SCENARIO_STEPS} />

      <FAQSection items={FAQ_ITEMS} />

      <FeatureCTA
        title="Sitenizin CSV'sini şimdi yükleyin"
        body="Hesap açmadan, ücretsiz test modunda deneyebilirsiniz."
        cta={{ href: "/import", label: "CSV yüklemeyi başlat" }}
      />
    </div>
  );
}
