import Link from "next/link";

/** Simple, honest footer — no fabricated legal pages or company details that don't exist yet. */
export default function Footer() {
  return (
    <footer className="border-t border-border mt-16">
      <div className="mx-auto max-w-6xl px-4 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-sm text-ink/50">
        <div>
          <div className="font-semibold text-ink/80">
            Epicsem <span className="text-accent">·</span>{" "}
            <span className="font-normal text-ink/40">SEO + GEO/AEO</span>
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
        </nav>
      </div>
    </footer>
  );
}
