import ExampleScenario from "@/components/ExampleScenario";
import FAQSection from "@/components/FAQSection";
import FeatureHero from "@/components/FeatureHero";
import FeatureGrid from "@/components/FeatureGrid";
import FeatureCTA from "@/components/FeatureCTA";

export const metadata = {
  title: "SEO + AXO Denetimi — Siteniz Google'da ve AI'da Görünüyor mu? | Epicsem",
  description:
    "Klasik teknik SEO taramasının yanında GPTBot, ClaudeBot, PerplexityBot ve Google-Extended gibi AI crawler'ların sitenize gerçekten erişip erişemediğini ücretsiz kontrol edin.",
};

const SCENARIO_STEPS = [
  {
    title: "Domain girilir",
    body: "Site sahibi kendi domainini /audit'e girer ve taramayı başlatır.",
  },
  {
    title: "İki farklı skor çıkar",
    body: "Teknik SEO skoru 82/100 — title, meta, schema düzgün. Ama AXO skoru 35/100: robots.txt dosyası GPTBot'u ve ClaudeBot'u engelliyor.",
  },
  {
    title: "Fix prompt'u üretilir",
    body: "\"Fix with Claude Code\" ile robots.txt'teki engeli kaldıracak somut bir prompt oluşturulur — hiçbir şey uydurulmaz, sadece taranan sayfanın kendi verisine dayanır.",
  },
  {
    title: "Geliştirici düzeltmeyi uygular",
    body: "Prompt, sitenin kendi reposunda çalışan Claude Code'a yapıştırılır, robots.txt güncellenir ve yayına alınır.",
  },
  {
    title: "Sonraki koşuda ilerleme görülür",
    body: "Bir hafta sonra tekrar audit çalıştırıldığında AXO skoru 35'ten 88'e çıkar, engellenen bot sayısı 0'a iner — bu ilerleme indirilebilir bir PDF rapor olarak müşteriyle paylaşılır.",
  },
];

const FAQ_ITEMS = [
  {
    q: "Bu denetim tam olarak neyi kontrol ediyor?",
    a: "Title/meta açıklaması, başlık (H1) yapısı, structured data (schema), robots.txt & sitemap varlığı — ve ayrıca GPTBot, ClaudeBot, PerplexityBot, Google-Extended gibi AI crawler'ların sayfaya gerçekten erişip erişemediği.",
  },
  {
    q: "SEO skoru ile AXO skoru arasındaki fark ne?",
    a: "SEO skoru klasik teknik sağlamlığı ölçer (başlıklar, meta, schema). AXO skoru özellikle AI motorlarının crawler'larının sayfaya erişip erişemediğini ölçer — bir site teknik olarak sağlam olup SEO'da yüksek puan alırken, robots.txt'i GPTBot'u engellediği için AXO'da düşük çıkabilir.",
  },
  {
    q: "Önerilen düzeltmeler nereden geliyor, uyduruluyor mu?",
    a: "Hayır — fix önerileri (meta açıklaması, Organization/FAQ şeması) sadece taranan sayfanın kendi içeriğinden üretiliyor. Model bir şeye dayanak bulamazsa onu üretmiyor.",
  },
  {
    q: "Sonucu müşterime nasıl gönderebilirim?",
    a: "Denetim tamamlandıktan sonra \"Download PDF report\" ile indirilebilir bir PDF alabilirsin. \"Ajans adınız\" kutusuna kendi ajans/marka adını yazarsan PDF'te Epicsem yerine o isim görünür. Birden fazla müşterin varsa Clients'a kaydedip her koşuyu o müşteriyle ilişkilendirebilirsin.",
  },
];

const FEATURES = [
  { title: "Teknik SEO + AXO, tek taramada", body: "Title, meta, başlık yapısı, schema, robots.txt/sitemap — hepsi tek bir URL taramasında." },
  { title: "AI crawler erişim tablosu", body: "GPTBot, ClaudeBot, PerplexityBot ve Google-Extended'in sayfaya erişip erişemediğini ayrı ayrı gör." },
  { title: "Sayfanın kendi verisinden fix", body: "Önerilen düzeltmeler sadece taranan sayfanın içeriğinden üretilir, hiçbir istatistik uydurulmaz." },
  { title: "Claude Code prompt'u", body: "Bulunan sorunları özetleyen, kendi reponuzda çalıştırabileceğiniz bir prompt tek tıkla oluşturulur." },
  { title: "Trend karşılaştırması", body: "Aynı URL'yi tekrar taradığınızda SEO/AXO skorundaki ve engellenen bot sayısındaki değişimi görürsünüz." },
  { title: "Kendi markanızla PDF rapor", body: "\"Ajans adınız\" kutusuna kendi adınızı yazın, indirilebilir PDF'te Epicsem yerine sizin adınız görünsün." },
];

export default function SeoAxoAuditLandingPage() {
  return (
    <div className="space-y-10">
      <FeatureHero
        breadcrumbLabel="SEO + AXO Denetimi"
        eyebrow="SEO + AXO AUDIT"
        title={<>Siteniz Google&apos;da iyi olabilir — ama <span className="text-accent">AI&apos;da hiç görünmüyor</span> olabilir.</>}
        body="Klasik SEO araçları title, meta ve başlık yapısını kontrol eder ama ChatGPT'nin, Claude'un veya Perplexity'nin crawler'ının sitenize erişip erişemediğini ölçmez. Epicsem'in SEO + AXO Audit'i ikisini birden tek taramada gösterir: teknik SEO sağlamlığı ve AI crawler erişimi."
        primaryCta={{ href: "/audit", label: "Ücretsiz denetim yap" }}
        secondaryCta={{ href: "/features/geo-visibility", label: "GEO/AEO Görünürlük'ü incele" }}
        image={{ src: "/screenshots/audit-scores.png", alt: "Epicsem SEO + AXO Audit sonuç ekranı — gerçek skorlar", path: "epicsem.app/audit", width: 1400, height: 228 }}
      />

      <FeatureGrid items={FEATURES} />

      <ExampleScenario heading="Bir mobilya e-ticaret sitesi audit'ten geçiyor" steps={SCENARIO_STEPS} />

      <FAQSection items={FAQ_ITEMS} />

      <FeatureCTA
        title="Sitenizi şimdi ücretsiz denetleyin"
        body="Hesap açmadan, ücretsiz test modunda deneyebilirsiniz."
        cta={{ href: "/audit", label: "Denetimi başlat" }}
      />
    </div>
  );
}
