import type { Metadata } from "next";
// Eudoxus Sans is the exact font arvow.com uses — loaded from Fontshare's free CDN
// (see the <link> tags below), the same way arvow.com itself serves it. Plus Jakarta
// Sans stays as a self-hosted fallback (via @fontsource, bundled at build time) for the
// rare case the Fontshare CDN doesn't load — it's the same rounded/geometric family of
// look, so the fallback still reads close to the target instead of dropping to a plain
// system font.
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
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=eudoxus-sans@400,500,600,700,800&display=swap"
        />
      </head>
      <body className="min-h-screen flex flex-col font-sans">
        <Nav />
        <main className="mx-auto max-w-6xl px-4 py-8 flex-1 w-full">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
