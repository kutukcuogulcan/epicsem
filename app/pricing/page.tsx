import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";

export const metadata = {
  title: "Fiyatlandırma — Epicsem",
  description: "Epicsem şu an ücretsiz test aşamasında. Ücretli planlar test süreci bitince duyurulacak.",
};

export default function PricingPage() {
  return (
    <div className="space-y-8 max-w-3xl">
      <div className="space-y-2">
        <Breadcrumb items={[{ label: "Ana Sayfa", href: "/" }, { label: "Fiyatlandırma" }]} />
        <h1 className="text-4xl font-extrabold tracking-tight">Fiyatlandırma</h1>
        <p className="text-ink/60 text-sm">
          Epicsem henüz genel yayında değil — şu an test aşamasındayız, o yüzden aşağıdaki tek plan gerçek: hepsi
          dahil, ücretsiz. Ücretli planlar test süreci bitip gerçek kullanıcılar başladığında burada duyurulacak.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="card border-2 border-accent/40 space-y-4">
          <div>
            <span className="pill-outline">Şu an aktif</span>
            <div className="mt-2 text-4xl font-extrabold">Ücretsiz</div>
            <p className="mt-1 text-sm text-ink/50">Test aşaması boyunca</p>
          </div>
          <ul className="space-y-2 text-sm text-ink/70 font-medium">
            <li>✓ SEO + AXO Audit — sınırsız</li>
            <li>✓ GEO/AEO Visibility — tüm motorlar (OpenAI, Anthropic, Google, Perplexity, DeepSeek, xAI)</li>
            <li>✓ Gap Analysis + Content Studio</li>
            <li>✓ AXO Monitoring + Bulk Import</li>
            <li>✓ Sınırsız müşteri (Clients)</li>
            <li>✓ Hesap açmadan panele erişim (demo modu)</li>
          </ul>
          <Link
            href="/audit"
            className="block text-center rounded-lg bg-accent text-white px-4 py-2.5 text-sm font-bold hover:opacity-90 transition-opacity"
          >
            Panele git
          </Link>
        </div>

        <div className="card space-y-4 opacity-70">
          <div>
            <span className="pill-outline border-ink/20 text-ink/40">Yakında</span>
            <div className="mt-2 text-4xl font-extrabold text-ink/40">Ajans planı</div>
            <p className="mt-1 text-sm text-ink/40">Fiyat henüz belirlenmedi</p>
          </div>
          <p className="text-sm text-ink/50">
            Test süreci bitip gerçek AI motoru anahtarları eklendiğinde (şu an demo modunda çalışıyoruz),
            kullanım hacmine göre bir ücretli plan tanımlanacak. O ana kadar mevcut ücretsiz erişim aynen sürüyor.
          </p>
        </div>
      </div>
    </div>
  );
}
