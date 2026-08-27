import Link from "next/link";

export default function Nav() {
  return (
    <header className="border-b border-border bg-panel/80 backdrop-blur sticky top-0 z-10">
      <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between flex-wrap gap-y-2">
        <Link href="/" className="font-semibold text-lg tracking-tight">
          Epicsem <span className="text-accent">·</span>{" "}
          <span className="text-sm font-normal text-ink/50">SEO + GEO/AEO</span>
        </Link>
        <nav className="flex items-center gap-5 text-sm text-ink/70 flex-wrap">
          <Link href="/audit" className="hover:text-accent transition-colors">SEO + AXO Audit</Link>
          <Link href="/geo" className="hover:text-accent transition-colors">GEO/AEO Visibility</Link>
          <Link href="/gap" className="hover:text-accent transition-colors">Gap Analysis</Link>
          <Link href="/monitor" className="hover:text-accent transition-colors">Monitoring</Link>
          <Link href="/clients" className="hover:text-accent transition-colors">Clients</Link>
        </nav>
      </div>
    </header>
  );
}
