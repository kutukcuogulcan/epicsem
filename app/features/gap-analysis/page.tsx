import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import ExampleScenario from "@/components/ExampleScenario";
import FAQSection from "@/components/FAQSection";

export const metadata = {
  title: "Gap Analysis — Sağlam Ama AI'da Görünmeyen Sayfalarınızı Bulun | Epicsem",
  description:
    "SEO + AXO denetimini GEO görünürlük testiyle çaprazlayın: hangi sayfalarınız teknik olarak sağlam ama hiçbir AI motorunda anılmıyor? Ücretsiz test edin.",
};

const SCENARIO_STEPS = [
  {
    title: "Marka, rakip ve sayfa URL'leri girilir",
    body: "Marka bilgisi, promptlar ve denetlenecek sayfa URL'leri (ör. ana sayfa ve en çok trafik alan blog yazısı) girilir.",
  },
  {
    title: "Audit + GEO aynı anda çaprazlanır",
    body: "Her sayfa için teknik SEO/AXO skoru ile GEO testinin o sayfayı gerçekten anıp anmadığı aynı tabloda birleştirilir.",
  },
  {
    title: "\"Strong but invisible\" etiketi çıkar",
    body: "Bir blog yazısı teknik olarak sağlam, hiçbir crawler engellenmemiş, ama hiçbir AI yanıtında anılmıyor — \"Invisible\" olarak işaretlenir.",
  },
  {
    title: "Content brief otomatik üretilir",
    body: "Sayfanın kaybettiği promptlar somut başlık/FAQ önerilerine çevrilir.",
  },
  {
    title: "Content Studio'ya gönderilir",
    body: "\"Generate article\" ile brief, Content Studio'da bir WordPress taslağına dönüşür.",
  },
];

const FAQ_ITEMS = [
  {
    q: "Gap Analysis tam olarak neyi karşılaştırıyor?",
    a: "Her sayfa için Audit'in ölçtüğü teknik sağlamlığı ve AI crawler erişimini, GEO testinin o sayfayı gerçekten anıp anmadığıyla çaprazlar. Yalnız birini okuduğunda göremeyeceğin şeyi gösterir: teknik olarak sağlam ama hiç anılmayan bir sayfa.",
  },
  {
    q: "\"Blocked\", \"Invisible\", \"Cited\", \"Needs work\" etiketleri ne anlama geliyor?",
    a: "Blocked: sayfa AI crawler'lara kapalı. Invisible: teknik olarak sağlam ve erişilebilir ama hiçbir AI yanıtında anılmıyor. Cited: en az bir AI yanıtında anılıyor. Needs work: kısmi teknik veya erişim sorunları var.",
  },
  {
    q: "İçerik brief'leri (Content Briefs) nereden geliyor?",
    a: "Girdiğin promptlardan hangilerinin hiçbir sayfanı bulamadığını tespit edip, o kaybedilen promptları somut bir başlık/FAQ önerisine çeviriyor. Buradan \"Generate article\" ile Content Studio'da bir WordPress taslağına dönüştürebilirsin.",
  },
  {
    q: "Audit ve GEO'yu ayrı ayrı çalıştırmak yetmez mi?",
    a: "Ayrı ayrı okuduğunda ikisi de yarım bir cevap verir: Audit \"teknik olarak sağlam\" der, GEO \"anılıyor mu\" der. Gap Analysis ikisini aynı satırda birleştirip asıl soruyu cevaplar: sağlam olduğu halde neden anılmıyor?",
  },
];

const FEATURES = [
  { title: "Audit + GEO tek tabloda", body: "Teknik sağlamlık ve gerçek AI anılma durumu, sayfa sayfa aynı satırda karşılaştırılır." },
  { title: "4 net verdict etiketi", body: "Blocked, Invisible, Cited, Needs work — her sayfanın durumu tek bakışta anlaşılır." },
  { title: "Otomatik content brief", body: "Kaybedilen promptlar, somut başlık ve FAQ önerilerine çevrilir — uydurma değil, bu koşunun kendi verisinden." },
  { title: "Content Studio entegrasyonu", body: "\"Generate article\" ile brief tek tıkla bir WordPress taslağına dönüşür." },
  { title: "Kendi markanızla PDF rapor", body: "\"Ajans adınız\" kutusuna adınızı yazın — gap matrix ve content brief'ler, sizin adınızın göründüğü bir PDF olarak müşteriyle paylaşılsın." },
  { title: "Gerçek 4 motorla test", body: "ChatGPT, Claude, Gemini ve Perplexity'e gerçek promptlar gönderilir." },
];

export default function GapAnalysisLandingPage() {
  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <Breadcrumb items={[{ label: "Ana Sayfa", href: "/" }, { label: "Gap Analysis" }]} />
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight max-w-3xl">
          Sitenizde teknik olarak sağlam ama AI&apos;da hiç anılmayan sayfalar var mı?
        </h1>
        <p className="text-ink/60 text-base max-w-2xl">
          Audit &quot;teknik olarak sağlam&quot; der, GEO testi &quot;anılıyor mu&quot; der — ama ikisini ayrı ayrı
          okuduğunuzda asıl soruyu cevaplayamazsınız. Epicsem&apos;in Gap Analysis&apos;i, her sayfanız için ikisini
          aynı satırda birleştirir ve sağlam olduğu halde neden anılmadığını gösterir.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/gap" className="rounded-lg bg-accent text-white px-6 py-3 text-sm font-medium hover:opacity-90 transition-opacity">
            Ücretsiz analiz yap
          </Link>
          <Link href="/features/content-studio" className="rounded-lg border border-border bg-panel/60 px-6 py-3 text-sm font-medium hover:bg-muted transition-colors">
            Content Studio&apos;yu incele
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

      <ExampleScenario heading="Bir mobilya markası 'sağlam ama görünmez' sayfasını buluyor" steps={SCENARIO_STEPS} />

      <FAQSection items={FAQ_ITEMS} />

      <div className="rounded-3xl bg-accent text-white px-6 sm:px-10 py-10 text-center space-y-4">
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">Görünmez sayfalarınızı şimdi bulun</h2>
        <p className="text-white/80 max-w-xl mx-auto text-sm">Hesap açmadan, ücretsiz test modunda deneyebilirsiniz.</p>
        <Link href="/gap" className="inline-block rounded-lg bg-white text-accent px-6 py-3 text-sm font-medium hover:opacity-90 transition-opacity">
          Gap Analysis&apos;i başlat
        </Link>
      </div>
    </div>
  );
}
