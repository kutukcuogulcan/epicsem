"use client";

/**
 * Prompt sonuçları — Arvow "LLM Brand Monitor" düzeni. GEO testi ve Marka Monitörleri aynı
 * bileşeni kullanır:
 *  - tablo: prompt · konu · görünürlük halkası · duygu çubuğu · motorlar
 *  - satıra tıklayınca sağ çekmece: görünürlük/duygu rozetleri, kullanıcı sorusu, cevaplarda
 *    geçen markalar, her motorun cevabı (puan halkası + duygu çubuğu, tıklayınca tam metin ve kaynaklar)
 *  - RunProgress: test çalışırken prompt × motor ilerleme görünümü
 */
import { useEffect, useMemo, useState } from "react";
import { Drawer } from "@/components/ui";
import { ENGINE_META, EngineDot, ScoreRing, SentimentBar, netSentiment, sentimentLabel } from "@/components/tool/MonitorBits";

export interface PromptResponse {
  engine: string;
  model?: string;
  mentioned: boolean;
  position: number | null;
  sentiment: number | null;
  text: string;
  mentions: string[];
  citations: { url: string; domain: string; isOwnDomain: boolean }[];
}
export interface PromptGroup {
  text: string;
  topic: string;
  branded: boolean;
  visibility: number; // 0-1
  sentiment: number | null; // 0-100
  mentions: string[];
  responses: PromptResponse[];
}

