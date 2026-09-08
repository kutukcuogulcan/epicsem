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
        muted: "#f1f5f9",
        border: "#e2e8f0",
        ink: "#0f172a",
        accent: "#5d16ff",
        seo: "#16a34a",
        geo: "#a78bfa",
        warn: "#d97706",
        danger: "#dc2626",
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
