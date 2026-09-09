import Link from "next/link";
import BrowserFrame from "@/components/BrowserFrame";

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
    ],
  },
  {
    title: "Otomasyon",
    description: "Bir kere kur, arkasında çalışsın — elle kontrol etmene gerek kalmasın.",
    tone: "text-warn",
    items: [
      { label: "AXO Monitoring", href: "/monitor", body: "Kritik sayfaları zamanla izler, daha önce izinli olan bir AI crawler robots.txt'te engellenirse Slack'e anında haber verir.", landingHref: "/features/axo-monitoring" },
      { label: "Bulk Import", href: "/import", body: "Screaming Frog CSV'ini yükle, tüm site için eksik meta/başlık/thin content sorunlarını tek seferde gör.", landingHref: "/features/bulk-import" },
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
    <div className="space-y-28">
      <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-accent/[0.06] via-geo/10 to-transparent px-6 sm:px-10 py-20 sm:py-28">
        <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-accent/20 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-geo/25 blur-3xl" aria-hidden />
        <div className="relative">
          <span className="pill-outline bg-accent/5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Ajansınız için SEO + AI görünürlük paneli
          </span>
          <h1 className="mt-5 text-4xl sm:text-6xl font-extrabold tracking-tight max-w-3xl leading-[1.05]">
            Google&apos;da sırala, <span className="text-accent">AI motorlarında</span> görün
            <span className="italic font-medium text-ink/50"> — elle uğraşmadan.</span>
          </h1>
          <p className="mt-5 text-ink/60 max-w-2xl text-base sm:text-lg">
            Epicsem, klasik teknik SEO denetimini ve ChatGPT / Claude / Gemini / Perplexity üzerinde gerçek prompt
            testlerini aynı panelde çalıştırır — markanın sadece Google&apos;da değil, birine AI&apos;ya soru
            sorduğunda da hatırlanıp hatırlanmadığını gösterir. Türkçe promptları İngilizce eşdeğerinden ayrı test
            eder — e-ticaret satıcıları ve yerel işletmeler için Türkiye pazarına özel bir bakış açısı sunar.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/audit" className="rounded-lg bg-accent text-white px-6 py-3 text-sm font-bold hover:opacity-90 transition-opacity">
              Panele git — ücretsiz dene
            </Link>
            <Link href="#nasil-calisir" className="rounded-lg border border-border bg-panel px-6 py-3 text-sm font-bold hover:bg-muted transition-colors">
              Nasıl çalışır?
            </Link>
          </div>
          <p className="mt-6 text-xs text-ink/40 font-medium">
            Şu an ücretsiz test aşamasında — kart bilgisi ya da hesap açmadan deneyebilirsiniz.
          </p>
        </div>
      </section>

      <section className="space-y-20">
        {SHOWCASES.map((s) => (
          <div key={s.eyebrow} className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div className={s.imageSide === "right" ? "lg:order-2" : ""}>
              <BrowserFrame {...s.image} />
              <p className="mt-2 text-center text-xs text-ink/30">Gerçek ekran görüntüsü — bu sitenin kendi audit/GEO sonucu, uydurma veri değil.</p>
            </div>
            <div className={s.imageSide === "right" ? "lg:order-1" : ""}>
              <span className="pill-outline">{s.eyebrow}</span>
              <h2 className="mt-4 text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">{s.title}</h2>
              <ul className="mt-5 space-y-3">
                {s.points.map((p) => (
                  <li key={p} className="flex items-start gap-3 text-sm text-ink/70">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                      {CHECK_ICON}
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
              <Link href={s.cta.href} className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-accent text-white px-5 py-2.5 text-sm font-bold hover:opacity-90 transition-opacity">
                {s.cta.label}
                <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-8">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-extrabold tracking-tight">Tek panel, üç iş</h2>
          <p className="mt-2 text-ink/60">Denetim, otomasyon ve müşteri yönetimi — hepsi aynı yerde, birbirinin verisini kullanarak.</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {GROUPS.map((group) => (
            <div key={group.title} className="card space-y-4">
              <div>
                <div className={`inline-flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase ${group.tone}`}>
                  <span className={`h-1.5 w-1.5 rounded-full bg-current`} />
                  {group.title}
                </div>
                <p className="mt-1.5 text-sm text-ink/50">{group.description}</p>
              </div>
              <div className="space-y-3 pt-1 border-t border-border">
                {group.items.map((item) => (
                  <div key={item.label} className="pt-3 first:pt-3">
                    <Link href={item.href} className="block group/item">
                      <div className="text-sm font-semibold group-hover/item:text-accent transition-colors">{item.label}</div>
                      <p className="mt-0.5 text-xs text-ink/50">{item.body}</p>
                    </Link>
                    {"landingHref" in item && item.landingHref && (
                      <Link href={item.landingHref} className="mt-1 inline-block text-xs text-accent hover:underline">
                        Örnekle gör →
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="nasil-calisir" className="space-y-10 scroll-mt-24">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-extrabold tracking-tight">Nasıl çalışır?</h2>
          <p className="mt-2 text-ink/60">Üç adımda kurulum — kod yazmana, entegrasyon beklemene gerek yok.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
          {STEPS.map((step) => (
            <div key={step.n} className="card p-6 space-y-3">
              <div className="w-12 h-12 rounded-full bg-accent text-white font-extrabold flex items-center justify-center text-lg shadow-lg shadow-accent/20">
                {step.n}
              </div>
              <div className="font-bold text-lg">{step.title}</div>
              <p className="text-sm text-ink/60">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-3xl font-extrabold tracking-tight">Sık sorulanlar</h2>
        <div className="divide-y divide-border border-t border-b border-border">
          {FAQ.map((item) => (
            <details key={item.q} className="group py-4">
              <summary className="flex items-center justify-between cursor-pointer list-none text-sm font-medium">
                {item.q}
                <span className="text-ink/30 group-open:rotate-45 transition-transform text-lg leading-none">+</span>
              </summary>
              <p className="mt-2 text-sm text-ink/60 max-w-2xl">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="rounded-3xl bg-accent text-white px-6 sm:px-10 py-12 sm:py-14 text-center space-y-4">
        <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight">Markanı Google&apos;da ve AI motorlarında test et</h2>
        <p className="text-white/80 max-w-xl mx-auto">Şu an ücretsiz test modunda — hesap açmana bile gerek yok.</p>
        <Link
          href="/audit"
          className="inline-block rounded-lg bg-white text-accent px-6 py-3 text-sm font-bold hover:opacity-90 transition-opacity"
        >
          Panele git
        </Link>
      </section>
    </div>
  );
}
