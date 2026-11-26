"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { PageOutline } from "@/lib/page-compare";
import { BTN1, BTN2, Card, CardHeader, ErrorBlock, INPUT, PageHeader, PageSkeleton } from "@/components/ui";

type Outline = Omit<PageOutline, "text">;
interface Result {
  rival: Outline;
  own: Outline | null;
  missing: string[];
  suggestions: string[];
}

const short = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "");

/** Rakip sayfası ↔ kendi sayfan: AI'ın kaynak gösterdiği rakip sayfasında olup seninkinde olmayanlar. */
function Compare() {
  const sp = useSearchParams();
  const rivalUrl = sp.get("rival") ?? "";
  const [ownUrl, setOwnUrl] = useState(sp.get("own") ?? "");
  const [res, setRes] = useState<Result | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (own?: string) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/geo/page-compare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rival: rivalUrl, own: own || undefined }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Karşılaştırılamadı");
      setRes(d);
      if (d.suggestions.length) setSuggestions(d.suggestions);
      if (d.own) setOwnUrl(d.own.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Karşılaştırılamadı");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (rivalUrl) run(ownUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rivalUrl]);

  if (!rivalUrl) return <ErrorBlock message="Rakip sayfası seçilmedi. GEO raporundaki rakip sayfalarından birinde 'Karşılaştır'a bas." />;

  const rows: [string, (o: Outline) => string | number][] = [
    ["Kelime", (o) => o.words],
    ["Başlık (H2/H3)", (o) => o.headings.filter((h) => h.level > 1).length],
    ["SSS (soru)", (o) => o.faqs],
    ["Tablo", (o) => o.tables],
    ["Liste", (o) => o.lists],
    ["Görsel", (o) => o.images],
    ["Şema", (o) => o.schemaTypes.filter((t) => !["ListItem", "ImageObject"].includes(t)).join(", ") || "—"],
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Rakip sayfası ile karşılaştır"
        description="AI'ın kaynak gösterdiği rakip sayfasının yapısı ve senin sayfanda karşılığı olmayan başlıklar. İki sayfanın HTML'i okunur, AI kullanılmaz."
        actions={<Link href="/geo/rapor" className={`${BTN2} print:hidden`}>Rapora dön</Link>}
      />

      <Card>
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); run(ownUrl); }}>
          <input className={INPUT} value={ownUrl} onChange={(e) => setOwnUrl(e.target.value)} placeholder="Senin sayfanın adresi (boş bırakırsan sitemap'ten önerilir)" aria-label="Senin sayfanın adresi" />
          <button className={`${BTN1} shrink-0`} disabled={busy}>{busy ? "Okunuyor…" : "Karşılaştır"}</button>
        </form>
        {suggestions.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-sub">Sitende bu rakip sayfasına en yakın sayfalar (adres ve başlık kelimelerine göre):</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {suggestions.map((u) => (
                <button key={u} type="button" disabled={busy} onClick={() => { setOwnUrl(u); run(u); }} className={`rounded-full border px-2.5 py-1 text-xs ${u === res?.own?.url ? "border-accent text-accent" : "border-border text-ink hover:bg-muted"}`}>
                  {short(u)}
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      {err && <ErrorBlock message={err} onRetry={() => run(ownUrl)} />}
      {!res && !err && <PageSkeleton cards={2} />}

      {res && (
        <>
          <Card>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-sub">
                <tr>
                  <th className="py-1.5 font-medium" />
                  <th className="font-medium"><a href={res.rival.url} target="_blank" rel="noopener noreferrer" className="hover:underline">Rakip: {res.rival.h1 || short(res.rival.url)}</a></th>
                  <th className="font-medium">{res.own ? <a href={res.own.url} target="_blank" rel="noopener noreferrer" className="hover:underline">Sen: {res.own.h1 || short(res.own.url)}</a> : "Sen: —"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, f]) => (
                  <tr key={label} className="border-t border-border">
                    <td className="py-2 text-sub">{label}</td>
                    <td className="tabular-nums">{f(res.rival)}</td>
                    <td className="tabular-nums">{res.own ? f(res.own) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {res.own && (
            <Card>
              <CardHeader
                title={res.missing.length ? `Rakipte olup sende karşılığı olmayan başlıklar (${res.missing.length})` : "Rakibin bütün başlıklarının sende karşılığı var"}
                subtitle="Rakip başlığının kelimeleri senin sayfanda geçmiyorsa listelenir. Aynı bilgiyi farklı kelimelerle veriyorsan sayfan bunu zaten karşılıyor olabilir; ürününde gerçekten olanı ekle."
              />
              {res.missing.length > 0 && (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink">
                  {res.missing.map((h) => <li key={h}>{h}</li>)}
                </ul>
              )}
            </Card>
          )}

          <div className="grid gap-5 md:grid-cols-2">
            {[res.rival, res.own].map((o, i) =>
              o ? (
                <Card key={i}>
                  <CardHeader title={i ? "Senin sayfanın başlıkları" : "Rakibin başlıkları"} subtitle={short(o.url)} />
                  <ul className="mt-3 space-y-1 text-sm">
                    {o.headings.map((h, j) => (
                      <li key={j} className={h.level === 1 ? "font-semibold text-ink" : h.level === 2 ? "text-ink" : "pl-4 text-sub"}>{h.text}</li>
                    ))}
                    {!o.headings.length && <li className="text-sub">Sayfada H1–H3 başlığı yok.</li>}
                  </ul>
                </Card>
              ) : null
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Compare />
    </Suspense>
  );
}
