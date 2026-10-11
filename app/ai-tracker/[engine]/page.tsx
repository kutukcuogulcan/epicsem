import { notFound } from "next/navigation";
import Link from "next/link";
import FAQSection from "@/components/FAQSection";
import FeatureHero from "@/components/FeatureHero";
import FeatureGrid from "@/components/FeatureGrid";
import FeatureCTA from "@/components/FeatureCTA";
import FeatureComparison from "@/components/FeatureComparison";
import FeatureSteps from "@/components/FeatureSteps";
import { TRACKER_ENGINES, engineBySlug } from "@/lib/ai-tracker-engines";

export function generateStaticParams() {
  return TRACKER_ENGINES.map((e) => ({ engine: e.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ engine: string }> }) {
  const e = engineBySlug((await params).engine);
  if (!e) return {};
  return {
    title: `${e.name} Görünürlük Takibi — Markanız ${e.name}'te Anılıyor mu? | Epicsem`,
    description: `${e.name} (${e.vendor}) cevaplarında markanızın ne sıklıkla, kaçıncı sırada ve hangi kaynaklarla geçtiğini gerçek promptlarla ölçün; rakiplerinizle karşılaştırın.`,
    alternates: { canonical: `/ai-tracker/${e.slug}` },
  };
}

export default async function EngineTrackerPage({ params }: { params: Promise<{ engine: string }> }) {
  const e = engineBySlug((await params).engine);
  if (!e) notFound();
  const others = TRACKER_ENGINES.filter((x) => x.slug !== e.slug);

  return (
    <div className="space-y-24 sm:space-y-28 pb-8">
      <FeatureHero
        breadcrumbLabel={`${e.name} takibi`}
        eyebrow={`${e.name.toUpperCase()} VISIBILITY TRACKER`}
        title={<>Markanız <span style={{ color: e.color }}>{e.name}</span>&apos;te anılıyor mu, rakipleriniz mi öneriliyor?</>}
        body={`${e.angle} Epicsem, sektörünüzle ilgili gerçek soruları ${e.name}'e sorar; markanızın cevaplarda geçip geçmediğini, kaçıncı sırada önerildiğini, hangi rakiplerin öne çıktığını ve ${e.name}'in hangi kaynaklara dayandığını gösterir.`}
        primaryCta={{ href: "/geo", label: `${e.name} testini başlat` }}
        secondaryCta={{ href: "/features/geo-visibility", label: "Tüm AI motorları" }}
        image={{ src: "/screenshots/geo-visibility-stats.png", alt: `Epicsem ${e.name} görünürlük sonuçları`, path: "epicsem.app/geo", width: 1400, height: 171 }}
      />

      <FeatureComparison
        without={{
          title: `${e.name}'i elle kontrol etmek`,
          items: [
            "Her soruyu tek tek yazıp cevapları okumanız gerekir",
            "Cevaplar her seferinde değişir; tek deneme yanıltıcıdır",
            "Rakiplere göre pay (share of voice) hesaplanamaz",
            "Zaman içindeki değişimi takip edemezsiniz",
          ],
        }}
        withItems={{
          title: `Epicsem ${e.name} takibiyle`,
          items: [
            "Konulara göre gruplanmış onlarca prompt tek seferde sorulur",
            "Görünürlük, sıralama ve share of voice otomatik hesaplanır",
            `${e.name}'in atıf verdiği kaynaklar ve sayfalar listelenir`,
            "Aynı testler düzenli tekrarlanır, değişim grafikte görünür",
          ],
        }}
      />

      <FeatureSteps
        heading={`${e.name} görünürlüğü nasıl ölçülür?`}
        subheading="Adres yazmaktan aksiyona"
        steps={[
          { title: "Sitenizin adresini yazın", body: "Marka, rakipler ve sektörünüzdeki gerçek sorular otomatik çıkarılır." },
          { title: `Sorular ${e.name}'e sorulur`, body: `Her prompt ${e.vendor} API'si üzerinden ${e.name}'e gönderilir; cevaptaki marka adları ve kaynaklar ayrıştırılır.` },
          { title: "Görünürlük ve rakip payı çıkar", body: "Markanızın kaç cevapta, kaçıncı sırada geçtiği ve rakiplerin payı tek panoda." },
          { title: "Eksik içeriği kapatın", body: "Gap Analysis ve AI SEO Editör ile anılmadığınız konular için cevap-önce içerik hazırlayın." },
        ]}
      />

      <FeatureGrid
        items={[
          { title: `${e.name} görünürlük skoru`, body: "Markanızın geçtiği cevapların oranı, zaman içindeki trendiyle." },
          { title: "Rakip karşılaştırması", body: `${e.name}'in hangi markaları sizden önce önerdiğini görün.` },
          { title: "Kaynak / atıf analizi", body: `${e.name}'in dayandığı siteler ve sayfalar — hangi içeriğin sizi öne çıkaracağını gösterir.` },
          { title: "Diğer motorlarla yan yana", body: "Aynı promptlar ChatGPT, Claude, Gemini, Perplexity, Grok ve DeepSeek'te de ölçülür." },
          { title: "Türkçe ve İngilizce", body: "Türkiye pazarındaki sorular ayrı, global sorular ayrı ölçülür." },
          { title: "Ajans raporu", body: "Sonuçları kendi ajans adınızla PDF olarak müşterinize gönderin." },
        ]}
      />

      <FAQSection
        items={[
          { q: `${e.name}'te markamın geçip geçmediğini nasıl ölçüyorsunuz?`, a: `Sektörünüzle ilgili soruları ${e.vendor}'nin resmi API'si üzerinden ${e.name}'e sorar, cevap metnindeki marka adlarını ve linkleri ayrıştırırız. Ölçüm, gerçek cevaplar üzerinden yapılır; tahmin değildir.` },
          { q: "Sonuçlar neden testten teste değişebiliyor?", a: "AI modelleri aynı soruya her seferinde biraz farklı cevap verir. Bu yüzden tek bir soruya değil, konulara göre gruplanmış çok sayıda prompta bakıyor ve oranları zaman içinde takip ediyoruz." },
          { q: `${e.name}'te nasıl daha fazla önerilirim?`, a: `${e.name}'in atıf verdiği kaynaklarda yer almak ve sorulara doğrudan cevap veren, yapılandırılmış (başlık, liste, SSS, schema) içerik yayınlamak en etkili yollardır. Epicsem hangi konularda eksik olduğunuzu gösterir ve AI SEO Editör ile bu içeriği hazırlamanıza yardım eder.` },
        ]}
      />

      <section className="space-y-4">
        <h2 className="text-center text-xl font-extrabold">Diğer AI motorlarında da takip edin</h2>
        <div className="flex flex-wrap justify-center gap-2">
          {others.map((o) => (
            <Link key={o.slug} href={`/ai-tracker/${o.slug}`} className="inline-flex items-center gap-2 rounded-full border border-border bg-panel px-4 py-2 text-sm font-semibold text-ink/70 hover:border-accent hover:text-accent">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: o.color }} />
              {o.name} takibi
            </Link>
          ))}
        </div>
      </section>

      <FeatureCTA title={`Markanızın ${e.name} görünürlüğünü şimdi ölçün`} body="Sadece sitenizin adresini yazın; marka, rakipler ve sorular otomatik çıkarılır." cta={{ href: "/geo", label: "Ücretsiz test et" }} />
    </div>
  );
}
