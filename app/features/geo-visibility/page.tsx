import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import ExampleScenario from "@/components/ExampleScenario";
import FAQSection from "@/components/FAQSection";

export const metadata = {
  title: "AI'da Marka Görünürlüğü Testi (ChatGPT, Claude, Gemini) — Epicsem GEO/AEO",
  description:
    "Markanız ChatGPT, Claude, Gemini ve Perplexity'e soru sorulduğunda rakiplerinize karşı ne kadar görünüyor? Epicsem'in GEO/AEO aracıyla gerçek promptlarla ücretsiz test edin.",
};

const SCENARIO_STEPS = [
  {
    title: "Marka ve rakipler girilir",
    body: "Marka adı, domain ve iki rakip eklenir.",
  },
  {
    title: "Prompt önerisi istenir",
    body: "\"✨ Prompt öner\" ile hem markayı adıyla soran hem de kategoriyi genel soran promptlar otomatik oluşturulur; \"Fiyat: X ne kadar tutar?\" gibi konu etiketleriyle işaretlenir.",
  },
  {
    title: "Test dört motora gönderilir",
    body: "ChatGPT, Claude, Gemini ve Perplexity'e aynı promptlar gönderilir.",
  },
  {
    title: "Sonuç: marka-bilinende görünür, keşifte görünmez",
    body: "Marka adıyla sorulan promptlarda %90 görünürlük çıkar, ama \"bu kategoride en iyi markalar hangileri?\" gibi keşif promptlarında %10'un altında kalır — markayı henüz bilmeyen biri AI'dan onu hiç duymuyor.",
  },
  {
    title: "Konu kırılımı zayıf noktayı gösterir",
    body: "\"Fiyat\" konulu promptlarda görünürlük en düşük çıkar — bu bulgu hangi içeriğin öncelikli üretilmesi gerektiğini gösterir.",
  },
];

const FAQ_ITEMS = [
  {
    q: "Hangi AI motorlarını gerçekten test ediyor?",
    a: "ChatGPT (OpenAI), Claude (Anthropic), Gemini (Google) ve Perplexity gerçek API entegrasyonuyla çalışır; DeepSeek ve Grok da gerçek entegre. Meta AI ve Microsoft Copilot'un genel API'si olmadığı için bu ikisi her zaman simüle çalışır — ekranda \"demo only\" olarak işaretli.",
  },
  {
    q: "Sonuçlar gerçek mi, simülasyon mu?",
    a: "İlgili motorun API anahtarı tanımlıysa gerçek bir sorgu gönderilir. Tanımlı değilse sistem demo modda çalışır ve sonuçlar gerçekçi ama simüle edilmiştir — bu durum ekranda açıkça \"demo mode\" olarak belirtilir.",
  },
  {
    q: "Marka-bilinen (branded) ve keşif (discovery) prompt farkı ne?",
    a: "Marka-bilinen bir prompt markanı adıyla soruyor (\"X güvenilir mi?\"); keşif promptu ise markanı hiç duymamış birinin sorabileceği genel bir kategori sorusu (\"bu alanda en iyi araçlar hangileri?\"). İkisi ayrı ölçülür çünkü biri seni zaten bilenler, diğeri seni henüz keşfetmemiş olanlar için görünürlüğünü gösterir.",
  },
  {
    q: "Aylık kaç sorgu hakkım var?",
    a: "Ücretsiz planda GEO/AEO ve Gap Analysis birlikte, ayda toplam 300 AI motor sorgusu (prompt sayısı × motor sayısı) içeriyor. Demo modda hiçbir sorgu bu kotadan düşmez.",
  },
];

const FEATURES = [
  { title: "Gerçek API testi", body: "Simülasyon değil — ChatGPT, Claude, Gemini, Perplexity, DeepSeek ve Grok'a gerçek promptlar gönderilir." },
  { title: "Marka-bilinen / keşif ayrımı", body: "Seni zaten bilenlerin sorduğu sorularla, kategoriyi araştıranların sorduğu sorular ayrı ölçülür." },
  { title: "Konu bazında kırılım", body: "\"Fiyat: ...\" gibi etiketlerle hangi konuda görünür, hangi konuda görünmez olduğunu gör." },
  { title: "Kaynak dağılımı", body: "AI motorlarının cevaplarında hangi domainleri kaynak gösterdiğini — seni, rakiplerini veya üçüncü taraf siteleri — gör." },
  { title: "Trend takibi", body: "Aynı marka için tekrar test çalıştırdıkça görünürlüğün zaman içindeki değişimini grafikte izle." },
  { title: "Prompt önerisi", body: "Marka ve rakip bilgisinden otomatik, konu etiketli prompt seti üretilir — boş kutuyla başlamazsın." },
];

export default function GeoVisibilityLandingPage() {
  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <Breadcrumb items={[{ label: "Ana Sayfa", href: "/" }, { label: "GEO/AEO Görünürlük" }]} />
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight max-w-3xl">
          Markanız yapay zekâya soru sorulduğunda görünüyor mu?
        </h1>
        <p className="text-ink/60 text-base max-w-2xl">
          Kullanıcılar artık sadece Google&apos;a değil, ChatGPT&apos;ye, Claude&apos;a, Gemini&apos;ye ve
          Perplexity&apos;e de soruyor. Epicsem&apos;in GEO/AEO Visibility testi, markanızın bu motorlarda gerçekten
          anılıp anılmadığını, rakiplerinize karşı nerede durduğunuzu ve hangi kaynakların referans gösterildiğini
          gerçek promptlarla ölçer — geleneksel SEO araçlarının hiçbiri bunu göstermez.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/geo" className="rounded-lg bg-accent text-white px-6 py-3 text-sm font-medium hover:opacity-90 transition-opacity">
            Ücretsiz test et
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

      <ExampleScenario heading="Bir mobilya markası GEO testiyle görünmezliğini keşfediyor" steps={SCENARIO_STEPS} />

      <FAQSection items={FAQ_ITEMS} />

      <div className="rounded-3xl bg-accent text-white px-6 sm:px-10 py-10 text-center space-y-4">
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">Markanızın AI görünürlüğünü şimdi test edin</h2>
        <p className="text-white/80 max-w-xl mx-auto text-sm">Hesap açmadan, ücretsiz test modunda deneyebilirsiniz.</p>
        <Link href="/geo" className="inline-block rounded-lg bg-white text-accent px-6 py-3 text-sm font-medium hover:opacity-90 transition-opacity">
          GEO testini başlat
        </Link>
      </div>
    </div>
  );
}
