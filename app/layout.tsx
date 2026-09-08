import type { Metadata } from "next";
// A bold, geometric sans — the same family of look as most modern AI-SEO-tool sites
// (rounded terminals, reads confidently at heavy weights for headlines) instead of the
// plain system-font stack the app used before. Self-hosted via @fontsource (npm) rather
// than next/font/google's Google Fonts CSS fetch, which this build environment's network
// can't reach — @fontsource ships the actual font files as package assets.
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
