import Link from "next/link";
import BrowserFrame from "@/components/BrowserFrame";
import Reveal from "@/components/marketing/Reveal";
import EngineMarquee from "@/components/marketing/EngineMarquee";
import AiAnswerDemo from "@/components/marketing/AiAnswerDemo";
import HeroDashboardPreview from "@/components/marketing/HeroDashboardPreview";
import HeroUrlForm from "@/components/marketing/HeroUrlForm";
import StatsBand from "@/components/marketing/StatsBand";
import FeatureSteps from "@/components/FeatureSteps";
import FAQSection from "@/components/FAQSection";
import FeatureCTA from "@/components/FeatureCTA";

const CHECK_ICON = (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M2.5 6.5L4.5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Deep-dive sections for the two flagship products — alternating image/text sides,
// each visual a REAL screenshot of this app's own live results (see BrowserFrame),
// never a fabricated dashboard mockup.
const SHOWCASES = [
  {
    eyebrow: "SEO + AXO AUDIT",
    title: "Google'da neyin eksik olduğunu, AI botlarının erişip erişemediğini gör",
    points: [
      "Title/meta, başlıklar, structured data, robots.txt & sitemap kontrolü",
      "GPTBot, ClaudeBot, PerplexityBot gibi AI crawler'ların sayfaya erişip erişemediği",
      "Bulgulardan otomatik, kopyala-yapıştıra hazır bir Claude Code fix prompt'u",
    ],
    cta: { href: "/audit", label: "Ücretsiz denetim yap" },
    image: { src: "/screenshots/audit-scores.png", alt: "Epicsem SEO + AXO Audit sonuç ekranı — gerçek skorlar", path: "epicsem.app/audit", width: 1400, height: 228 },
    imageSide: "left" as const,
  },
  {
    eyebrow: "GEO/AEO VISIBILITY",
    title: "Markan AI'ya soru sorulduğunda gerçekten anılıyor mu?",
    points: [
      "ChatGPT, Claude, Gemini, Perplexity'e aynı promptlar gerçekten gönderilir",
      "Marka-bilinen (\"X güvenilir mi?\") ve keşif (\"en iyi ... hangisi?\") ayrı ölçülür",
      "Türkçe ve İngilizce promptları ayrı test et — sonuç dile göre değişebiliyor",
    ],
    cta: { href: "/geo", label: "GEO testini başlat" },
    image: { src: "/screenshots/geo-visibility-stats.png", alt: "Epicsem GEO/AEO Visibility sonuç ekranı — gerçek görünürlük skoru", path: "epicsem.app/geo", width: 1400, height: 171 },
    imageSide: "right" as const,
  },
];

const GROUPS = [
  {
    title: "Analiz & Test",
    description: "Bir sayfanın teknik olarak sağlam olup olmadığını ve AI motorlarında gerçekten görünüp görünmediğini ölç.",
    tone: "text-accent",
    items: [
      { label: "SEO + AXO Audit", href: "/audit", body: "Title/meta, başlıklar, structured data, robots.txt & sitemap — ve GPTBot, ClaudeBot, PerplexityBot gibi AI crawler'ların sayfaya erişip erişemediği.", landingHref: "/features/seo-axo-audit" },
      { label: "GEO/AEO Visibility", href: "/geo", body: "ChatGPT, Claude, Gemini, Perplexity'e gerçek promptlar gönder; marka anılıyor mu, rakiplere göre nerede, hangi kaynaklar referans gösteriliyor gör — Türkçe ve İngilizce promptları ayrı test edebilirsin.", landingHref: "/features/geo-visibility" },
      { label: "Gap Analysis", href: "/gap", body: "Denetim sonucu ile GEO sonucunu çaprazlar: teknik olarak sağlam ama hiç anılmayan sayfaları bulur.", landingHref: "/features/gap-analysis" },
      { label: "Article Writer", href: "/article-writer", body: "Tek bir sayfayı derinlemesine denetler — title, meta, canonical, alt text, internal link fırsatları, FAQ/Article schema — ve bulunan boşluklara göre somut makale önerileri üretir." },
    ],
  },
  {
    title: "Otomasyon",
    description: "Bir kere kur, arkasında çalışsın — elle kontrol etmene gerek kalmasın.",
    tone: "text-warn",
    items: [
      { label: "AXO Monitoring", href: "/monitor", body: "Kritik sayfaları zamanla izler, daha önce izinli olan bir AI crawler robots.txt'te engellenirse Slack'e anında haber verir.", landingHref: "/features/axo-monitoring" },
      { label: "Kampanyalar", href: "/campaigns", body: "Bir domain için kur, Gap Analysis'teki gerçek içerik boşluklarını haftalık/aylık otomatik taslak makaleye çevirir — hiçbir zaman uydurma bir konu kullanmaz." },
      { label: "Site Taraması", href: "/import", body: "Sadece adresi yaz; tüm siteyi tarayıp eksik meta/başlık, kırık link ve thin content sorunlarını tek panoda gör.", landingHref: "/features/bulk-import" },
      { label: "Content Studio", href: "/content", body: "Kaybedilen promptları somut başlık/FAQ önerilerine çevirir, taslağı WordPress veya Shopify'a yayınlar.", landingHref: "/features/content-studio" },
      { label: "Yerel İşletme (GBP)", href: "/local", body: "Google Business Profile gönderisi ve müşteri yorumlarına yanıt taslağı üretir — kopyala, yapıştır, sen onayla." },
    ],
  },
  {
    title: "Yönetim",
    description: "Birden fazla müşteri yönetiyorsan, her birinin markasını bir kere kaydet, her yerde tekrar kullan.",
    tone: "text-seo",
    items: [
      { label: "Clients", href: "/clients", body: "Her müşterinin marka/rakip bilgisini kaydet, audit/GEO/gap koşularında tekrar kullan, kendi ajans adınla PDF rapor indir.", landingHref: "/features/clients" },
      { label: "Sınırsız motor", href: "/geo", body: "OpenAI, Anthropic, Google, Perplexity hepsi dahil — hangi modelin müşterin için önemli olduğunu test etmek için motor başına ek ücret yok." },
    ],
  },
];

const STEPS = [
  { n: "1", title: "Marka ve rakiplerini gir", body: "Marka adı, domain ve varsa rakiplerin — Clients'a kaydedersen bir daha yazmana gerek kalmaz." },
  { n: "2", title: "Gerçek testi çalıştır", body: "Denetim gerçek sayfanı tarar; GEO testi gerçek promptları ChatGPT/Claude/Gemini/Perplexity'e gönderir." },
  { n: "3", title: "Somut aksiyon al", body: "Fix önerileri, kaybedilen promptlardan içerik brief'i, ve indirilebilir PDF rapor — hepsi bu çalışmanın kendi verisinden, uydurma değil." },
];

const FAQ = [
  {
    q: "Şu an kullanmak ücretsiz mi?",
    a: "Evet — şu an test aşamasındayız, panele hesap açmadan girip deneyebilirsin. İleride ücretli plana geçildiğinde mevcut kullanıcılar önceden bilgilendirilir.",
  },
  {
    q: "GEO/AEO test sonuçları gerçek mi, simülasyon mu?",
    a: "Şu an AI sağlayıcı (OpenAI, Anthropic vb.) anahtarı tanımlı olmadığı için sistem demo modunda çalışıyor: sonuçlar gerçekçi ama simüle — ekranda net şekilde \"demo mode\" olarak işaretleniyor. Gerçek anahtarlar eklendiğinde promptlar gerçekten o motorlara gönderilir.",
  },
  {
    q: "Hangi AI motorlarını test ediyor?",
    a: "ChatGPT (OpenAI), Claude (Anthropic), Gemini (Google) ve Perplexity ilk sınıf destekleniyor; DeepSeek ve Grok de test edilebiliyor.",
  },
  {
    q: "Ajans olarak birden fazla müşteri yönetebilir miyim?",
    a: "Evet. Clients sayfasından her müşterinin marka/rakip bilgisini bir kere kaydedip audit, GEO ve gap analizlerinde tekrar tekrar kullanabilirsin.",
  },
  {
    q: "Verilerim nerede saklanıyor?",
    a: "Kendi hesabına bağlı Postgres veritabanında — her koşu (audit, GEO testi, gap analizi) kendi hesabınla ilişkilendirilir, başka kullanıcılar göremez.",
  },
];

export default function Home() {
  return (
    <div className="space-y-28 sm:space-y-32 pb-8">
      {/* HERO — tam genişlik, ızgara + kayan ışıklar, ortalı başlık, URL kutusu, canlı panel önizlemesi */}
      <section className="full-bleed relative -mt-8 overflow-hidden pt-16 sm:pt-20 pb-10">
        <div className="pointer-events-none absolute inset-0 bg-grid fade-mask-b" aria-hidden />
        <div className="pointer-events-none absolute -top-32 left-[8%] h-96 w-96 rounded-full bg-accent/25 blur-3xl animate-blob" aria-hidden />
        <div className="pointer-events-none absolute top-24 right-[6%] h-[28rem] w-[28rem] rounded-full bg-pink-300/25 blur-3xl animate-blob" style={{ animationDelay: "-6s" }} aria-hidden />
        <div className="pointer-events-none absolute top-[30rem] left-1/3 h-96 w-96 rounded-full bg-geo/30 blur-3xl animate-blob" style={{ animationDelay: "-11s" }} aria-hidden />

        <div className="relative mx-auto max-w-6xl px-4 space-y-14">
          <div className="mx-auto max-w-4xl text-center space-y-7">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-panel/80 px-4 py-1.5 text-xs font-bold text-accent shadow-sm backdrop-blur">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-accent animate-ping-soft" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                </span>
                Ajansınız için SEO + AI görünürlük paneli
              </span>
            </Reveal>
            <Reveal delay={80} as="h1" className="hero-title text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.04]">
              Google&apos;da sırala, <span className="text-accent">AI&apos;da görün</span>
              <span className="block text-3xl sm:text-4xl lg:text-5xl font-medium italic text-ink/40 mt-2">— elle uğraşmadan.</span>
            </Reveal>
            <Reveal delay={160} as="p" className="mx-auto max-w-2xl text-base sm:text-lg text-ink/60">
              Teknik SEO denetimini ve ChatGPT, Claude, Gemini, Perplexity üzerinde gerçek prompt testlerini aynı panelde
              çalıştır. Markanın birine AI&apos;ya soru sorduğunda hatırlanıp hatırlanmadığını gör — Türkçe ve İngilizce ayrı ayrı.
            </Reveal>
            <Reveal delay={240}>
              <HeroUrlForm />
            </Reveal>
            <Reveal delay={300} className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-ink/45">
              <span>✓ Kart bilgisi gerekmez</span>
              <span>✓ Hesap açmadan dene</span>
              <span>✓ 8 AI motoru</span>
            </Reveal>
          </div>

          <div className="relative mx-auto max-w-5xl">
            <div className="pointer-events-none absolute -inset-x-12 top-12 bottom-0 rounded-[3rem] bg-gradient-to-r from-accent/30 via-geo/30 to-pink-300/30 blur-3xl" aria-hidden />
            <Reveal variant="tilt" delay={200} className="relative">
              <HeroDashboardPreview />
            </Reveal>
            <span className="absolute -left-6 top-1/4 hidden lg:inline-flex items-center gap-2 rounded-2xl border border-border bg-panel px-4 py-3 text-xs font-bold shadow-xl animate-float" aria-hidden>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-seo/15 text-seo">↑</span>
              ChatGPT&apos;de görünüyorsun
            </span>
            <span className="absolute -right-6 bottom-1/4 hidden lg:inline-flex items-center gap-2 rounded-2xl border border-border bg-panel px-4 py-3 text-xs font-bold shadow-xl animate-float" style={{ animationDelay: "1.5s" }} aria-hidden>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-danger/10 text-danger">!</span>
              GPTBot robots.txt&apos;te engelli
            </span>
          </div>

          <Reveal>
            <EngineMarquee />
          </Reveal>
        </div>
      </section>

      <StatsBand
        items={[
          { value: 8, label: "AI motoru tek panelde" },
          { value: 4, label: "katman: SEO · AXO · AEO · GEO" },
          { value: 11, label: "araç, birbirinin verisini kullanır" },
          { value: 8, label: "kaynak tipi sınıflandırması" },
        ]}
      />

      <AiAnswerDemo />

      {/* Gerçek ekran görüntüleriyle iki ana ürün */}
      <section className="space-y-24">
        {SHOWCASES.map((s) => (
          <div key={s.eyebrow} className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <Reveal variant={s.imageSide === "right" ? "right" : "left"} className={`relative ${s.imageSide === "right" ? "lg:order-2" : ""}`}>
              <div className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-accent/15 via-geo/15 to-pink-300/15 blur-2xl" aria-hidden />
              <div className="relative transition-transform duration-500 hover:-translate-y-1 hover:rotate-[0.4deg]">
                <BrowserFrame {...s.image} />
              </div>
              <p className="relative mt-3 text-center text-xs text-ink/30">Gerçek ekran görüntüsü — bu sitenin kendi sonucu, uydurma veri değil.</p>
            </Reveal>
            <Reveal variant={s.imageSide === "right" ? "left" : "right"} delay={100} className={s.imageSide === "right" ? "lg:order-1" : ""}>
              <span className="pill-outline bg-accent/5">{s.eyebrow}</span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">{s.title}</h2>
              <ul className="mt-6 space-y-3.5">
                {s.points.map((p, i) => (
                  <Reveal as="li" key={p} delay={150 + i * 90} className="flex items-start gap-3 text-sm text-ink/70">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-white">{CHECK_ICON}</span>
                    {p}
                  </Reveal>
                ))}
              </ul>
              <Link
                href={s.cta.href}
                className="group mt-7 inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-bold text-white shadow-lg shadow-accent/25 transition-all hover:-translate-y-0.5"
              >
                {s.cta.label}
                <span className="transition-transform group-hover:translate-x-1" aria-hidden>→</span>
              </Link>
            </Reveal>
          </div>
        ))}
      </section>

      {/* Tek panel, üç iş — bento */}
      <section id="tum-araclar" className="space-y-10 scroll-mt-24">
        <Reveal className="mx-auto max-w-2xl text-center space-y-3">
          <span className="pill-outline bg-accent/5">TÜM ARAÇLAR</span>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Tek panel, üç iş</h2>
          <p className="text-ink/60">Denetim, otomasyon ve müşteri yönetimi — hepsi aynı yerde, birbirinin verisini kullanarak.</p>
        </Reveal>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {GROUPS.map((group, gi) => (
            <Reveal
              key={group.title}
              variant="scale"
              delay={gi * 110}
              spotlight
              className="rounded-3xl border border-border bg-panel p-6 space-y-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-accent/10"
            >
              <div>
                <div className={`inline-flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase ${group.tone}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {group.title}
                </div>
                <p className="mt-1.5 text-sm text-ink/50">{group.description}</p>
              </div>
              <div className="space-y-1 pt-2 border-t border-border">
                {group.items.map((item) => (
                  <div key={item.label} className="group/item -mx-2 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/70">
                    <Link href={item.href} className="block">
                      <div className="flex items-center justify-between text-sm font-semibold group-hover/item:text-accent transition-colors">
                        {item.label}
                        <span className="text-ink/20 transition-all group-hover/item:translate-x-1 group-hover/item:text-accent">→</span>
                      </div>
                      <p className="mt-0.5 text-xs text-ink/50">{item.body}</p>
                    </Link>
                    {"landingHref" in item && item.landingHref && (
                      <Link href={item.landingHref} className="mt-1 inline-block text-xs font-semibold text-accent hover:underline">
                        Örnekle gör →
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <div id="nasil-calisir" className="scroll-mt-24">
        <FeatureSteps
          heading="Nasıl çalışır?"
          subheading="Üç adımda kurulum — kod yazmana, entegrasyon beklemene gerek yok."
          steps={STEPS.map((s) => ({ title: s.title, body: s.body }))}
          note={null}
        />
      </div>

      <FAQSection items={FAQ} />

      <FeatureCTA
        title="Markanı Google'da ve AI motorlarında test et"
        body="Şu an ücretsiz test modunda — hesap açmana bile gerek yok."
        cta={{ href: "/audit", label: "Panele git" }}
      />
    </div>
  );
}
