"use client";

/**
 * Backlinkler → "Sektör kaynakları": sektörde AI'ın Türkiye'de kaynak gösterdiği siteler
 * (lib/sector-sources.ts) ve markanla rakiplerinin bu sitelerde geçip geçmediği (Google araması).
 * Off-page haritası: neredesin, rakip nerede, nereden başlamalısın.
 */
import { useEffect, useMemo, useState } from "react";
import { KIND_META, SECTORS, SECTOR_BY_ID, type SourceKind, type SectorSource } from "@/lib/sector-sources";
import type { SectorPresence } from "@/app/api/backlinks/sector/route";
import { BTN1, BTN2, CARD } from "@/components/ui";

const KIND_CLS: Record<SourceKind, string> = {
  video: "bg-danger/10 text-danger-ink",
  community: "bg-[#ff4500]/10 text-[#d93a00]",
  complaint: "bg-emerald-50 text-emerald-700",
  listicle: "bg-warn/10 text-warn-ink",
  comparison: "bg-accent/10 text-accent",
  marketplace: "bg-sky-50 text-sky-700",
  "review-blog": "bg-violet-50 text-violet-700",
  editorial: "bg-muted text-ink/70",
  institutional: "bg-muted text-ink/70",
  directory: "bg-muted text-ink/70",
};
const ENGINE_LABEL = { google: "Google AI", chatgpt: "ChatGPT", all: "Tüm motorlar" } as const;
/** "Önce bunu yap" sıralaması: karşılaştırma ve liste siteleri en hızlı sonuç verir. */
const KIND_PRIORITY: Record<SourceKind, number> = { comparison: 6, listicle: 6, "review-blog": 5, complaint: 4, community: 4, video: 3, editorial: 3, marketplace: 2, directory: 2, institutional: 1 };

interface Brand {
  name: string;
  domain: string;
  own: boolean;
}

