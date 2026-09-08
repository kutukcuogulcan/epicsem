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
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={eudoxusSans.variable}>
      <body className="min-h-screen flex flex-col font-sans">
        <Nav />
        <main className="mx-auto max-w-6xl px-4 py-8 flex-1 w-full">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
