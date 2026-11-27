"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, ErrorBlock, PageHeader, PageSkeleton } from "@/components/ui";

interface Meter {
  used: number;
  limit: number;
}
interface Usage {
  plan: string;
  planLabel: string;
  demoMode: boolean;
  engineQueries: Meter;
  contentGenerations: Meter;
  promptSuggestions: Meter;
  onboardingSetup: Meter;
  pool: Meter | null;
}

const ROWS: { key: keyof Pick<Usage, "engineQueries" | "contentGenerations" | "promptSuggestions" | "onboardingSetup">; label: string; what: string }[] = [
  { key: "engineQueries", label: "AI motor sorgusu", what: "GEO testleri (soru × motor), AI özeti ve analizler, anahtar kelime ve yazı araştırması." },
  { key: "contentGenerations", label: "İçerik üretimi", what: "Editörde ve Autoblog'da yazılan her yazı." },
  { key: "promptSuggestions", label: "Soru önerisi", what: "GEO için AI'ın önerdiği takip soruları." },
  { key: "onboardingSetup", label: "Otomatik kurulum", what: "Site ekleyince marka profili, rakip ve soru çıkarma adımları." },
];

const tone = (p: number) => (p >= 90 ? "bg-danger" : p >= 70 ? "bg-warn" : "bg-accent");

/** Kullanım: plan, aylık kotalar, ne neyi harcar, ne zaman sıfırlanır. Ödeme yok; plan elle değiştirilir. */
export default function UsagePage() {
  const [u, setU] = useState<Usage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/usage")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Kullanım alınamadı");
        setU(d);
      })
      .catch((e) => setErr(e.message));
  }, []);
  if (err) return <ErrorBlock message={err} />;
  if (!u) return <PageSkeleton cards={2} />;
  const now = new Date();
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
  const poolPct = u.pool && u.pool.limit ? Math.min(100, Math.round((u.pool.used / u.pool.limit) * 100)) : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Kullanım" description={`Plan: ${u.planLabel} · kotalar ${reset}'da sıfırlanır.${u.demoMode ? " Demo modunda AI çağrısı yapılmaz, kota düşmez." : ""}`} />

      {u.plan === "guest" && (
        <Card>
          <p className="text-sm text-ink">
            <span className="font-medium">Deneme alanındasın.</span> Projelerin yalnızca bu tarayıcıda görünür. Deneme alanlarının kotası küçüktür ve bütün deneme alanları ayrıca ortak bir aylık havuzu paylaşır.
          </p>
          {u.pool && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-sub">
                <span>Deneme alanlarının ortak havuzu (AI motor sorgusu)</span>
                <span className="tabular-nums">{Math.round(100 - poolPct)}% kaldı</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-muted">
                <div className={`h-2 rounded-full ${tone(poolPct)}`} style={{ width: `${poolPct}%` }} />
              </div>
            </div>
          )}
        </Card>
      )}

      <Card>
        <CardHeader title="Bu ay" subtitle="Her işlem başlamadan kotadan ayrılır; cevap gelmeyen sorgular geri iade edilir." />
        <ul className="mt-3 divide-y divide-border">
          {ROWS.map((r) => {
            const m = u[r.key];
            const p = m.limit ? Math.min(100, Math.round((m.used / m.limit) * 100)) : 0;
            return (
              <li key={r.key} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-ink">{r.label}</span>
                  <span className="text-sm tabular-nums text-ink">
                    {m.used.toLocaleString("tr-TR")} / {m.limit.toLocaleString("tr-TR")}
                  </span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-muted">
                  <div className={`h-2 rounded-full ${tone(p)}`} style={{ width: `${p}%` }} />
                </div>
                <p className="mt-1 text-xs text-sub">
                  {r.what}
                  {p >= 90 && <span className="font-medium text-danger-ink"> Sınıra yakın.</span>}
                </p>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