export default function SectorSourcesTab({ onPitch }: { onPitch: (domain: string, competitors: string[]) => void }) {
  const [sector, setSector] = useState<string | null>(null);
  const [guessed, setGuessed] = useState(false);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [result, setResult] = useState<SectorPresence | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [searchOk, setSearchOk] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [kind, setKind] = useState<"all" | SourceKind>("all");
  const [onlyGaps, setOnlyGaps] = useState(false);

  useEffect(() => {
    fetch("/api/backlinks/sector")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setSector(d.sector);
        setGuessed(!!d.guessed);
        setBrands(d.brands ?? []);
        setResult(d.result);
        setCachedAt(d.cachedAt);
        setSearchOk(d.searchAvailable !== false);
      })
      .finally(() => setLoaded(true));
  }, []);

  async function choose(id: string) {
    setSector(id);
    setGuessed(false);
    setResult(null);
    setCachedAt(null);
    setErr(null);
    await fetch("/api/backlinks/sector", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sector: id }) }).catch(() => {});
    // Bu sektör için önbellekte tarama varsa getir.
    const d = await fetch("/api/backlinks/sector").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (d?.result) {
      setResult(d.result);
      setCachedAt(d.cachedAt);
    }
  }

  async function scan() {
    if (!sector) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/backlinks/sector", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sector, scan: true }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Tarama başarısız");
      setResult(d.result);
      setCachedAt(d.cachedAt);
      window.dispatchEvent(new Event("epicsem:usage-changed"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Tarama başarısız");
    } finally {
      setBusy(false);
    }
  }

  const sec = sector ? SECTOR_BY_ID[sector] : null;
  const own = brands.find((b) => b.own);
  const rivals = brands.filter((b) => !b.own);

  const rows = useMemo(() => {
    if (!sec) return [];
    return sec.sources.map((s) => {
      const p = result?.presence?.[s.host] ?? {};
      const ownPages = own ? p[own.name] ?? [] : [];
      const rivalHits = rivals.filter((r) => (p[r.name] ?? []).length > 0).map((r) => ({ name: r.name, url: p[r.name][0] }));
      const gap = Boolean(result) && ownPages.length === 0 && rivalHits.length > 0;
      return { s, ownPages, rivalHits, gap };
    });
  }, [sec, result, own, rivals]);

  const scanned = Boolean(result);
  const ownIn = rows.filter((r) => r.ownPages.length).length;
  const rivalIn = rows.filter((r) => r.rivalHits.length).length;
  const gaps = rows.filter((r) => r.gap);
  const top = [...gaps].sort((a, b) => KIND_PRIORITY[b.s.kind] + b.rivalHits.length - (KIND_PRIORITY[a.s.kind] + a.rivalHits.length))[0] ?? null;
  const kinds = [...new Set((sec?.sources ?? []).map((s) => s.kind))];
  const shown = rows.filter((r) => (kind === "all" || r.s.kind === kind) && (!onlyGaps || r.gap));

  if (!loaded) return <div className={`${CARD} px-6 py-10 text-center text-sm text-sub`}>Yükleniyor…</div>;

  return (
    <div className="space-y-4">
      {/* Sektör seçimi + özet */}
      <div className={`${CARD} p-4 md:p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">AI&apos;ın sektöründe kaynak gösterdiği siteler</h2>
            <p className="text-xs text-sub">Türkiye&apos;de ChatGPT ve Google&apos;ın AI cevaplarında en çok kullanılan siteler. Markanın ve rakiplerinin bu sitelerde geçip geçmediğini tarar.</p>
          </div>
          <label className="flex items-center gap-2 text-xs text-sub">
            Sektör
            <select value={sector ?? ""} onChange={(e) => e.target.value && choose(e.target.value)} className="h-8 rounded-[9px] border border-border bg-panel px-2 text-[13px] text-ink outline-none focus:border-[#BDB4FF]">
              <option value="">Seç…</option>
              {SECTORS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {guessed && sec && <p className="mt-2 text-xs text-sub">Sektörü proje açıklamasından tahmin ettik; yanlışsa değiştir.</p>}

        {sec ? (
          <>
            <p className="mt-3 rounded-xl bg-muted/60 px-3 py-2.5 text-[13px] leading-6 text-ink/80">{sec.insight}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
              {([
                ["Sektör kaynağı", String(sec.sources.length), "AI'ın bu sektörde sık gösterdiği site"],
                ["Sen görünüyorsun", scanned ? String(ownIn) : "—", scanned ? `${own?.name ?? "Markan"} bu sitelerde bulundu` : "Tarama yapılmadı"],
                ["Rakipler görünüyor", scanned ? String(rivalIn) : "—", rivals.length ? rivals.map((r) => r.name).join(", ") : "Proje ayarlarına rakip ekle"],
                ["Fırsat", scanned ? String(gaps.length) : "—", "rakip var, sen yoksun"],
              ] as const).map(([l, v, h]) => (
                <div key={l} className="min-w-0 rounded-xl border border-border px-3 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-sub">{l}</div>
                  <div className={`mt-1 text-[24px] font-semibold tabular-nums ${l === "Fırsat" && gaps.length ? "text-danger-ink" : ""}`}>{v}</div>
                  <div className="truncate text-xs text-sub" title={h}>
                    {h}
                  </div>
                </div>
              ))}
            </div>

            {scanned && top && (
              <div className="mt-3 rounded-xl bg-accent/[0.06] p-3.5">
                <div className="text-xs font-semibold uppercase tracking-wide text-accent">Önce bunu yap</div>
                <div className="mt-1 text-[13px] font-semibold">
                  {top.s.label}: {top.rivalHits.map((r) => r.name).join(", ")} burada geçiyor, sen geçmiyorsun
                </div>
                <p className="mt-1 text-xs text-sub">{KIND_META[top.s.kind].action}</p>
                <div className="mt-2 flex gap-2">
                  {KIND_META[top.s.kind].outreach ? (
                    <button type="button" onClick={() => onPitch(top.s.host, top.rivalHits.map((r) => r.name))} className="inline-flex h-7 items-center rounded-lg bg-accent px-2.5 text-[12px] font-medium text-white hover:opacity-90" title="1 AI sorgusu">
                      E-posta taslağı
                    </button>
                  ) : null}
                  {top.rivalHits[0] && (
                    <a href={top.rivalHits[0].url} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center rounded-lg px-2.5 text-[12px] font-medium shadow-[inset_0_0_0_1px_#D5D7DA] hover:bg-muted">
                      Rakibin sayfasını gör ↗
                    </a>
                  )}
                </div>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={scan} disabled={busy || !searchOk} className={BTN1} title={`${brands.length} AI sorgusu`}>
                {busy ? "Taranıyor (~1-2 dk)…" : scanned ? "Yeniden tara" : "Siteleri tara"}
              </button>
              <span className="text-xs text-sub">
                {cachedAt ? `${new Date(cachedAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} tarihli tarama · ` : ""}
                {brands.length} marka × Google araması · {brands.length} AI sorgusu
              </span>
            </div>
            {!searchOk && <p className="mt-2 text-xs text-danger-ink">Tarama için Gemini (Google AI) anahtarı gerekiyor.</p>}
            {err && <p className="mt-2 text-xs text-danger-ink">{err}</p>}
            <p className="mt-3 text-xs text-sub">
              {sec.basis} &quot;Bulunamadı&quot;, Google aramasında sayfa çıkmadı demektir; sitede hiç geçmediğinin kesin kanıtı değildir.
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm text-sub">Sektörünü seç; o sektörde AI&apos;ın güvendiği siteleri ve nerede eksik olduğunu gösterelim.</p>
        )}
      </div>

      {/* Kaynak tablosu */}
      {sec && (
        <div className={`${CARD} overflow-hidden`}>
          <div className="flex flex-wrap items-center gap-2 px-5 py-3">
            {(["all", ...kinds] as ("all" | SourceKind)[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`inline-flex h-7 items-center rounded-lg px-2.5 text-xs font-medium ${kind === k ? "bg-accent/5 text-ink shadow-[inset_0_0_0_1px_#BDB4FF]" : "text-sub shadow-[inset_0_0_0_1px_#E4E5E8] hover:text-ink"}`}
              >
                {k === "all" ? "Tümü" : KIND_META[k].label}
              </button>
            ))}
            {scanned && (
              <label className="ml-auto flex items-center gap-1.5 text-xs text-sub">
                <input type="checkbox" checked={onlyGaps} onChange={(e) => setOnlyGaps(e.target.checked)} />
                Sadece fırsatlar
              </label>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead className="border-y border-border bg-[#fafafa] text-left text-xs text-sub">
                <tr>
                  <th className="py-2 pl-5 font-medium">Site</th>
                  <th className="py-2 pr-3 font-medium">Neden önemli</th>
                  <th className="py-2 pr-3 font-medium">{own?.name ?? "Sen"}</th>
                  <th className="py-2 pr-3 font-medium">Rakipler</th>
                  <th className="py-2 pr-5 text-right font-medium">Aksiyon</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map(({ s, ownPages, rivalHits, gap }) => (
                  <Row key={s.host} s={s} ownPages={ownPages} rivalHits={rivalHits} gap={gap} scanned={scanned} onPitch={onPitch} />
                ))}
              </tbody>
            </table>
          </div>
          {shown.length === 0 && <p className="px-5 py-4 text-[13px] text-sub">Bu filtrede site yok.</p>}
        </div>
      )}
    </div>
  );
}

function Row({
  s,
  ownPages,
  rivalHits,
  gap,
  scanned,
  onPitch,
}: {
  s: SectorSource;
  ownPages: string[];
  rivalHits: { name: string; url: string }[];
  gap: boolean;
  scanned: boolean;
  onPitch: (domain: string, competitors: string[]) => void;
}) {
  const [tip, setTip] = useState(false);
  const meta = KIND_META[s.kind];
  return (
    <tr className={`align-top ${gap ? "bg-danger/[0.02]" : ""}`}>
      <td className="py-2.5 pl-5 pr-3">
        <div className="flex items-center gap-2 font-medium">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://www.google.com/s2/favicons?domain=${s.host}&sz=32`} alt="" className="h-4 w-4 rounded" />
          {s.label}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1 pl-6">
          <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${KIND_CLS[s.kind]}`}>{meta.label}</span>
          <span className="text-xs text-sub">{s.host}</span>
        </div>
      </td>
      <td className="max-w-[240px] py-2.5 pr-3">
        <div>{s.evidence}</div>
        {s.engines && <div className="text-xs text-sub">{ENGINE_LABEL[s.engines]}</div>}
      </td>
      <td className="py-2.5 pr-3">
        {!scanned ? (
          <span className="text-sub">—</span>
        ) : ownPages.length ? (
          <a href={ownPages[0]} target="_blank" rel="noreferrer" className="inline-flex rounded-md bg-seo/10 px-2 py-0.5 text-xs font-medium text-seo-ink hover:underline">
            ✓ Bulundu{ownPages.length > 1 ? ` (${ownPages.length})` : ""}
          </a>
        ) : (
          <span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-sub">Bulunamadı</span>
        )}
      </td>
      <td className="py-2.5 pr-3">
        {!scanned ? (
          <span className="text-sub">—</span>
        ) : rivalHits.length ? (
          <div className="flex flex-wrap gap-1">
            {rivalHits.map((r) => (
              <a key={r.name} href={r.url} target="_blank" rel="noreferrer" className="rounded-md bg-danger/10 px-1.5 py-0.5 text-xs font-medium text-danger-ink hover:underline">
                {r.name}
              </a>
            ))}
          </div>
        ) : (
          <span className="text-xs text-sub">Bulunamadı</span>
        )}
      </td>
      <td className="py-2.5 pr-5 text-right">
        <div className="flex flex-wrap justify-end gap-1.5">
          <button type="button" onClick={() => setTip((v) => !v)} className="inline-flex h-7 items-center rounded-lg px-2.5 text-xs font-medium shadow-[inset_0_0_0_1px_#D5D7DA] hover:bg-muted">
            Ne yapmalı
          </button>
          {meta.outreach ? (
            <button type="button" onClick={() => onPitch(s.host, rivalHits.map((r) => r.name))} className="inline-flex h-7 items-center rounded-lg bg-accent px-2.5 text-xs font-medium text-white hover:opacity-90" title="1 AI sorgusu">
              E-posta
            </button>
          ) : (
            <a href={`https://${s.host}`} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center rounded-lg px-2.5 text-xs font-medium shadow-[inset_0_0_0_1px_#D5D7DA] hover:bg-muted">
              Siteyi aç ↗
            </a>
          )}
        </div>
        {tip && <p className="mt-2 max-w-[280px] text-left text-xs text-ink/70">{meta.action}</p>}
      </td>
    </tr>
  );
}
