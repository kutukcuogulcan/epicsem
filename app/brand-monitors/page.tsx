"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ScoreRing, SentimentBar } from "@/components/tool/MonitorBits";
import { ErrorBlock, PageHeader, EmptyBlock, TableSkeleton } from "@/components/ui";
import { useProject } from "@/components/ProjectProvider";

interface Row {
  brandName: string;
  brandDomain: string;
  lastRunAt: string;
  runs: number;
  prompts: number;
  engines: number;
  visibility: number | null;
  sentiment: number | null;
  demoMode: boolean;
  schedule?: { active: boolean; intervalDays: number } | null;
}

const ago = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  return d <= 0 ? "bugün" : d === 1 ? "dün" : `${d} gün önce`;
};

/** LLM Marka Monitörleri — Arvow'daki gibi tüm markaların tek tabloda görünürlük ve duygu durumu. */
export default function BrandMonitorsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/brand-monitors")
      .then(async (r) => {
        if (r.status === 401) return void (window.location.href = "/login?next=/brand-monitors");
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Monitörler alınamadı");
        setRows(d.monitors);
      })
      .catch((e) => setErr(e.message));
  }, []);

  const { project } = useProject();
  const shown = (rows ?? [])
    .filter((r) => !q || `${r.brandName} ${r.brandDomain}`.toLocaleLowerCase("tr").includes(q.toLocaleLowerCase("tr")))
    .sort((a, b) => Number(b.brandDomain === project?.domain) - Number(a.brandDomain === project?.domain));

  return (
    <div className="space-y-6">
      <PageHeader
        badge="YENİ"
        title="LLM Marka Monitörleri"
        description="Markanın ChatGPT, Claude, Gemini, Perplexity ve diğer AI cevaplarında nasıl göründüğünü izle."
        actions={
          <Link href="/geo" className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            <span className="text-base leading-none">+</span> Yeni monitör
          </Link>
        }
      />

      <ErrorBlock message={err} />

      <div className="overflow-hidden rounded-2xl border border-border bg-panel shadow-[0_1px_2px_rgba(13,18,28,0.05)]">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <svg viewBox="0 0 20 20" className="h-4 w-4 text-ink/35" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="9" cy="9" r="5.5" />
            <path d="M13 13l3.5 3.5" />
          </svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Monitör ara…" className="flex-1 bg-transparent text-sm outline-none" />
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-[#fafafa] text-left text-xs font-medium text-sub">
              <th className="px-4 py-2.5 font-medium">Monitör</th>
              <th className="py-2.5 pr-4 font-medium">Durum</th>
              <th className="py-2.5 pr-4 text-center font-medium">Promptlar</th>
              <th className="hidden py-2.5 pr-4 text-center font-medium md:table-cell">Motorlar</th>
              <th className="py-2.5 pr-4 text-center font-medium">Görünürlük</th>
              <th className="py-2.5 pr-4 font-medium">Duygu</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows === null ? (
              <tr>
                <td colSpan={6} className="p-0">
                  <TableSkeleton bare rows={4} cols={5} />
                </td>
              </tr>
            ) : shown.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyBlock
                    title={q ? "Aramaya uyan monitör yok" : "Henüz monitör yok"}
                    description={q ? "Başka bir marka adı ya da alan adı dene." : "Bir marka için GEO testi çalıştırdığında burada monitör olarak görünür."}
                    action={
                      !q && (
                        <Link href="/geo" className="inline-flex h-8 items-center rounded-[10px] bg-accent px-3 text-sm font-medium text-white">
                          İlk monitörü oluştur →
                        </Link>
                      )
                    }
                  />
                </td>
              </tr>
            ) : (
              shown.map((r) => {
                const on = !!r.schedule?.active;
                return (
                  <tr key={r.brandDomain} onClick={() => router.push(`/brand-monitors/${encodeURIComponent(r.brandDomain)}`)} className="cursor-pointer hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`https://www.google.com/s2/favicons?domain=${r.brandDomain}&sz=32`} alt="" className="h-4 w-4 rounded" />
                        <span className="font-medium">{r.brandName} monitörü</span>
                        {r.brandDomain === project?.domain && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">aktif proje</span>}
                        <span className="hidden text-xs text-ink/40 sm:inline">{r.brandDomain}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${on ? "border-seo/30 bg-seo/10 text-seo" : "border-border bg-muted text-sub"}`} title={`Son çalışma ${ago(r.lastRunAt)}`}>
                        {on ? "Aktif" : "Duraklatıldı"}
                      </span>
                      {r.demoMode && <span className="ml-1.5 rounded-md bg-warn/10 px-1.5 py-0.5 text-[10px] font-medium text-warn">demo</span>}
                    </td>
                    <td className="py-3 pr-4 text-center tabular-nums">{r.prompts}</td>
                    <td className="hidden py-3 pr-4 text-center tabular-nums text-ink/60 md:table-cell">{r.engines}</td>
                    <td className="py-3 pr-4 text-center">
                      <ScoreRing value={r.visibility == null ? null : r.visibility * 100} />
                    </td>
                    <td className="py-3 pr-4">
                      <SentimentBar value={r.sentiment} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink/45">Durum: &quot;Aktif&quot; monitörler seçtiğin sıklıkta (günlük, haftalık…) kendiliğinden yeniden test edilir; &quot;Duraklatıldı&quot; olanlar sadece elle çalışır. Monitöre girip izlemeyi başlatabilirsin.</p>
    </div>
  );
}
