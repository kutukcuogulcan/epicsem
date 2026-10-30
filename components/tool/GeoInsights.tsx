"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { GeoRunResult } from "@/types";
import { buildBattlecards, findOpportunities, opportunityTopics, OPPORTUNITY_LABEL, type BrandRef, type OpportunityKind } from "@/lib/geo-insights";

const pct = (x: number) => `%${Math.round(x * 100)}`;
const ENGINE_SHORT: Record<string, string> = { openai: "ChatGPT", anthropic: "Claude", google: "Gemini", perplexity: "Perplexity", deepseek: "DeepSeek", xai: "Grok" };

/* ============================== Rakip kartları ============================== */

export function BattlecardsTab({ runs, own, competitors }: { runs: GeoRunResult[]; own: BrandRef; competitors: BrandRef[] }) {
  const cards = useMemo(() => buildBattlecards(runs, own, competitors), [runs, own, competitors]);
  const [open, setOpen] = useState<string | null>(null);
  if (!competitors.length)
    return <p className="rounded-xl border border-border bg-panel shadow-sm p-6 text-sm text-ink/55">Rakip kartları için testte en az bir rakip olmalı. Ayarlar&apos;dan rakip ekleyip testi tekrar çalıştır.</p>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink/50">Her kart, bu testteki cevaplardan AI kullanmadan hesaplanır: rakip nerede tek başına öneriliyor, nerede sen öndesin, onu hangi kaynaklar alıntılıyor ve ne yapmalısın.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {cards.map((c) => {
          const tone = c.verdict === "önde" ? "bg-seo/10 text-seo" : c.verdict === "geride" ? "bg-danger/10 text-danger" : "bg-warn/10 text-warn";
          const isOpen = open === c.competitor.domain;
          return (
            <article key={c.competitor.domain} className="flex flex-col rounded-xl border border-border bg-panel shadow-sm p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">{own.name} vs</div>
                  <div className="truncate text-lg font-semibold">{c.competitor.name}</div>
                  <div className="truncate text-xs text-ink/45">{c.competitor.domain}</div>
                </div>
                <span className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold ${tone}`}>Sen {c.verdict}</span>
              </div>

              <div className="mt-4 space-y-2">
                {[
                  { label: own.name, v: c.ourRate, color: "bg-accent" },
                  { label: c.competitor.name, v: c.theirRate, color: "bg-ink/40" },
                ].map((b) => (
                  <div key={b.label}>
                    <div className="mb-0.5 flex justify-between text-[11px] text-ink/55">
                      <span className="truncate">{b.label}</span>
                      <span className="font-bold tabular-nums">{pct(b.v)} görünürlük</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className={`h-full rounded-full ${b.color}`} style={{ width: `${Math.max(2, b.v * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-danger/5 px-2 py-2">
                  <div className="text-lg font-semibold tabular-nums text-danger">{c.theyWin.length}</div>
                  <div className="text-[10px] text-ink/50">soruda sadece o</div>
                </div>
                <div className="rounded-xl bg-seo/5 px-2 py-2">
                  <div className="text-lg font-semibold tabular-nums text-seo">{c.weWin.length}</div>
                  <div className="text-[10px] text-ink/50">soruda sadece sen</div>
                </div>
                <div className="rounded-xl bg-muted/60 px-2 py-2">
                  <div className="text-lg font-semibold tabular-nums">
                    {c.bothAhead}/{c.bothAhead + c.bothBehind}
                  </div>
                  <div className="text-[10px] text-ink/50">ikiniz varken önce sen</div>
                </div>
              </div>

              {c.topicsTheyLead.length > 0 && (
                <div className="mt-4">
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink/40">Önde olduğu konular</div>
                  <div className="flex flex-wrap gap-1.5">
                    {c.topicsTheyLead.map((t) => (
                      <span key={t.topic} className="rounded-md bg-muted px-2 py-0.5 text-[11px]">
                        {t.topic} <span className="text-ink/45">{pct(t.them)} / {pct(t.us)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {c.theirSources.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink/40">Onu alıntılayan kaynaklar</div>
                  <div className="flex flex-wrap gap-1.5">
                    {c.theirSources.map((s) => (
                      <span key={s.domain} className="rounded-md border border-border px-2 py-0.5 text-[11px]">
                        {s.domain} <span className="text-ink/40">×{s.count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 rounded-xl border border-accent/20 bg-accent/5 p-3">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-accent">Ne yapmalı</div>
                <ul className="space-y-1 text-xs leading-5 text-ink/75">
                  {c.actions.map((a, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-accent">→</span>
                      {a}
                    </li>
                  ))}
                </ul>
              </div>

              {c.theyWin.length > 0 && (
                <div className="mt-3">
                  <button type="button" onClick={() => setOpen(isOpen ? null : c.competitor.domain)} className="text-xs font-semibold text-accent hover:underline">
                    {isOpen ? "Gizle" : `Kaybettiğin ${c.theyWin.length} soruyu göster`}
                  </button>
                  {isOpen && (
                    <ul className="mt-2 space-y-1.5">
                      {c.theyWin.map((w) => (
                        <li key={w.prompt} className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2 text-xs">
                          <span>
                            {w.prompt}
                            <span className="block text-[10px] text-ink/45">{w.topic} · {w.engines.map((e) => ENGINE_SHORT[e] ?? e).join(", ")}</span>
                          </span>
                          <Link href={`/editor?new=${encodeURIComponent(w.prompt)}`} className="shrink-0 font-semibold text-accent hover:underline">Yazı yaz →</Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

/* ============================== Fırsatlar ============================== */

const KIND_TONE: Record<OpportunityKind, string> = {
  "competitor-owned": "bg-danger/10 text-danger",
  unclaimed: "bg-sky-500/10 text-sky-600",
  weak: "bg-warn/10 text-warn",
  strong: "bg-seo/10 text-seo",
};

export function OpportunitiesTab({ runs, own, competitors }: { runs: GeoRunResult[]; own: BrandRef; competitors: BrandRef[] }) {
  const ops = useMemo(() => findOpportunities(runs, own, competitors), [runs, own, competitors]);
  const topics = useMemo(() => opportunityTopics(ops), [ops]);
  const [filter, setFilter] = useState<OpportunityKind | "open">("open");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; feedId?: number } | null>(null);

  const counts = (k: OpportunityKind) => ops.filter((o) => o.kind === k).length;
  const shown = ops.filter((o) => (filter === "open" ? o.kind !== "strong" : o.kind === filter));

  async function addToAutoblog(prompts: string[]) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/feeds/append", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: prompts, siteUrl: own.domain }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Eklenemedi");
      setMsg({ ok: true, text: `${d.added} soru "${d.feedName}" beslemesine eklendi.`, feedId: d.feedId });
      setSel(new Set());
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Eklenemedi" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(["competitor-owned", "unclaimed", "weak", "strong"] as OpportunityKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={`rounded-2xl border p-4 text-left transition ${filter === k ? "border-accent ring-1 ring-accent" : "border-border bg-panel hover:border-accent/40"}`}
          >
            <div className="text-[11px] text-ink/50">{OPPORTUNITY_LABEL[k]}</div>
            <div className="text-2xl font-semibold tabular-nums">{counts(k)}</div>
            <div className="text-[10px] text-ink/45">
              {k === "competitor-owned" ? "rakip var, sen yoksun" : k === "unclaimed" ? "kimse önerilmiyor" : k === "weak" ? "bazı motorlarda yoksun" : "çoğu motorda varsın"}
            </div>
          </button>
        ))}
      </div>

      {topics.length > 1 && (
        <div className="rounded-xl border border-border bg-panel shadow-sm p-4">
          <div className="mb-2 text-sm font-bold">Konu haritası — nerede hiç yoksun?</div>
          <div className="space-y-1.5">
            {topics.map((t) => (
              <div key={t.topic} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-xs">
                <span className="truncate font-medium">{t.topic}</span>
                <div className="h-2 overflow-hidden rounded-full bg-seo/20">
                  <div className="h-full rounded-full bg-danger/70" style={{ width: `${(t.missing / t.total) * 100}%` }} />
                </div>
                <span className="tabular-nums text-ink/55">{t.missing}/{t.total} soruda yoksun{t.competitorOwned ? ` · ${t.competitorOwned} rakipte` : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5 text-xs">
          <button type="button" onClick={() => setFilter("open")} className={`rounded-full px-3 py-1 font-semibold ${filter === "open" ? "bg-ink text-white" : "bg-muted text-ink/60"}`}>
            Tüm fırsatlar
          </button>
          {(["competitor-owned", "unclaimed", "weak"] as OpportunityKind[]).map((k) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={`rounded-full px-3 py-1 font-semibold ${filter === k ? "bg-ink text-white" : "bg-muted text-ink/60"}`}>
              {OPPORTUNITY_LABEL[k]}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={!sel.size || busy}
          onClick={() => addToAutoblog([...sel])}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Ekleniyor…" : `Seçilenleri Autoblog'a ekle (${sel.size})`}
        </button>
      </div>
      {msg && (
        <div className={`rounded-xl px-4 py-2.5 text-xs ${msg.ok ? "bg-seo/5 text-seo" : "bg-danger/5 text-danger"}`}>
          {msg.text}{" "}
          {msg.ok && (
            <>
              <Link href="/feeds" className="font-semibold underline">Beslemeyi gör</Link> ·{" "}
              <Link href={`/campaigns?feed=${msg.feedId}`} className="font-semibold underline">Bu beslemeyle autoblog kur</Link>
            </>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-panel shadow-sm">
        {shown.length === 0 ? (
          <p className="p-6 text-sm text-ink/50">Bu grupta soru yok.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-xs font-semibold uppercase text-slate-500">
                <th className="w-8 px-4 py-2" />
                <th className="py-2 pr-3 font-semibold">Soru</th>
                <th className="hidden py-2 pr-3 font-semibold md:table-cell">Durum</th>
                <th className="hidden py-2 pr-3 font-semibold lg:table-cell">Önde olan</th>
                <th className="hidden py-2 pr-3 font-semibold lg:table-cell">En çok alıntılanan</th>
                <th className="py-2 pr-4 text-right font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((o) => (
                <tr key={o.prompt} className="align-top">
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={sel.has(o.prompt)}
                      onChange={() =>
                        setSel((s) => {
                          const n = new Set(s);
                          if (n.has(o.prompt)) n.delete(o.prompt);
                          else n.add(o.prompt);
                          return n;
                        })
                      }
                      className="accent-[#5d16ff]"
                    />
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="font-medium">{o.prompt}</div>
                    <div className="text-[10px] text-ink/45">{o.topic} · {o.engines} motor · sen {pct(o.ourRate)}</div>
                  </td>
                  <td className="hidden py-2.5 pr-3 md:table-cell">
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${KIND_TONE[o.kind]}`}>{OPPORTUNITY_LABEL[o.kind]}</span>
                  </td>
                  <td className="hidden py-2.5 pr-3 text-xs text-ink/65 lg:table-cell">{o.leader ? `${o.leader.name} (${pct(o.leader.rate)})` : "—"}</td>
                  <td className="hidden py-2.5 pr-3 text-xs text-ink/65 lg:table-cell">{o.topSource ?? "—"}</td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-right text-xs">
                    <Link href={`/editor?new=${encodeURIComponent(o.prompt)}`} className="font-semibold text-accent hover:underline">Yazı yaz</Link>
                    <span className="mx-1.5 text-ink/20">·</span>
                    <button type="button" onClick={() => addToAutoblog([o.prompt])} disabled={busy} className="font-semibold text-ink/60 hover:text-accent disabled:opacity-40">Autoblog&apos;a ekle</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-[11px] text-ink/45">Fırsatlar bu testteki sorulara göre hesaplanır; yeni alanlar keşfetmek için persona sorularıyla testi genişlet. Sonuçlar ölçümdür, garanti değildir.</p>
    </div>
  );
}
