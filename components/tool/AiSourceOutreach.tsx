"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AiSource, OutreachStatus } from "@/lib/ai-source-outreach";

interface Item extends AiSource {
  page: { rivals: string[]; you: boolean; linksYou: boolean } | null;
  plan: { status: OutreachStatus; label: string; action: string };
}

const TYPE_TR: Record<string, string> = { Editorial: "Editoryal", UGC: "Forum / topluluk", Reference: "Referans", Government: "Kamu", Corporate: "Kurumsal", Other: "Diğer", Competitor: "Rakip", You: "Sen" };
const STATUS_CLS: Record<OutreachStatus, string> = {
  "rakip-var-sen-yok": "bg-danger/10 text-danger-ink",
  "kimse-yok": "bg-warn/10 text-warn-ink",
  aniliyorsun: "bg-seo/10 text-seo-ink",
  okunamadi: "bg-muted text-sub",
};

/** Backlinkler: AI'ın GEO testinde kaynak gösterdiği dış siteler — en değerli link/anılma fırsatları (ücretsiz). */
export default function AiSourceOutreach({ site, onPitch }: { site: string; onPitch?: (domain: string, url: string, competitors: string[]) => void }) {
  const [d, setD] = useState<{ items: Item[]; needsGeo?: boolean; geoAt?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setD(null);
    setErr(null);
    fetch(`/api/backlinks/ai-sources?site=${encodeURIComponent(site)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Yüklenemedi");
        setD(j);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Yüklenemedi"));
  }, [site]);

  return (
    <div className="rounded-2xl border border-border bg-panel p-5 shadow-[0_1px_2px_rgba(13,18,28,0.05)]">
      <h2 className="text-sm font-semibold">AI&apos;ın kaynak gösterdiği siteler: en değerli link fırsatları</h2>
      <p className="mt-1 text-xs text-sub">
        Son GEO testinde ChatGPT, Gemini ve Claude cevaplarında bu sayfaları gösterdi. Burada anılmak hem link hem de AI cevabına girme demek. Sayfalar açılıp kimin anıldığı kodla sayıldı; ücretsiz.
      </p>
      {err ? (
        <p className="mt-3 text-sm text-danger-ink">{err}</p>
      ) : !d ? (
        <p className="mt-3 text-sm text-sub">Kaynak sayfalar okunuyor… (ilk seferde ~20 saniye)</p>
      ) : d.needsGeo ? (
        <p className="mt-3 text-sm text-sub">
          Bu site için gerçek bir GEO testi yok. <Link href="/geo" className="font-medium text-accent hover:underline">GEO testini çalıştır →</Link>
        </p>
      ) : !d.items.length ? (
        <p className="mt-3 text-sm text-sub">Son GEO testinde AI kendi siten ve rakipler dışında kaynak göstermedi.</p>
      ) : (
        <ol className="mt-3 divide-y divide-border rounded-xl border border-border">
          {d.items.map((it) => (
            <li key={it.url} className="px-4 py-3 text-[13px]">
              <div className="flex flex-wrap items-center gap-2">
                <a href={it.url} target="_blank" rel="noreferrer" className="min-w-0 max-w-full truncate font-medium text-ink hover:text-accent hover:underline">
                  {it.domain}
                  <span className="font-normal text-sub">{(() => { try { const p = new URL(it.url).pathname; return p === "/" ? "" : p; } catch { return ""; } })()}</span>
                </a>
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-sub">{TYPE_TR[it.type] ?? it.type}</span>
                <span className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${STATUS_CLS[it.plan.status]}`}>{it.plan.label}</span>
              </div>
              <div className="mt-1 text-xs text-sub">
                {it.cites} AI cevabında kaynak{it.withoutYou ? ` · ${it.withoutYou} tanesinde sen anılmadın` : ""} · Soru: {it.prompts.slice(0, 2).map((p) => `“${p}”`).join(", ")}
                {it.prompts.length > 2 ? ` +${it.prompts.length - 2}` : ""}
              </div>
              <div className="mt-1.5 flex flex-wrap items-start gap-2 rounded-lg bg-accent/[0.05] px-3 py-1.5 text-ink">
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-accent">Nasıl ulaşılır: </span>
                  {it.plan.action}
                </span>
                {onPitch && it.type !== "UGC" && it.plan.status !== "okunamadi" && !(it.page?.you && it.page.linksYou) && (
                  <button type="button" onClick={() => onPitch(it.domain, it.url, it.page?.rivals ?? [])} className="shrink-0 text-xs font-medium text-accent hover:underline">
                    E-posta taslağı →
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
