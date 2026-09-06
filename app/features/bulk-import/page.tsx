import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import ExampleScenario from "@/components/ExampleScenario";
import FAQSection from "@/components/FAQSection";

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
      <div className="space-y-4">
        <Breadcrumb items={[{ label: "Ana Sayfa", href: "/" }, { label: "Bulk Import" }]} />
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight max-w-3xl">
          Yüzlerce sayfanın SEO sorunlarını tek tek değil, tek seferde görün.
        </h1>
        <p className="text-ink/60 text-base max-w-2xl">
          Epicsem&apos;in Audit&apos;i tek bir URL&apos;yi anlık tarar. Bulk Import ise Screaming Frog&apos;la taranmış
          tüm bir sitenin sonucunu işleyip eksik/tekrarlayan title ve meta açıklaması, thin content, kırık link ve
          noindex sayfaları tüm site genelinde, tek bir özet tabloda gösterir.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/import" className="rounded-lg bg-accent text-white px-6 py-3 text-sm font-medium hover:opacity-90 transition-opacity">
            Ücretsiz CSV yükle
          </Link>
          <Link href="/features/seo-axo-audit" className="rounded-lg border border-border bg-panel/60 px-6 py-3 text-sm font-medium hover:bg-muted transition-colors">
            Tek sayfa Audit&apos;i incele
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

      <ExampleScenario heading="50 sayfalık bir site, tek CSV ile toplu taranıyor" steps={SCENARIO_STEPS} />

      <FAQSection items={FAQ_ITEMS} />

      <div className="rounded-3xl bg-accent text-white px-6 sm:px-10 py-10 text-center space-y-4">
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">Sitenizin CSV'sini şimdi yükleyin</h2>
        <p className="text-white/80 max-w-xl mx-auto text-sm">Hesap açmadan, ücretsiz test modunda deneyebilirsiniz.</p>
        <Link href="/import" className="inline-block rounded-lg bg-white text-accent px-6 py-3 text-sm font-medium hover:opacity-90 transition-opacity">
          CSV yüklemeyi başlat
        </Link>
      </div>
    </div>
  );
}
