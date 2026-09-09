import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";

export const metadata = {
  title: "Fiyatlandırma — Epicsem",
  description: "Epicsem şu an ücretsiz test aşamasında. Ücretli planlar test süreci bitince duyurulacak.",
};

const FREE_PLAN_ITEMS = [
  "SEO + AXO Audit — sınırsız",
  "GEO/AEO Visibility — tüm motorlar (OpenAI, Anthropic, Google, Perplexity, DeepSeek, xAI)",
  "Gap Analysis + Content Studio (WordPress + Shopify)",
  "AXO Monitoring + Bulk Import",
  "Yerel İşletme araçları (GBP gönderi + yorum yanıtı taslağı)",
  "Sınırsız müşteri (Clients)",
  "Hesap açmadan panele erişim (demo modu)",
];

const CHECK_ICON = (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M2.5 6.5L4.5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function PricingPage() {
  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-accent/[0.06] via-geo/10 to-transparent px-6 sm:px-10 py-14 sm:py-16">
        <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-accent/20 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-geo/20 blur-3xl" aria-hidden />
        <div className="relative space-y-2 max-w-2xl">
          <Breadcrumb items={[{ label: "Ana Sayfa", href: "/" }, { label: "Fiyatlandırma" }]} />
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">Fiyatlandırma</h1>
          <p className="text-ink/60 text-base">
            Epicsem henüz genel yayında değil — şu an test aşamasındayız, o yüzden aşağıdaki tek plan gerçek: hepsi
            dahil, ücretsiz. Ücretli planlar test süreci bitip gerçek kullanıcılar başladığında burada duyurulacak.
          </p>
        </div>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="card border-2 border-accent/40 space-y-5 p-6 sm:p-7">
          <div>
            <span className="pill-outline">Şu an aktif</span>
            <div className="mt-3 text-4xl font-extrabold">Ücretsiz</div>
            <p className="mt-1 text-sm text-ink/50">Test aşaması boyunca</p>
          </div>
          <ul className="space-y-2.5 text-sm text-ink/70 font-medium border-t border-border pt-5">
            {FREE_PLAN_ITEMS.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                  {CHECK_ICON}
                </span>
                {item}
              </li>
            ))}
          </ul>
          <Link
            href="/audit"
            className="block text-center rounded-lg bg-accent text-white px-4 py-2.5 text-sm font-bold hover:opacity-90 transition-opacity"
          >
            Panele git
          </Link>
        </div>

        <div className="card space-y-4 p-6 sm:p-7 opacity-70">
          <div>
            <span className="pill-outline border-ink/20 text-ink/40">Yakında</span>
            <div className="mt-3 text-4xl font-extrabold text-ink/40">Ajans planı</div>
            <p className="mt-1 text-sm text-ink/40">Fiyat henüz belirlenmedi</p>
          </div>
          <p className="text-sm text-ink/50 border-t border-border pt-5">
            Test süreci bitip tüm AI motoru anahtarları etkin hale geldiğinde (bağlantılar kademeli olarak
            ekleniyor), kullanım hacmine göre bir ücretli plan tanımlanacak. O ana kadar mevcut ücretsiz erişim
            aynen sürüyor.
          </p>
        </div>
      </div>
    </div>
  );
}
