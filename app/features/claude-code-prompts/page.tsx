import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import ExampleScenario from "@/components/ExampleScenario";
import FAQSection from "@/components/FAQSection";

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
      <div className="space-y-4">
        <Breadcrumb items={[{ label: "Ana Sayfa", href: "/" }, { label: "Claude Code Prompts" }]} />
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight max-w-3xl">
          Ücretsiz, hesapsız: kendi kodunuzda çalışan SEO prompt kütüphanesi.
        </h1>
        <p className="text-ink/60 text-base max-w-2xl">
          Teknik SEO düzeltmelerinden AI crawler erişimine, schema üretiminden içerik brief&apos;lerine kadar — hazır
          Claude Code promptlarını kopyalayıp kendi sitenizin kodunda çalıştırın. Hesap açmanıza gerek yok.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/prompts" className="rounded-lg bg-accent text-white px-6 py-3 text-sm font-medium hover:opacity-90 transition-opacity">
            Prompt kütüphanesine git
          </Link>
          <Link href="/features/seo-axo-audit" className="rounded-lg border border-border bg-panel/60 px-6 py-3 text-sm font-medium hover:bg-muted transition-colors">
            Gerçek verilerle dolu prompt için Audit
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

      <ExampleScenario heading="Bir geliştirici genel bir şablonla kendi sitesini düzeltiyor" steps={SCENARIO_STEPS} />

      <FAQSection items={FAQ_ITEMS} />

      <div className="rounded-3xl bg-accent text-white px-6 sm:px-10 py-10 text-center space-y-4">
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">Kütüphaneye şimdi göz atın</h2>
        <p className="text-white/80 max-w-xl mx-auto text-sm">Ücretsiz, hesap açmadan.</p>
        <Link href="/prompts" className="inline-block rounded-lg bg-white text-accent px-6 py-3 text-sm font-medium hover:opacity-90 transition-opacity">
          Promptları gör
        </Link>
      </div>
    </div>
  );
}
