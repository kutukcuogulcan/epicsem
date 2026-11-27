"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { RankExplanation, SerpSnap } from "@/lib/rank-explain";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { Drawer, TableSkeleton, PageHeader, BTN1, BTN2, CARD } from "@/components/ui";
import { useProject } from "@/components/ProjectProvider";

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
interface WhyData {
  explanation: RankExplanation | null;
  top: SerpSnap["top"];
  paa: string[];
  aiOverview: boolean;
  checkedAt?: string;
  prevAt?: string | null;
}

function posTone(p: number | null) {
  if (p === null) return "bg-muted text-ink/60";
  if (p <= 3) return "bg-seo/10 text-seo-ink";
  if (p <= 10) return "bg-accent/10 text-accent";
  if (p <= 30) return "bg-warn/10 text-warn-ink";
  return "bg-danger/10 text-danger-ink";
}

export default function RankingsPage() {
  const { project } = useProject();
  useEffect(() => {
    if (project) setDomain(project.domain);
  }, [project?.domain]);

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
  const [why, setWhy] = useState<WhyData | null | "loading">(null);

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
  }, []);

  const domains = useMemo(() => Array.from(new Set((kws ?? []).map((k) => k.domain))), [kws]);
  useEffect(() => {
    if (project && domains.includes(project.domain)) setDomainFilter(project.domain);
  }, [project?.domain, domains.join(",")]);
  const list = (kws ?? []).filter((k) => domainFilter === "all" || k.domain === domainFilter);

  const prevOf = (id: number) => {
    const h = hist[id] ?? [];
    return h.length >= 2 ? h[h.length - 2].position : null;
  };
  const deltaOf = (k: Kw) => {
    const p = prevOf(k.id);
    return p !== null && k.lastPosition !== null ? p - k.lastPosition : null;
  };
  const checked = list.filter((k) => k.lastCheckedAt);
  const ranked = checked.filter((k) => k.lastPosition !== null);
  const top3 = ranked.filter((k) => (k.lastPosition ?? 99) <= 3).length;
  const top10 = ranked.filter((k) => (k.lastPosition ?? 99) <= 10).length;
  const avg = ranked.length ? Math.round((ranked.reduce((a, k) => a + (k.lastPosition ?? 0), 0) / ranked.length) * 10) / 10 : null;
  const upList = list.filter((k) => (deltaOf(k) ?? 0) > 0).sort((a, b) => (deltaOf(b) ?? 0) - (deltaOf(a) ?? 0));
  const downList = list.filter((k) => (deltaOf(k) ?? 0) < 0).sort((a, b) => (deltaOf(a) ?? 0) - (deltaOf(b) ?? 0));
  const striking = ranked.filter((k) => (k.lastPosition ?? 0) >= 11 && (k.lastPosition ?? 0) <= 20).sort((a, b) => (a.lastPosition ?? 0) - (b.lastPosition ?? 0));
  const unranked = checked.filter((k) => k.lastPosition === null);

  const [f, setF] = useState<"all" | "top10" | "striking" | "up" | "down" | "none">("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => {
    if (sel == null) return setWhy(null);
    setWhy("loading");
    fetch(`/api/rankings/explain?id=${sel}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setWhy(d))
      .catch(() => setWhy(null));
  }, [sel]);
  const shown = list
    .filter((k) =>
      f === "top10" ? (k.lastPosition ?? 999) <= 10 : f === "striking" ? striking.includes(k) : f === "up" ? upList.includes(k) : f === "down" ? downList.includes(k) : f === "none" ? unranked.includes(k) : true
    )
    .filter((k) => !q || k.keyword.toLocaleLowerCase("tr").includes(q.toLocaleLowerCase("tr")))
    .sort((a, b) => (a.lastPosition ?? 999) - (b.lastPosition ?? 999));
  const selKw = list.find((k) => k.id === sel) ?? null;

  const buckets = [
    { l: "1–3", n: top3, c: "#16a34a" },
    { l: "4–10", n: top10 - top3, c: "#4f00ff" },
    { l: "11–20", n: striking.length, c: "#8b5cf6" },
    { l: "21–50", n: ranked.filter((k) => (k.lastPosition ?? 0) > 20 && (k.lastPosition ?? 0) <= 50).length, c: "#f59e0b" },
    { l: "51–100", n: ranked.filter((k) => (k.lastPosition ?? 0) > 50).length, c: "#fb923c" },
    { l: "100+", n: unranked.length, c: "#ef4444" },
  ];

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
    setSel(null);
    await refresh();
  }

  const chip = (on: boolean) =>
    `inline-flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-[13px] font-medium whitespace-nowrap ${on ? "bg-accent/5 text-ink shadow-[inset_0_0_0_1px_#BDB4FF]" : "bg-panel text-sub shadow-[inset_0_0_0_1px_#E4E5E8] hover:text-ink"}`;
  const site = domainFilter !== "all" ? domainFilter : domains.length === 1 ? domains[0] : null;
  const lastCheck = checked.map((k) => k.lastCheckedAt!).sort().pop();

  const actions: { kind: string; color: string; title: string; body: string; cta: React.ReactNode }[] = [];
  if (!serpAvailable && !serpbear)
    actions.push({
      kind: "Kurulum",
      color: "text-danger-ink",
      title: "Sıralama verisi için kaynak bağla",
      body: "SerpApi (ücretsiz plan, her kontrol 1 arama) ya da kendi sunucundaki SerpBear. Bağlayınca kontroller her gün otomatik çalışır.",
      cta: <Link href="/integrations" className={BTN2}>Entegrasyonlar</Link>,
    });
  if (striking.length)
    actions.push({
      kind: "Hızlı kazanım",
      color: "text-seo-ink",
      title: `${striking.length} kelime ilk sayfanın hemen dışında`,
      body: `"${striking[0].keyword}" ${striking[0].lastPosition}. sırada. 11–20 arası kelimeler küçük bir içerik güncellemesiyle ilk sayfaya en kolay çıkanlardır.`,
      cta: <button type="button" onClick={() => setF("striking")} className={BTN2}>Kelimeleri göster</button>,
    });
  if (downList.length)
    actions.push({
      kind: "Düşüş",
      color: "text-danger-ink",
      title: `${downList.length} kelimede sıra düştü`,
      body: `En çok düşen "${downList[0].keyword}" (▼ ${-(deltaOf(downList[0]) ?? 0)}). Sayfayı denetle; rakip yeni içerik çıkarmış olabilir.`,
      cta: <button type="button" onClick={() => setF("down")} className={BTN2}>Düşenleri göster</button>,
    });
  if (unranked.length)
    actions.push({
      kind: "İçerik yok",
      color: "text-warn-ink",
      title: `${unranked.length} kelimede ilk 100'de yoksun`,
      body: `"${unranked[0].keyword}" için sitende uygun sayfa yok ya da Google bulmuyor. Bu kelimeye özel bir yazı en doğru adım.`,
      cta: <Link href={`/editor?new=${encodeURIComponent(unranked[0].keyword)}`} className={BTN2}>Yazı yaz</Link>,
    });
  if (list.length && !checked.length && (serpAvailable || serpbear))
    actions.push({
      kind: "Başla",
      color: "text-accent",
      title: "Kelimeler henüz kontrol edilmedi",
      body: "İlk sıraları görmek için şimdi kontrol et ya da günlük taramayı bekle.",
      cta: <button type="button" onClick={checkNow} className={BTN2}>Şimdi kontrol et</button>,
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title={site ? `${site} Google'da kaçıncı sırada?` : "Sıralama Takibi"}
        description={
          list.length
            ? `${list.length} kelime takipte${lastCheck ? ` · son kontrol ${new Date(lastCheck).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""} · ${serpAvailable || serpbear ? "her gün otomatik" : "kaynak bağlanmadığı için kontrol edilmiyor"}`
            : "Takip ettiğin kelimelerde sitenin Google'daki sırasını her gün kontrol eder; yükselen ve düşen kelimeleri gösterir."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {serpbear && (
              <>
                <button type="button" onClick={() => serpbearAction("import")} disabled={!!busy} className={BTN2}>
                  {busy === "sb-import" ? "Aktarılıyor…" : "SerpBear'dan aktar"}
                </button>
                <button type="button" onClick={() => serpbearAction("refresh")} disabled={!!busy} className={BTN2}>
                  {busy === "sb-refresh" ? "İsteniyor…" : "SerpBear'da yenile"}
                </button>
              </>
            )}
            <button type="button" onClick={checkNow} disabled={!serpAvailable || !list.length || busy === "check"} className={BTN2}>
              {busy === "check" ? "Kontrol ediliyor…" : "↻ Şimdi kontrol et"}
            </button>
            <button type="button" onClick={() => setOpen(true)} className={BTN1}>
              + Kelime ekle
            </button>
          </div>
        }
      />

      {msg && <div className={`rounded-xl px-4 py-2.5 text-sm ${msg.ok ? "bg-seo/10 text-seo-ink" : "bg-danger/5 text-danger-ink"}`}>{msg.text}</div>}

      {domains.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {["all", ...domains].map((d) => (
            <button key={d} type="button" onClick={() => setDomainFilter(d)} className={chip(domainFilter === d)}>
              {d === "all" ? "Tüm siteler" : d}
            </button>
          ))}
        </div>
      )}

      {kws === null && <TableSkeleton rows={4} cols={4} />}

      {kws && list.length === 0 && (
        <div className={`${CARD} px-6 py-10 text-center`}>
          <div className="text-base font-semibold">Henüz takip edilen kelime yok</div>
          <p className="mx-auto mt-1 max-w-md text-sm text-sub">
            Kelimeleri buradan ekle ya da{" "}
            <Link href="/keywords" className="font-medium text-accent">
              Anahtar Kelime Planlayıcı
            </Link>
            &apos;dan seçip &quot;Sıralama takibine ekle&quot;ye bas.
          </p>
          <button type="button" onClick={() => setOpen(true)} className={`${BTN1} mt-4`}>
            + Kelime ekle
          </button>
          {!serpAvailable && !serpbear && (
            <p className="mt-4 text-xs text-sub">
              Sıraları görmek için{" "}
              <Link href="/integrations" className="font-medium text-accent">
                SerpApi ya da SerpBear bağla
              </Link>
              .
            </p>
          )}
        </div>
      )}

      {kws && list.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {([
              ["Ortalama sıra", avg !== null ? String(avg) : "—", "", `${ranked.length} kelime sıralanıyor`, avg === null ? "" : avg <= 10 ? "text-seo-ink" : avg <= 30 ? "text-warn-ink" : "text-danger-ink"],
              ["İlk 3", String(top3), `/${list.length}`, "en çok tıklanan sıralar", top3 ? "text-seo-ink" : ""],
              ["İlk sayfa (1–10)", String(top10), `/${list.length}`, list.length ? `kelimelerin %${Math.round((top10 / list.length) * 100)}'i` : "", ""],
              ["Yükselen", String(upList.length), "", "son kontrole göre", upList.length ? "text-seo-ink" : ""],
              ["Düşen", String(downList.length), "", "son kontrole göre", downList.length ? "text-danger-ink" : ""],
            ] as const).map(([l, v, suf, hint, col]) => (
              <div key={l} className={`${CARD} px-4 py-4`}>
                <div className="text-xs font-medium text-sub">{l}</div>
                <div className="mt-1.5 flex items-baseline gap-1">
                  <span className={`text-[26px] font-semibold leading-8 tabular-nums ${col}`}>{v}</span>
                  {suf && <span className="text-sm text-sub">{suf}</span>}
                </div>
                <div className="mt-1 h-4 text-xs text-sub">{hint}</div>
              </div>
            ))}
          </div>

          {actions.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Ne yapmalı?</h3>
              <div className={`grid gap-3 ${["", "md:grid-cols-1", "md:grid-cols-2", "md:grid-cols-3"][Math.min(actions.length, 3)]}`}>
                {actions.slice(0, 3).map((a) => (
                  <div key={a.title} className={`${CARD} flex flex-col p-4`}>
                    <div className={`text-xs font-semibold uppercase tracking-wide ${a.color}`}>{a.kind}</div>
                    <h4 className="mt-1.5 text-sm font-semibold leading-5">{a.title}</h4>
                    <p className="mt-1 text-[13px] text-sub">{a.body}</p>
                    <div className="mt-auto flex justify-end pt-3">{a.cta}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
            <div className={`${CARD} overflow-hidden`}>
              <div className="flex flex-wrap items-center gap-2 px-5 py-3">
                {([
                  ["all", "Tümü", list.length],
                  ["top10", "İlk 10", top10],
                  ["striking", "11–20", striking.length],
                  ["up", "Yükselen", upList.length],
                  ["down", "Düşen", downList.length],
                  ["none", "Sıralanmıyor", unranked.length],
                ] as const).map(([k, l, n]) => (
                  <button key={k} type="button" onClick={() => setF(k)} className={chip(f === k)}>
                    {l} <span className="text-sub">{n}</span>
                  </button>
                ))}
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kelime ara…" className="ml-auto h-8 w-44 rounded-[9px] border border-border bg-panel px-3 text-[13px] outline-none focus:border-[#BDB4FF]" />
              </div>
              {shown.length === 0 ? (
                <div className="border-t border-border px-5 py-8 text-center text-sm text-sub">Bu filtrede kelime yok.</div>
              ) : (
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-y border-border bg-[#fafafa] text-left text-xs text-sub">
                      <th className="py-2 pl-5 font-medium">Kelime</th>
                      <th className="py-2 pr-3 font-medium">Sıra</th>
                      <th className="py-2 pr-3 font-medium">Değişim</th>
                      <th className="hidden py-2 pr-3 font-medium md:table-cell">Son 60 gün</th>
                      <th className="hidden py-2 pr-5 font-medium lg:table-cell">Sıralanan sayfa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {shown.map((k) => {
                      const delta = deltaOf(k);
                      const h = (hist[k.id] ?? []).map((x) => ({ p: x.position ?? 101 }));
                      return (
                        <tr key={k.id} onClick={() => setSel(k.id)} className="cursor-pointer hover:bg-[#fafafa]">
                          <td className="py-2.5 pl-5">
                            <div className="font-medium">{k.keyword}</div>
                            <div className="text-xs text-sub">
                              {domains.length > 1 ? `${k.domain} · ` : ""}
                              {k.gl.toUpperCase()}
                              {k.source === "serpbear" ? " · SerpBear" : ""}
                              {k.lastCheckedAt ? "" : " · henüz kontrol edilmedi"}
                            </div>
                          </td>
                          <td className="py-2.5 pr-3">
                            <span className={`rounded-md px-2 py-0.5 text-xs font-medium tabular-nums ${posTone(k.lastPosition)}`}>{k.lastCheckedAt ? (k.lastPosition ?? "100+") : "—"}</span>
                          </td>
                          <td className="py-2.5 pr-3 text-xs font-medium tabular-nums">
                            {delta === null || delta === 0 ? <span className="text-sub">—</span> : delta > 0 ? <span className="text-seo-ink">▲ {delta}</span> : <span className="text-danger-ink">▼ {-delta}</span>}
                          </td>
                          <td className="hidden py-2.5 pr-3 md:table-cell">
                            {h.length >= 2 ? (
                              <div className="h-8 w-28">
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart data={h}>
                                    <YAxis reversed domain={[1, "dataMax"]} hide />
                                    <Line type="monotone" dataKey="p" stroke="#4f00ff" strokeWidth={2} dot={false} isAnimationActive={false} />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                            ) : (
                              <span className="text-xs text-sub">yeterli veri yok</span>
                            )}
                          </td>
                          <td className="hidden max-w-[15rem] truncate py-2.5 pr-5 text-xs text-sub lg:table-cell">{k.lastUrl ? k.lastUrl.replace(/^https?:\/\/(www\.)?[^/]+/, "") || "/" : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="space-y-3">
              <div className={CARD}>
                <div className="px-5 pt-4">
                  <h3 className="text-sm font-semibold">Sıra dağılımı</h3>
                  <p className="text-xs text-sub">Kelimelerin hangi sıralarda olduğu</p>
                </div>
                <ul className="space-y-2 px-5 pb-4 pt-3">
                  {buckets.map((b) => {
                    const max = Math.max(1, ...buckets.map((x) => x.n));
                    return (
                      <li key={b.l} className="flex items-center gap-3 text-[13px]">
                        <span className="w-12 tabular-nums text-sub">{b.l}</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <span className="block h-full rounded-full" style={{ width: `${(b.n / max) * 100}%`, background: b.c }} />
                        </span>
                        <span className="w-6 text-right text-xs tabular-nums text-sub">{b.n}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              {(upList.length > 0 || downList.length > 0) && (
                <div className={CARD}>
                  <div className="px-5 pt-4">
                    <h3 className="text-sm font-semibold">En büyük hareketler</h3>
                  </div>
                  <ul className="divide-y divide-border px-5 pb-2 pt-2">
                    {[...upList.slice(0, 3), ...downList.slice(0, 3)].map((k) => {
                      const d = deltaOf(k) ?? 0;
                      return (
                        <li key={k.id}>
                          <button type="button" onClick={() => setSel(k.id)} className="flex w-full items-center gap-2 py-2 text-left text-[13px] hover:text-accent">
                            <span className="min-w-0 flex-1 truncate">{k.keyword}</span>
                            <span className={`text-xs font-medium tabular-nums ${d > 0 ? "text-seo-ink" : "text-danger-ink"}`}>{d > 0 ? `▲ ${d}` : `▼ ${-d}`}</span>
                            <span className="w-8 text-right text-xs tabular-nums text-sub">{k.lastPosition ?? "100+"}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Kelime detayı */}
      <Drawer isOpen={!!selKw} onClose={() => setSel(null)} eyebrow={selKw ? `${selKw.domain} · ${selKw.gl.toUpperCase()}` : ""} title={selKw?.keyword ?? ""} size="lg">
        {selKw && (
          <div className="space-y-5 text-[13px]">
            <div className="grid grid-cols-3 gap-2">
              {([
                ["Şu anki sıra", selKw.lastCheckedAt ? String(selKw.lastPosition ?? "100+") : "—"],
                ["Değişim", deltaOf(selKw) ? `${(deltaOf(selKw) ?? 0) > 0 ? "▲" : "▼"} ${Math.abs(deltaOf(selKw) ?? 0)}` : "—"],
                ["En iyi sıra", (() => { const ps = (hist[selKw.id] ?? []).map((x) => x.position).filter((x): x is number => x !== null); return ps.length ? String(Math.min(...ps)) : "—"; })()],
              ] as const).map(([l, v]) => (
                <div key={l} className="rounded-xl border border-border px-3 py-2">
                  <div className="text-xs text-sub">{l}</div>
                  <div className="text-lg font-semibold tabular-nums">{v}</div>
                </div>
              ))}
            </div>
            {(hist[selKw.id] ?? []).length >= 2 ? (
              <div>
                <div className="mb-1.5 text-xs font-medium text-sub">Son 60 gün</div>
                <div className="h-40 rounded-xl border border-border p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={(hist[selKw.id] ?? []).map((x) => ({ p: x.position ?? 101, d: new Date(x.at).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }) }))}>
                      <YAxis reversed allowDecimals={false} domain={[1, "dataMax"]} width={28} fontSize={11} stroke="#94a3b8" tickLine={false} axisLine={false} />
                      <Line type="monotone" dataKey="p" stroke="#4f00ff" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <p className="text-sub">Grafik için en az iki kontrol gerekiyor.</p>
            )}
            {why === "loading" ? (
              <p className="text-sub">Google sonuçları yükleniyor…</p>
            ) : why?.explanation ? (
              <>
                <section className="rounded-xl bg-accent/[0.06] p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-accent">Neden?</h3>
                  <ul className="mt-1.5 space-y-1">
                    {why.explanation.lines.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-sub">
                    Google sonuçları {new Date(why.checkedAt ?? "").toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
                    {why.prevAt ? ` ile ${new Date(why.prevAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} karşılaştırıldı` : " kontrolünden"}.
                  </p>
                </section>
                <section>
                  <h3 className="mb-1.5 text-xs font-medium text-sub">Google&apos;da şu an ilk 10{why.aiOverview ? " · üstte AI Overview var" : ""}</h3>
                  <ol className="divide-y divide-border rounded-xl border border-border">
                    {why.top.map((r) => {
                      const own = r.d.replace(/^www\./, "") === selKw.domain.replace(/^www\./, "") || r.d.endsWith(`.${selKw.domain.replace(/^www\./, "")}`);
                      const was = why.explanation!.above.find((x) => x.u === r.u)?.was;
                      return (
                        <li key={r.u} className={`flex items-center gap-3 px-3 py-2 ${own ? "bg-accent/[0.06]" : ""}`}>
                          <span className="w-6 text-right font-semibold tabular-nums text-sub">{r.p}</span>
                          <div className="min-w-0 flex-1">
                            <a href={r.u} target="_blank" rel="noreferrer" className={`block truncate font-medium hover:underline ${own ? "text-accent" : "text-ink"}`}>
                              {r.t || r.d}
                            </a>
                            <div className="truncate text-xs text-sub">{r.d}{own ? " · senin sayfan" : ""}</div>
                          </div>
                          {why.prevAt && !own && (
                            <span className={`whitespace-nowrap text-xs font-medium ${was == null ? "text-danger-ink" : was > r.p ? "text-danger-ink" : "text-sub"}`}>
                              {was == null ? (why.explanation!.above.some((x) => x.u === r.u) ? "yeni" : "") : was !== r.p ? `${was}. → ${r.p}.` : ""}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </section>
                {why.paa.length > 0 && (
                  <section>
                    <h3 className="mb-1.5 text-xs font-medium text-sub">Google&apos;da &quot;İnsanlar şunu da soruyor&quot;: bunları sayfanda cevapla</h3>
                    <ul className="space-y-1">
                      {why.paa.map((q) => (
                        <li key={q} className="rounded-lg bg-muted/60 px-3 py-1.5">{q}</li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            ) : (
              <p className="rounded-xl bg-muted/60 px-3 py-2 text-xs text-sub">
                &quot;Neden düştü?&quot; açıklaması bir sonraki SerpApi kontrolünden itibaren çıkar: Google&apos;ın ilk 10&apos;u artık her kontrolde kaydediliyor (ek arama harcamadan).
              </p>
            )}
            <div>
              <div className="mb-1 text-xs font-medium text-sub">Sıralanan sayfa</div>
              {selKw.lastUrl ? (
                <a href={selKw.lastUrl} target="_blank" rel="noreferrer" className="break-all text-accent hover:underline">
                  {selKw.lastUrl}
                </a>
              ) : (
                <span className="text-sub">İlk 100&apos;de sitenden bir sayfa yok.</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              {selKw.lastUrl ? (
                <Link href={`/audit?url=${encodeURIComponent(selKw.lastUrl)}`} className={BTN2}>
                  Sayfayı denetle
                </Link>
              ) : (
                <Link href={`/editor?new=${encodeURIComponent(selKw.keyword)}`} className={BTN1}>
                  Bu kelimeye yazı yaz
                </Link>
              )}
              <Link href={`/keywords?q=${encodeURIComponent(selKw.keyword)}`} className={BTN2}>
                Benzer kelimeler
              </Link>
              <button type="button" onClick={() => remove(selKw.id)} className="ml-auto text-xs font-medium text-danger-ink hover:text-danger-ink">
                Takipten çıkar
              </button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Kelime ekle */}
      <Drawer
        isOpen={open}
        onClose={() => setOpen(false)}
        eyebrow="Sıralama Takibi"
        title="Takibe kelime ekle"
        subtitle="Her kelime günde bir kez, Google'da ilk 100 içinde kontrol edilir (1 SerpApi araması)."
        size="md"
        as="form"
        onSubmit={add}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className={BTN2}>
              Vazgeç
            </button>
            <button disabled={busy === "add"} className={BTN1}>
              {busy === "add" ? "Ekleniyor…" : "Ekle"}
            </button>
          </div>
        }
      >
        <div className="space-y-4 text-[13px]">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-sub">Site</div>
            <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="siten.com" className="h-9 w-full rounded-[10px] border border-border bg-panel px-3 outline-none focus:border-[#BDB4FF]" />
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-sub">Kelimeler (her satıra bir tane)</div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} placeholder={"abiye elbise\nnişan elbisesi modelleri"} className="w-full rounded-[10px] border border-border bg-panel px-3 py-2 outline-none focus:border-[#BDB4FF]" />
          </div>
          <p className="text-xs text-sub">
            Kelime bulmak için{" "}
            <Link href="/keywords" className="font-medium text-accent">
              Anahtar Kelime Planlayıcı
            </Link>
            &apos;yı kullan.
          </p>
        </div>
      </Drawer>
    </div>
  );
}
