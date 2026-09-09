import { CATEGORY_LABEL, getPromptsByCategory, type PromptCategory } from "@/lib/prompt-library";
import PromptBlock from "@/components/PromptBlock";
import ToolPageHeader from "@/components/ToolPageHeader";
import FAQSection from "@/components/FAQSection";
import ExampleScenario from "@/components/ExampleScenario";

export const metadata = {
  title: "Claude Code SEO Promptları — Epicsem",
  description:
    "Teknik SEO, AXO crawler erişimi, schema, GEO atıf boşlukları ve içerik brifleri için ücretsiz bir Claude Code prompt kütüphanesi — genel şablonlar değil, gerçek denetim verisine dayanır.",
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

export default function PromptsPage() {
  const grouped = getPromptsByCategory();
  const categories = Object.keys(grouped) as PromptCategory[];

  return (
    <div className="space-y-8">
      <ToolPageHeader
        breadcrumbLabel="Claude Code Promptları"
        title="Claude Code SEO Promptları"
        body={
          <>
            <p className="max-w-3xl">
              Kendi sitenizin kodunda Claude Code (veya shell + dosya erişimi olan başka bir kodlama ajanı) ile SEO
              işleri yapmak için ücretsiz bir prompt kütüphanesi — teknik düzeltmeler, AI crawler erişimi, schema
              üretimi, GEO citation boşlukları, content brief&apos;leri, internal linking ve daha fazlası. Her prompt,
              reponuzda gerçekten var olana dayanacak şekilde tasarlandı — uydurma istatistik yok, ince otomatik
              üretilmiş sayfa yok.
            </p>
            <p className="text-ink/40 text-xs max-w-3xl mt-2">
              Bunlar kendinizin dolduracağı statik şablonlardır. Kendi gerçek bulgularınızla önceden doldurulmuş bir
              prompt için önce bir <a href="/audit" className="text-accent hover:underline">audit</a> ya da bir{" "}
              <a href="/gap" className="text-accent hover:underline">gap analysis</a> çalıştırın — ikisinde de o
              spesifik sonuçtan bir tane üreten bir &quot;Fix with Claude Code&quot; butonu var.
            </p>
          </>
        }
      />

      {categories.map((cat) => (
        <div key={cat} className="space-y-3">
          <h2 className="font-bold text-lg">{CATEGORY_LABEL[cat]}</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {grouped[cat].map((p) => (
              <PromptBlock key={p.id} title={p.title} description={p.description} prompt={p.prompt} />
            ))}
          </div>
        </div>
      ))}

      <ExampleScenario heading="Bir geliştirici genel bir şablonla kendi sitesini düzeltiyor" steps={SCENARIO_STEPS} />

      <FAQSection items={FAQ_ITEMS} />
    </div>
  );
}
