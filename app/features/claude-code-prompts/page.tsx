import ExampleScenario from "@/components/ExampleScenario";
import FAQSection from "@/components/FAQSection";
import FeatureHero from "@/components/FeatureHero";
import FeatureGrid from "@/components/FeatureGrid";
import FeatureCTA from "@/components/FeatureCTA";

export const metadata = {
  title: "Ücretsiz Claude Code SEO Prompt Kütüphanesi | Epicsem",
  description:
    "Teknik SEO, AI crawler erişimi, schema ve içerik brief'leri için hazır, ücretsiz Claude Code promptları — hesap gerekmez.",
};

const SCENARIO_STEPS = [
  {
    title: "Kategoriye göre prompt seçilir",
    body: "Kütüphaneden \"AI crawler erişimi\" kategorisindeki bir prompt seçilir.",
  },
  {
    title: "Prompt kopyalanır",
    body: "Prompt metni, hazır şablon olarak kopyalanır — hiçbir hesap gerekmez.",
  },
  {
    title: "Kendi reposunda Claude Code'a yapıştırılır",
    body: "Kullanıcı, kendi site kodunun kök dizininde çalışan Claude Code'a promptu yapıştırır.",
  },
  {
    title: "Genel şablon kendi siteye uygulanır",
    body: "Claude Code kendi dosyalarını okuyup şablonu siteye özel şekilde uygular — Epicsem'in kendi verisi olmadan da kullanılabilir.",
  },
];

const FAQ_ITEMS = [
  {
    q: "Bu promptları nasıl kullanırım?",
    a: "Bir prompt kartındaki metni kopyala, kendi site kodunun/deponun kök dizininde çalışan Claude Code'a (veya shell + dosya erişimi olan başka bir kodlama ajanına) yapıştır — ajan senin gerçek dosyalarını okuyup değişiklik yapar.",
  },
  {
    q: "Neden boş şablon, benim verilerimle doldurulmuş değil?",
    a: "Burası genel amaçlı, herkesin kullanabileceği statik bir şablon kütüphanesi. Kendi gerçek bulgularınla önceden doldurulmuş bir prompt istiyorsan Audit veya Gap Analysis'i çalıştır — ikisinde de sonuç sayfasında \"Fix with Claude Code\" butonu var, o senin domainine ve o koşunun gerçek sonuçlarına göre otomatik oluşturulmuş bir prompt üretir.",
  },
  {
    q: "Ücretli mi, hesap açmam gerekiyor mu?",
    a: "Hayır — bu sayfa tamamen ücretsiz ve herkese açık, giriş yapmana veya hesap oluşturmana gerek yok.",
  },
];

const FEATURES = [
  { title: "Tamamen ücretsiz", body: "Hesap açmadan, giriş yapmadan tüm prompt kütüphanesine erişin." },
  { title: "Kategorilere ayrılmış", body: "Teknik SEO, AI crawler erişimi, schema, GEO citation gap'leri ve içerik brief'leri için ayrı kategoriler." },
  { title: "Kendi reponuzda çalışır", body: "Her prompt, Claude Code veya benzer bir kodlama ajanıyla kendi site kodunuzda kullanılmak üzere yazıldı." },
  { title: "Uydurma istatistik yok", body: "Şablonlar, gerçek verinizi siz sağlayacak şekilde tasarlandı — sahte sayı veya iddia içermez." },
  { title: "Gerçek sonuçla önceden dolu versiyon", body: "Audit veya Gap Analysis'in \"Fix with Claude Code\" butonu, aynı promptların sizin gerçek verinizle doldurulmuş halini üretir." },
];

export default function ClaudeCodePromptsLandingPage() {
  return (
    <div className="space-y-10">
      <FeatureHero
        breadcrumbLabel="Claude Code Prompts"
        eyebrow="CLAUDE CODE PROMPTS"
        title={<>Ücretsiz, hesapsız: <span className="text-accent">kendi kodunuzda çalışan</span> SEO prompt kütüphanesi.</>}
        body="Teknik SEO düzeltmelerinden AI crawler erişimine, schema üretiminden içerik brief'lerine kadar — hazır Claude Code promptlarını kopyalayıp kendi sitenizin kodunda çalıştırın. Hesap açmanıza gerek yok."
        primaryCta={{ href: "/prompts", label: "Prompt kütüphanesine git" }}
        secondaryCta={{ href: "/features/seo-axo-audit", label: "Gerçek verilerle dolu prompt için Audit" }}
        image={{ src: "/screenshots/prompts-library.png", alt: "Epicsem Claude Code Prompts — kategoriye ayrılmış prompt kütüphanesi", path: "epicsem.app/prompts", width: 1399, height: 439 }}
      />

      <FeatureGrid items={FEATURES} />

      <ExampleScenario heading="Bir geliştirici genel bir şablonla kendi sitesini düzeltiyor" steps={SCENARIO_STEPS} />

      <FAQSection items={FAQ_ITEMS} />

      <FeatureCTA
        title="Kütüphaneye şimdi göz atın"
        body="Ücretsiz, hesap açmadan."
        cta={{ href: "/prompts", label: "Promptları gör" }}
      />
    </div>
  );
}
