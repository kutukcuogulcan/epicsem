"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import ToolPageHeader from "@/components/ToolPageHeader";
import PageGuide from "@/components/PageGuide";
import { Drawer } from "@/components/ui";

interface Kw {
  id: number;
  domain: string;
  keyword: string;
  gl: string;
  lastPosition: number | null;
  lastUrl: string | null;
  lastCheckedAt: string | null;
  source?: string;
}
type Hist = Record<number, { position: number | null; at: string }[]>;

function posTone(p: number | null) {
  if (p === null) return "bg-muted text-ink/45";
  if (p <= 3) return "bg-seo/10 text-seo";
  if (p <= 10) return "bg-accent/10 text-accent";
  if (p <= 30) return "bg-warn/10 text-warn";
  return "bg-danger/10 text-danger";
}

export default function RankingsPage() {
  const [kws, setKws] = useState<Kw[] | null>(null);
  const [hist, setHist] = useState<Hist>({});
  const [serpAvailable, setSerpAvailable] = useState(true);
  const [serpbear, setSerpbear] = useState(false);
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [domain, setDomain] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function refresh() {
    const r = await fetch("/api/rankings");
    if (r.status === 401) return (window.location.href = "/login?next=/rankings");
    const d = await r.json();
    setKws(d.keywords ?? []);
    setHist(d.history ?? {});
    setSerpAvailable(!!d.serpAvailable);
    setSerpbear(!!d.serpbearAvailable);
  }

  async function serpbearAction(action: "import" | "refresh") {
    setBusy(`sb-${action}`);
    setMsg(null);
    try {
      const dom = domainFilter !== "all" ? domainFilter : undefined;
      if (action === "refresh" && !dom) throw new Error("Yenilemek için önce üstten bir site seç.");
      const r = await fetch("/api/rankings/serpbear", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, domain: dom }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "SerpBear hatası");
      setMsg({ ok: true, text: action === "import" ? `SerpBear'dan ${d.keywords} kelime ve ${d.points} günlük kayıt aktarıldı.` : `SerpBear ${d.refreshing} kelimeyi yeniden tarıyor; birkaç dakika sonra 'SerpBear'dan aktar'a bas.` });
      await refresh();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "SerpBear hatası" });
    } finally {
      setBusy(null);
    }
  }
  useEffect(() => {
    refresh();
    fetch("/api/assistant")
      .then((r) => (r.ok ? r.json() : { sites: [] }))
      .then((d) => setDomain((c) => c || d.sites?.[0] || ""))
      .catch(() => {});
  }, []);

  const domains = useMemo(() => Array.from(new Set((kws ?? []).map((k) => k.domain))), [kws]);
  const list = (kws ?? []).filter((k) => domainFilter === "all" || k.domain === domainFilter);

  const prevOf = (id: number) => {
    const h = hist[id] ?? [];
    return h.length >= 2 ? h[h.length - 2].position : null;
  };
  const checked = list.filter((k) => k.lastCheckedAt);
  const ranked = checked.filter((k) => k.lastPosition !== null);
  const top3 = ranked.filter((k) => (k.lastPosition ?? 99) <= 3).length;
  const top10 = ranked.filter((k) => (k.lastPosition ?? 99) <= 10).length;
  const avg = ranked.length ? Math.round((ranked.reduce((a, k) => a + (k.lastPosition ?? 0), 0) / ranked.length) * 10) / 10 : null;
  const moves = list.map((k) => {
    const p = prevOf(k.id);
    return p !== null && k.lastPosition !== null ? p - k.lastPosition : 0;
  });
  const up = moves.filter((m) => m > 0).length;
  const down = moves.filter((m) => m < 0).length;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const keywords = text.split(/\n|,/).map((x) => x.trim()).filter(Boolean);
    if (!domain.trim() || !keywords.length) return setMsg({ ok: false, text: "Alan adı ve en az bir kelime gir." });
    setBusy("add");
    try {
      const r = await fetch("/api/rankings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain, keywords }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Eklenemedi");
      setMsg({ ok: true, text: `${d.added} kelime eklendi.${serpAvailable ? " İlk kontrol için 'Şimdi kontrol et'e bas ya da günlük taramayı bekle." : ""}` });
      setText("");
      setOpen(false);
      await refresh();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Eklenemedi" });
    } finally {
      setBusy(null);
    }
  }

  async function checkNow() {
    setBusy("check");
    setMsg(null);
    try {
      const r = await fetch("/api/rankings/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: list.map((k) => k.id).slice(0, 50) }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Kontrol başarısız");
      setMsg({ ok: true, text: `${d.checked} kelimenin sırası güncellendi.${d.errors?.length ? ` Hata: ${d.errors.join("; ")}` : ""}` });
      await refresh();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Kontrol başarısız" });
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: number) {
    await fetch("/api/rankings", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    await refresh();
  }

  return (
    <div className="space-y-6">
      <ToolPageHeader
        breadcrumbLabel="Sıralama Takibi"
        title="Sıralama Takibi"
        body="Takip ettiğin kelimelerde sitenin Google'daki sırasını her gün kontrol eder; yükselen ve düşen kelimeleri gösterir. AI Overview çıkan aramaları da işaretler."
      >
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setOpen(true)} className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white hover:opacity-90">+ Kelime ekle</button>
          <button type="button" onClick={checkNow} disabled={!serpAvailable || !list.length || busy === "check"} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-40">
            {busy === "check" ? "Kontrol ediliyor…" : "Şimdi kontrol et"}
          </button>
          {serpbear && (
            <>
              <button type="button" onClick={() => serpbearAction("import")} disabled={!!busy} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-40">
                {busy === "sb-import" ? "Aktarılıyor…" : "SerpBear'dan aktar"}
              </button>
              <button type="button" onClick={() => serpbearAction("refresh")} disabled={!!busy} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-40">
                {busy === "sb-refresh" ? "İsteniyor…" : "SerpBear'da yenile"}
              </button>
            </>
          )}
        </div>
      </ToolPageHeader>

      {!serpAvailable && !serpbear && (
        <div className="rounded-2xl border border-warn/30 bg-warn/5 p-4 text-sm leading-6 text-ink/70">
          <strong>Sıralama verisi için bir kaynak bağla.</strong> İki seçenek var: ücretsiz planı olan <strong>SerpApi</strong> (her kelime kontrolü 1 arama) ya da kendi sunucundaki açık kaynak <strong>SerpBear</strong>. <Link href="/integrations" className="font-semibold text-accent">Entegrasyonlar</Link>&apos;dan bağlayınca kontroller günlük otomatik çalışır. Kelimeleri şimdiden ekleyebilirsin.
        </div>
      )}
      {msg && <div className={`rounded-xl px-4 py-2.5 text-sm ${msg.ok ? "bg-seo/5 text-seo" : "bg-danger/5 text-danger"}`}>{msg.text}</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Takip edilen", String(list.length)],
          ["İlk 3", String(top3)],
          ["İlk 10", String(top10)],
          ["Ort. sıra", avg !== null ? String(avg) : "—"],
          ["Yükselen / düşen", `${up} / ${down}`],
        ].map(([l, v]) => (
          <div key={l} className="rounded-xl border border-border bg-panel shadow-sm p-4">
            <div className="text-[11px] text-ink/50">{l}</div>
            <div className="text-2xl font-semibold tabular-nums">{v}</div>
          </div>
        ))}
      </div>

      {domains.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {["all", ...domains].map((d) => (
            <button key={d} type="button" onClick={() => setDomainFilter(d)} className={`rounded-full px-3 py-1 text-xs font-semibold ${domainFilter === d ? "bg-ink text-white" : "bg-muted text-ink/60"}`}>
              {d === "all" ? "Tüm siteler" : d}
            </button>
          ))}
        </div>
      )}

      {kws && list.length === 0 ? (
        <div className="rounded-xl border border-border bg-panel shadow-sm p-8 text-center">
          <div className="font-bold">Henüz takip edilen kelime yok</div>
          <p className="mt-1 text-sm text-ink/55">
            Kelimeleri buradan ekle ya da <Link href="/keywords" className="font-semibold text-accent">Anahtar Kelime Bulucu</Link>&apos;dan seçip &quot;Sıralama takibine ekle&quot;.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-panel shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-xs font-semibold uppercase text-slate-500">
                <th className="px-5 py-2 font-semibold">Kelime</th>
                <th className="py-2 pr-3 font-semibold">Sıra</th>
                <th className="py-2 pr-3 font-semibold">Değişim</th>
                <th className="hidden py-2 pr-3 font-semibold md:table-cell">Son 60 gün</th>
                <th className="hidden py-2 pr-3 font-semibold lg:table-cell">Sıralanan sayfa</th>
                <th className="py-2 pr-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((k) => {
                const prev = prevOf(k.id);
                const delta = prev !== null && k.lastPosition !== null ? prev - k.lastPosition : null;
                const h = (hist[k.id] ?? []).map((x) => ({ p: x.position ?? 101 }));
                return (
                  <tr key={k.id}>
                    <td className="px-5 py-2.5">
                      <div className="font-medium">{k.keyword}</div>
                      <div className="text-[10px] text-ink/45">{k.domain} · {k.gl.toUpperCase()}{k.source === "serpbear" ? " · SerpBear" : ""}{k.lastCheckedAt ? ` · ${new Date(k.lastCheckedAt).toLocaleDateString("tr-TR")}` : " · henüz kontrol edilmedi"}</div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${posTone(k.lastPosition)}`}>{k.lastCheckedAt ? (k.lastPosition ?? "100+") : "—"}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-xs font-bold tabular-nums">
                      {delta === null || delta === 0 ? <span className="text-ink/30">—</span> : delta > 0 ? <span className="text-seo">▲ {delta}</span> : <span className="text-danger">▼ {-delta}</span>}
                    </td>
                    <td className="hidden py-2.5 pr-3 md:table-cell">
                      {h.length >= 2 ? (
                        <div className="h-8 w-32">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={h}>
                              <YAxis reversed domain={[1, "dataMax"]} hide />
                              <Line type="monotone" dataKey="p" stroke="#5d16ff" strokeWidth={2} dot={false} isAnimationActive={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <span className="text-[11px] text-ink/30">yeterli veri yok</span>
                      )}
                    </td>
                    <td className="hidden max-w-[16rem] truncate py-2.5 pr-3 text-xs text-ink/55 lg:table-cell">
                      {k.lastUrl ? <a href={k.lastUrl} target="_blank" rel="noreferrer" className="hover:text-accent">{k.lastUrl.replace(/^https?:\/\/(www\.)?/, "")}</a> : "—"}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-4 text-right text-xs">
                      <Link href={`/keywords?q=${encodeURIComponent(k.keyword)}`} className="font-semibold text-ink/55 hover:text-accent">Benzerleri</Link>
                      <button type="button" onClick={() => remove(k.id)} className="ml-3 text-danger/60 hover:text-danger">Sil</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <Drawer isOpen onClose={() => setOpen(false)} panelClassName="flex h-full w-screen max-w-md flex-col border-l border-border bg-panel shadow-2xl animate-[pop-in_0.25s_ease-out]" raw as="form" onSubmit={add} header={<div className="min-w-0">
              <div className="font-bold">Takibe kelime ekle</div>
</div>}>
            <div className="flex-1 space-y-4 px-6 py-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wide text-ink/45">Site</label>
                <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="siten.com" className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm outline-none focus:border-accent" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wide text-ink/45">Kelimeler (her satıra bir tane)</label>
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} placeholder={"abiye elbise\nnişan elbisesi modelleri"} className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm outline-none focus:border-accent" />
              </div>
              <p className="text-[11px] text-ink/50">Her kelime günde bir kez, Türkiye Google sonuçlarında ilk 100 içinde kontrol edilir (1 SerpApi araması).</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2 text-sm font-semibold text-ink/60 hover:bg-muted">Vazgeç</button>
              <button disabled={busy === "add"} className="rounded-xl bg-accent px-5 py-2 text-sm font-bold text-white disabled:opacity-50">{busy === "add" ? "Ekleniyor…" : "Ekle"}</button>
            </div>
          </Drawer>
      )}

      <PageGuide id="rankings" />
    </div>
  );
}
