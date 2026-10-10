"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Ana sayfa hero'sundaki "sitenin adresini yaz" kutusu — arvow'daki e-posta kutusunun
 * karşılığı; doğrudan ücretsiz SEO + AXO denetimine (/audit?url=…) götürür. */
export default function HeroUrlForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = url.trim();
        router.push(v ? `/audit?url=${encodeURIComponent(v)}` : "/audit");
      }}
      className="mx-auto flex w-full max-w-xl flex-col sm:flex-row gap-2 rounded-2xl border border-border bg-panel/90 p-2 shadow-xl shadow-accent/10 backdrop-blur"
    >
      <div className="flex flex-1 items-center gap-2 px-3">
        <span className="text-ink/30">🌐</span>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="siteniz.com"
          aria-label="Sitenizin adresi"
          className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-ink/30"
        />
      </div>
      <button
        type="submit"
        className="group inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-bold text-white shadow-lg shadow-accent/30 transition-all hover:-translate-y-0.5"
      >
        Ücretsiz analiz et
        <span className="transition-transform group-hover:translate-x-1">→</span>
      </button>
    </form>
  );
}
