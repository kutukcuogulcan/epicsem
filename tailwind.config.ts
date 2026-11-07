import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Crisp white/slate neutrals with violet used only as an accent — closer to a
        // modern SaaS look (white cards, near-black headings, slate body copy) than the
        // previous all-over lavender tint.
        paper: "#f8fafc",
        panel: "#ffffff",
        muted: "#f5f5f5",
        /** İkincil metin (Arvow: #535862). */
        sub: "#535862",
        border: "#e9eaeb",
        ink: "#0a0d12",
        accent: "#4f00ff",
        seo: "#10b981",
        geo: "#a78bfa",
        warn: "#f59e0b",
        danger: "#ef4444",
      },
      fontFamily: {
        // Eudoxus Sans (arvow.com's actual font, self-hosted via next/font/local — see
        // app/layout.tsx) first, then the self-hosted Plus Jakarta Sans fallback it's
        // built on top of, then system fonts.
        sans: ["var(--font-eudoxus)", "\"Plus Jakarta Sans\"", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
