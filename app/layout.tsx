import type { Metadata } from "next";
import localFont from "next/font/local";
// arvow.com's actual font is "Eudoxus Sans" by Stijn de Vries — an open-source geometric
// sans released under the SIL Open Font License (OFL), which explicitly permits self-
// hosting/bundling in a commercial site. The font used to be servable from Fontshare's
// free CDN, but Fontshare has since pulled it from their catalog, so we self-host the
// original files instead (downloaded from the font's own official source, see
// app/fonts/eudoxus-sans/LICENSE.md) via next/font/local — no external CDN dependency.
// Plus Jakarta Sans (the family Eudoxus Sans is itself built on top of, also self-hosted)
// stays as the fallback for any weight/glyph Eudoxus Sans doesn't cover.
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/plus-jakarta-sans/800.css";
import "./globals.css";
import { headers } from "next/headers";
import Nav from "@/components/Nav";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";
import { SITE_URL, SITE_NAME } from "@/lib/site";

// Organization + WebSite JSON-LD, site-wide. Deliberately minimal and honest — only
// fields that are actually true today (name, url, description). No invented founding
// date, address, or sameAs social links; see components/Footer.tsx's no-fabrication
// policy. /audit itself flags a page for missing structured data, so this app carries
// its own.
const ORG_SCHEMA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      description: "SEO, GEO/AEO ve AXO görünürlüğünü tek panelde ölçen bir denetim ve izleme aracı.",
    },
    {
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL,
    },
  ],
};

const eudoxusSans = localFont({
  src: [
    { path: "./fonts/eudoxus-sans/EudoxusSans-ExtraLight.woff2", weight: "200", style: "normal" },
    { path: "./fonts/eudoxus-sans/EudoxusSans-Light.woff2", weight: "300", style: "normal" },
    { path: "./fonts/eudoxus-sans/EudoxusSans-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/eudoxus-sans/EudoxusSans-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/eudoxus-sans/EudoxusSans-Bold.woff2", weight: "700", style: "normal" },
    { path: "./fonts/eudoxus-sans/EudoxusSans-ExtraBold.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-eudoxus",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Epicsem — SEO + GEO/AEO Visibility Tool",
  description: "One dashboard for classic search rankings and AI-answer visibility.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Set by middleware.ts on every request — decides which chrome this page gets.
  // Tool pages (dashboard, audit, geo, …) get the sidebar app-shell; everything else
  // (homepage, pricing, login, legal pages) keeps the original top-nav marketing shell.
  const headersList = await headers();
  const isAppShell = headersList.get("x-shell") === "app";

  return (
    <html lang="en" className={eudoxusSans.variable}>
      <body className="font-sans">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_SCHEMA) }}
        />
        {isAppShell ? (
          <div className="min-h-screen flex flex-col md:flex-row">
            <Sidebar />
            <main className="flex-1 min-w-0">
              <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
            </main>
          </div>
        ) : (
          <div className="min-h-screen flex flex-col">
            <Nav />
            <main className="mx-auto max-w-6xl px-4 py-8 flex-1 w-full">{children}</main>
            <Footer />
          </div>
        )}
      </body>
    </html>
  );
}
