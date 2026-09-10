import Link from "next/link";

/**
 * Simple, honest footer. /privacy and /terms are real pages (see app/privacy,
 * app/terms) — both explicitly marked as drafts pending legal review, not fabricated
 * finished documents, so linking them here isn't claiming more than is true.
 */
export default function Footer() {
  return (
    <footer className="border-t border-border mt-16">
      <div className="mx-auto max-w-6xl px-4 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-sm text-ink/50">
        <div>
          <div className="flex items-center gap-2 font-extrabold text-ink/80">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-accent text-white text-[11px] font-extrabold">
              E
            </span>
            Epicsem <span className="font-medium text-ink/40">· SEO + GEO/AEO</span>
          </div>
          <p className="mt-1 max-w-sm text-xs text-ink/40">
            Klasik arama sıralaması ve AI motorlarındaki görünürlük tek panelde. Şu an test aşamasında.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/audit" className="hover:text-accent transition-colors">Audit</Link>
          <Link href="/geo" className="hover:text-accent transition-colors">GEO/AEO</Link>
          <Link href="/gap" className="hover:text-accent transition-colors">Gap Analysis</Link>
          <Link href="/pricing" className="hover:text-accent transition-colors">Fiyatlandırma</Link>
          <Link href="/privacy" className="hover:text-accent transition-colors">Gizlilik</Link>
          <Link href="/terms" className="hover:text-accent transition-colors">Kullanım Şartları</Link>
        </nav>
      </div>
    </footer>
  );
}
