import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import LogoutButton from "./LogoutButton";

export default async function Nav() {
  const user = await getCurrentUser();

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
          <Link href="/import" className="hover:text-accent transition-colors">Bulk Import</Link>
          <Link href="/clients" className="hover:text-accent transition-colors">Clients</Link>
          <Link href="/prompts" className="hover:text-accent transition-colors">Claude Code Prompts</Link>
          {user ? (
            <div className="flex items-center gap-3 pl-2 border-l border-border">
              <span className="text-xs text-ink/50">{user.email}</span>
              <LogoutButton />
            </div>
          ) : (
            <Link href="/login" className="text-accent hover:underline">Giriş yap</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
