import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#faf9ff",
        panel: "#ffffff",
        muted: "#f1eefb",
        border: "#e5e0f5",
        ink: "#1e1b29",
        accent: "#7c3aed",
        seo: "#16a34a",
        geo: "#a78bfa",
        warn: "#d97706",
        danger: "#dc2626",
      },
    },
  },
  plugins: [],
};

export default config;
