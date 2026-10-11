import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { createElement as h } from "react";
import { isDemoMode } from "./geo-providers";

/**
 * Yazı kapak görselleri.
 *  - branded: başlık + marka adından üretilen ücretsiz kapak (AI yok, satori ile PNG).
 *  - ai:      OpenAI görsel modeli ile konuya uygun fotoğraf (OPENAI_API_KEY varsa; ücretli).
 */

let fonts: { bold: Buffer; medium: Buffer } | null = null;
async function loadFonts() {
  if (!fonts) {
    const dir = path.join(process.cwd(), "assets", "fonts");
    fonts = { bold: await readFile(path.join(dir, "Poppins-Bold.ttf")), medium: await readFile(path.join(dir, "Poppins-Medium.ttf")) };
  }
  return fonts;
}

const PALETTES = [
  ["#5d16ff", "#9b6bff"],
  ["#0f766e", "#14b8a6"],
  ["#1d4ed8", "#60a5fa"],
  ["#be123c", "#fb7185"],
  ["#b45309", "#f59e0b"],
  ["#334155", "#64748b"],
];

function hash(s: string) {
  let x = 0;
  for (const c of s) x = (x * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(x);
}

export async function brandedCover(title: string, brand: string, domain: string): Promise<Buffer> {
  const f = await loadFonts();
  const [c1, c2] = PALETTES[hash(domain || brand) % PALETTES.length];
  const t = title.replace(/^\[DEMO\]\s*/, "");
  const size = t.length > 70 ? 54 : t.length > 45 ? 64 : 76;
  const img = new ImageResponse(
    h(
      "div",
      {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
          color: "white",
          fontFamily: "Poppins",
        },
      },
      h(
        "div",
        { style: { display: "flex", alignItems: "center", gap: 16, fontSize: 30, fontWeight: 500, opacity: 0.9 } },
        h("div", { style: { width: 44, height: 44, borderRadius: 12, background: "rgba(255,255,255,0.22)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 } }, (brand || domain || "E").slice(0, 1).toUpperCase()),
        brand || domain
      ),
      h("div", { style: { display: "flex", fontSize: size, fontWeight: 700, lineHeight: 1.12, letterSpacing: -1, maxWidth: 1040 } }, t),
      h("div", { style: { display: "flex", fontSize: 26, fontWeight: 500, opacity: 0.8 } }, domain)
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Poppins", data: f.bold, weight: 700, style: "normal" },
        { name: "Poppins", data: f.medium, weight: 500, style: "normal" },
      ],
    }
  );
  return Buffer.from(await img.arrayBuffer());
}

export function aiCoverAvailable(): boolean {
  return !isDemoMode() && Boolean(process.env.OPENAI_API_KEY);
}

/** OpenAI görsel modeliyle kapak. Hata olursa null döner (çağıran markalı kapağa düşer). */
export async function aiCover(title: string, brand: string): Promise<{ mime: string; data: Buffer } | null> {
  if (!aiCoverAvailable()) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
        prompt: `Editorial blog header photo for an article titled "${title}" (${brand}). Realistic, natural light, no text, no logos, no watermarks, wide composition.`,
        size: "1536x1024",
        quality: "low",
        output_format: "jpeg",
        n: 1,
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const b64 = j?.data?.[0]?.b64_json;
    return b64 ? { mime: "image/jpeg", data: Buffer.from(b64, "base64") } : null;
  } catch {
    return null;
  }
}
