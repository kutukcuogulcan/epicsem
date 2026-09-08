import type { Metadata } from "next";
// arvow.com's actual font is "Eudoxus Sans" — an open-source geometric sans (OFL) that
// is itself explicitly built on top of Plus Jakarta Sans (same letterforms/family, just
// a handful of tweaks), per its own README. It used to be servable from Fontshare's free
// CDN, but Fontshare has since pulled it from their catalog (the endpoint now returns an
// empty stylesheet), so we self-host the font it's based on instead via @fontsource —
// same look, reliably bundled at build time rather than depending on a live CDN.
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/plus-jakarta-sans/800.css";
import "./globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Epicsem — SEO + GEO/AEO Visibility Tool",
  description: "One dashboard for classic search rankings and AI-answer visibility.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col font-sans">
        <Nav />
        <main className="mx-auto max-w-6xl px-4 py-8 flex-1 w-full">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