/** Ham GEO koşularını (prompt × motor) prompt bazında gruplar. */
export interface RawRun {
  engine: string;
  model?: string;
  promptText: string;
  topic?: string;
  branded?: boolean;
  mentioned: boolean;
  position: number | null;
  sentiment: number | null;
  responseText: string;
  citations: { url: string; domain: string; isOwnDomain: boolean }[];
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function groupRuns(runs: RawRun[], brandNames: string[]): PromptGroup[] {
  const names = [...new Set(brandNames.map((n) => n.trim()).filter(Boolean))];
  const mentionsIn = (t: string) => names.filter((n) => new RegExp(`(^|[^\\p{L}])${esc(n)}([^\\p{L}]|$)`, "iu").test(t));
  const by = new Map<string, RawRun[]>();
  for (const r of runs) by.set(r.promptText, [...(by.get(r.promptText) ?? []), r]);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  return [...by.entries()].map(([text, rs]) => {
    const responses = rs.map((r) => ({
      engine: r.engine,
      model: r.model,
      mentioned: r.mentioned,
      position: r.position,
      sentiment: r.sentiment,
      text: r.responseText,
      mentions: mentionsIn(r.responseText),
      citations: (r.citations ?? []).slice(0, 8),
    }));
    return {
      text,
      topic: rs[0].topic ?? "Genel",
      branded: !!rs[0].branded,
      visibility: rs.filter((r) => r.mentioned).length / rs.length,
      sentiment: avg(rs.map((r) => r.sentiment).filter((s): s is number => s != null)),
      mentions: [...new Set(responses.flatMap((r) => r.mentions))],
      responses,
    };
  });
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function PromptResults({ prompts, brandName, runAt, emptyText = "Bu filtrede prompt yok." }: { prompts: PromptGroup[]; brandName: string; runAt?: string | null; emptyText?: string }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | "branded" | "discovery">("all");
  const [engine, setEngine] = useState("all");
  const [open, setOpen] = useState<PromptGroup | null>(null);
  const [openResp, setOpenResp] = useState<number | null>(null);

  const engines = useMemo(() => [...new Set(prompts.flatMap((p) => p.responses.map((r) => r.engine)))], [prompts]);
  const shown = prompts
    .filter((p) => (type === "branded" ? p.branded : type === "discovery" ? !p.branded : true))
    .filter((p) => !q || p.text.toLocaleLowerCase("tr").includes(q.toLocaleLowerCase("tr")))
    .map((p) => (engine === "all" ? p : { ...p, responses: p.responses.filter((r) => r.engine === engine) }))
    .filter((p) => p.responses.length);
  const fmt = (iso: string) => new Date(iso).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Prompt ara…" className="h-8 w-64 rounded-[10px] border border-border bg-panel px-3 text-sm outline-none focus:border-accent" />
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="h-8 rounded-[10px] border border-border bg-panel px-2.5 text-sm outline-none">
          <option value="all">Tüm türler</option>
          <option value="discovery">Keşif (marka adı geçmeyen)</option>
          <option value="branded">Markalı</option>
        </select>
        {engines.length > 1 && (
          <select value={engine} onChange={(e) => setEngine(e.target.value)} className="h-8 rounded-[10px] border border-border bg-panel px-2.5 text-sm outline-none">
            <option value="all">Tüm motorlar</option>
            {engines.map((e) => (
              <option key={e} value={e}>
                {ENGINE_META[e]?.name ?? e}
              </option>
            ))}
          </select>
        )}
        <span className="ml-auto text-xs text-sub">{shown.length} prompt</span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-panel shadow-[0_1px_2px_rgba(13,18,28,0.05)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-[#fafafa] text-left text-xs font-medium text-sub">
              <th className="px-4 py-2.5 font-medium">Prompt</th>
              <th className="hidden py-2.5 pr-4 font-medium md:table-cell">Konu</th>
              <th className="py-2.5 pr-4 text-center font-medium">Görünürlük</th>
              <th className="py-2.5 pr-4 font-medium">Duygu</th>
              <th className="hidden py-2.5 pr-4 font-medium lg:table-cell">Motorlar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.map((p) => (
              <tr
                key={p.text}
                onClick={() => {
                  setOpen(p);
                  setOpenResp(null);
                }}
                className="cursor-pointer hover:bg-[#fafafa]"
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-ink">{p.text}</div>
                  {p.branded && <span className="mt-0.5 inline-block rounded-md bg-muted px-1.5 text-[10px] font-medium text-sub">markalı</span>}
                </td>
                <td className="hidden py-3 pr-4 text-xs text-sub md:table-cell">{p.topic}</td>
                <td className="py-3 pr-4 text-center">
                  <ScoreRing value={p.visibility * 100} />
                </td>
                <td className="py-3 pr-4">
                  <SentimentBar value={p.sentiment} />
                </td>
                <td className="hidden py-3 pr-4 lg:table-cell">
                  <div className="flex -space-x-1">
                    {p.responses.map((r, i) => (
                      <span key={i} className={r.mentioned ? "" : "opacity-30"} title={`${ENGINE_META[r.engine]?.name ?? r.engine}: ${r.mentioned ? "geçiyor" : "geçmiyor"}`}>
                        <EngineDot engine={r.engine} size={18} />
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sub">
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <Drawer isOpen onClose={() => setOpen(null)} size="2xl" title="Prompt detayı" subtitle={runAt ? `Son çalışma ${fmt(runAt)}` : undefined}>
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-border px-3 py-1 text-xs text-sub">
                Görünürlük <b className="font-medium text-ink">{pct(open.visibility)}</b>
              </span>
              <span className="rounded-full border border-border px-3 py-1 text-xs text-sub">
                Duygu <b className="font-medium text-ink">{sentimentLabel(open.sentiment)}</b>
                {open.sentiment != null && ` (${netSentiment(open.sentiment)! > 0 ? "+" : ""}${netSentiment(open.sentiment)})`}
              </span>
              <span className="rounded-full border border-border px-3 py-1 text-xs text-sub">{open.topic}</span>
            </div>
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Kullanıcı sorusu
              </div>
              <div className="rounded-[10px] bg-[#fafafa] px-3.5 py-2.5 text-sm">{open.text}</div>
            </div>
            {open.mentions.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-medium text-sub">Cevaplarda geçen markalar</div>
                <div className="flex flex-wrap gap-1.5">
                  {open.mentions.map((m) => (
                    <span key={m} className={`rounded-md px-2 py-0.5 text-xs font-medium ${m === brandName ? "bg-accent text-white" : "bg-accent/10 text-accent"}`}>
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-seo" /> Cevaplar <span className="font-normal text-sub">({open.responses.length})</span>
              </div>
              <ul className="divide-y divide-border rounded-2xl border border-border">
                {open.responses.map((r, i) => {
                  const exp = openResp === i;
                  return (
                    <li key={i} className="cursor-pointer px-3.5 py-3 hover:bg-[#fafafa]" onClick={() => setOpenResp(exp ? null : i)}>
                      <div className="flex items-start gap-3">
                        <EngineDot engine={r.engine} size={20} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-xs text-sub">
                            <span className="font-medium text-ink">{ENGINE_META[r.engine]?.name ?? r.engine}</span>
                            {r.model && <span className="hidden sm:inline">{r.model}</span>}
                            {r.mentioned ? (
                              <span className="rounded-md bg-seo/10 px-1.5 text-[10px] font-medium text-seo">{r.position ? `${r.position}. sırada` : "geçiyor"}</span>
                            ) : (
                              <span className="rounded-md bg-danger/10 px-1.5 text-[10px] font-medium text-danger">geçmiyor</span>
                            )}
                          </div>
                          <p className={`mt-1 whitespace-pre-wrap text-sm leading-6 ${exp ? "" : "line-clamp-2"}`}>{r.text}</p>
                          {r.mentions.length > 0 && <div className="mt-1 text-[11px] text-sub">Geçen markalar: {r.mentions.join(", ")}</div>}
                          {exp && r.citations.length > 0 && (
                            <div className="mt-2 space-y-0.5">
                              <div className="text-[11px] font-medium text-sub">Kaynaklar</div>
                              {r.citations.map((c) => (
                                <a key={c.url} href={c.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className={`block truncate text-xs hover:underline ${c.isOwnDomain ? "font-medium text-seo" : "text-accent"}`}>
                                  {c.url}
                                </a>
                              ))}
                            </div>
                          )}
                          {!exp && <div className="mt-1 text-[11px] text-accent">Tamamını göster</div>}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          <ScoreRing value={r.mentioned ? (r.sentiment ?? 50) : 0} size={30} />
                          <SentimentBar value={r.sentiment} width={48} />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </Drawer>
      )}
    </div>
  );
}

/**
 * Test çalışırken gösterilen ilerleme paneli. API tek seferde döndüğü için ilerleme tahmine
 * dayalıdır (prompt × motor başına ~3 sn); bitince gerçek sonuçlar gelir.
 */
export function RunProgress({ prompts, engines }: { prompts: string[]; engines: string[] }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setT((x) => x + 1), 1000);
    return () => clearInterval(i);
  }, []);
  const total = Math.max(1, prompts.length * engines.length);
  const done = Math.min(total - 1, Math.floor(t / 3));
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-panel shadow-[0_1px_2px_rgba(13,18,28,0.05)]">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <div className="text-sm font-medium">AI motorlarına soruluyor…</div>
          <div className="text-xs text-sub">
            {prompts.length} prompt × {engines.length} motor · {t} sn
          </div>
        </div>
        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-accent transition-all duration-1000" style={{ width: `${Math.round(((done + 1) / total) * 100)}%` }} />
        </div>
      </div>
      <ul className="divide-y divide-border">
        {prompts.slice(0, 12).map((p, pi) => (
          <li key={p} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span className="min-w-0 flex-1 truncate">{p}</span>
            <span className="flex gap-1">
              {engines.map((e, ei) => {
                const idx = pi * engines.length + ei;
                const state = idx < done ? "done" : idx === done ? "run" : "wait";
                return (
                  <span key={e} className={state === "wait" ? "opacity-25" : state === "run" ? "animate-pulse" : ""} title={ENGINE_META[e]?.name ?? e}>
                    <EngineDot engine={e} size={18} />
                  </span>
                );
              })}
            </span>
          </li>
        ))}
      </ul>
      {prompts.length > 12 && <div className="border-t border-border px-4 py-2 text-xs text-sub">+{prompts.length - 12} prompt daha</div>}
    </div>
  );
}
