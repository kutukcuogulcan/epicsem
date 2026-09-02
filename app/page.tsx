import Link from "next/link";

const GROUPS = [
  {
    title: "Analiz & Test",
    description: "Bir sayfanın teknik olarak sağlam olup olmadığını ve AI motorlarında gerçekten görünüp görünmediğini ölç.",
    tone: "text-accent",
    items: [
      { label: "SEO + AXO Audit", href: "/audit", body: "Title/meta, başlıklar, structured data, robots.txt & sitemap — ve GPTBot, ClaudeBot, PerplexityBot gibi AI crawler'ların sayfaya erişip erişemediği." },
      { label: "GEO/AEO Visibility", href: "/geo", body: "ChatGPT, Claude, Gemini, Perplexity'e gerçek promptlar gönder; marka anılıyor mu, rakiplere göre nerede, hangi kaynaklar referans gösteriliyor gör." },
      { label: "Gap Analysis", href: "/gap", body: "Denetim sonucu ile GEO sonucunu çaprazlar: teknik olarak sağlam ama hiç anılmayan sayfaları bulur." },
    ],
  },
  {
    title: "Otomasyon",
    description: "Bir kere kur, arkasında çalışsın — elle kontrol etmene gerek kalmasın.",
    tone: "text-warn",
    items: [
      { label: "AXO Monitoring", href: "/monitor", body: "Kritik sayfaları zamanla izler, daha önce izinli olan bir AI crawler robots.txt'te engellenirse Slack'e anında haber verir." },
      { label: "Bulk Import", href: "/import", body: "Screaming Frog CSV'ini yükle, tüm site için eksik meta/başlık/thin content sorunlarını tek seferde gör." },
      { label: "Content Studio", href: "/content", body: "Kaybedilen promptları somut başlık/FAQ önerilerine çevirir, taslağı WordPress'e yayınlar." },
    ],
  },
  {
    title: "Yönetim",
    description: "Birden fazla müşteri yönetiyorsan, her birinin markasını bir kere kaydet, her yerde tekrar kullan.",
    tone: "text-seo",
    items: [
      { label: "Clients", href: "/clients", body: "Her müşterinin marka/rakip bilgisini kaydet, audit/GEO/gap koşularında tekrar kullan, Epicsem markalı PDF rapor indir." },
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
    <div className="space-y-20">
      <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-accent/[0.06] via-geo/10 to-transparent px-6 sm:px-10 py-16 sm:py-20">
        <p className="text-sm uppercase tracking-widest text-accent font-medium">Ajansınız için SEO + AI görünürlük paneli</p>
        <h1 className="mt-4 text-4xl sm:text-5xl font-semibold tracking-tight max-w-3xl">
          Google&apos;da sırala, <span className="text-accent">AI motorlarında</span> görün.
        </h1>
        <p className="mt-4 text-ink/60 max-w-2xl text-base sm:text-lg">
          Epicsem, klasik teknik SEO denetimini ve ChatGPT / Claude / Gemini / Perplexity üzerinde gerçek prompt
          testlerini aynı panelde çalıştırır — markanın sadece Google&apos;da değil, birine AI&apos;ya soru
          sorduğunda da hatırlanıp hatırlanmadığını gösterir.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/audit" className="rounded-lg bg-accent text-white px-6 py-3 text-sm font-medium hover:opacity-90 transition-opacity">
            Panele git — ücretsiz dene
          </Link>
          <Link href="#nasil-calisir" className="rounded-lg border border-border bg-panel/60 px-6 py-3 text-sm font-medium hover:bg-muted transition-colors">
            Nasıl çalışır?
          </Link>
        </div>
      </section>

      <section className="space-y-8">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight">Tek panel, üç iş</h2>
          <p className="mt-2 text-ink/60">Denetim, otomasyon ve müşteri yönetimi — hepsi aynı yerde, birbirinin verisini kullanarak.</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {GROUPS.map((group) => (
            <div key={group.title} className="card space-y-4">
              <div>
                <div className={`text-xs font-semibold tracking-wide uppercase ${group.tone}`}>{group.title}</div>
                <p className="mt-1 text-sm text-ink/50">{group.description}</p>
              </div>
              <div className="space-y-3 pt-1 border-t border-border">
                {group.items.map((item) => (
                  <Link key={item.label} href={item.href} className="block group/item pt-3 first:pt-3">
                    <div className="text-sm font-medium group-hover/item:text-accent transition-colors">{item.label}</div>
                    <p className="mt-0.5 text-xs text-ink/50">{item.body}</p>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="nasil-calisir" className="space-y-8 scroll-mt-24">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight">Nasıl çalışır?</h2>
          <p className="mt-2 text-ink/60">Üç adımda kurulum — kod yazmana, entegrasyon beklemene gerek yok.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {STEPS.map((step) => (
            <div key={step.n} className="card">
              <div className="w-8 h-8 rounded-full bg-accent/10 text-accent font-semibold flex items-center justify-center text-sm">
                {step.n}
              </div>
              <div className="mt-3 font-medium">{step.title}</div>
              <p className="mt-2 text-sm text-ink/60">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-2xl font-semibold tracking-tight">Sık sorulanlar</h2>
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
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">Markanı Google&apos;da ve AI motorlarında test et</h2>
        <p className="text-white/80 max-w-xl mx-auto">Şu an ücretsiz test modunda — hesap açmana bile gerek yok.</p>
        <Link
          href="/audit"
          className="inline-block rounded-lg bg-white text-accent px-6 py-3 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Panele git
        </Link>
      </section>
    </div>
  );
}
