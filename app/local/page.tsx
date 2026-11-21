"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import UsageMeter from "@/components/UsageMeter";
import { Drawer, ErrorBlock, PageHeader, TableSkeleton, BTN1, BTN2, CARD, INPUT } from "@/components/ui";
import { useProject } from "@/components/ProjectProvider";

/**
 * Yerel — iki görünüm, aynı düzen (GEO / Site Denetimi şablonu):
 *  ?tab=reviews → Yorum Yanıtları, varsayılan → GBP Gönderileri.
 * Soru başlığı → 5 metrik → "Ne yapmalı?" → geçmiş tablosu (tıkla → çekmece) + yan kartlar.
 * Yeni taslak çekmecede üretilir (1 içerik kotası). Google'a hiçbir şey otomatik gönderilmez.
 */

interface Item {
  id: number;
  kind: string;
  business: string;
  input: string;
  output: string;
  rating: number | null;
  createdAt: string;
}

const chip = (on: boolean) =>
  `inline-flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-[13px] font-medium whitespace-nowrap ${on ? "bg-accent/5 text-ink shadow-[inset_0_0_0_1px_#BDB4FF]" : "bg-panel text-sub shadow-[inset_0_0_0_1px_#E4E5E8] hover:text-ink"}`;

const POST_IDEAS = ["Hafta sonu kampanyası", "Yeni ürün ya da hizmet tanıtımı", "Bir müşteri yorumunu paylaş", "Sık sorulan bir soruya cevap", "Çalışma saatleri / özel gün duyurusu", "Ekipten bir tanıtım"];
const stars = (n: number | null) => (n ? "★".repeat(n) + "☆".repeat(5 - n) : "—");
const day = (iso: string) => new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
const daysAgo = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);

export default function LocalToolsPage() {
  const reviews = useSearchParams().get("tab") === "reviews";
  const kind = reviews ? "review-reply" : "gbp-post";
  const { project } = useProject();

  const [brandName, setBrandName] = useState("");
  const [brandDomain, setBrandDomain] = useState("");
  useEffect(() => {
    if (!project) return;
    setBrandName(project.name);
    setBrandDomain(project.domain);
  }, [project]);

  const [items, setItems] = useState<Item[] | null>(null);
  const [rk, setRk] = useState(0);
  useEffect(() => {
    setItems(null);
    const qs = new URLSearchParams({ kind });
    if (project) qs.set("business", project.name);
    fetch(`/api/local/history?${qs}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]));
  }, [kind, project, rk]);

  const [open, setOpen] = useState<Item | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [rf, setRf] = useState<"all" | "neg" | "mid" | "pos">("all");
  const [q, setQ] = useState("");

  // Yeni taslak formu
  const [topic, setTopic] = useState("");
  const [reviewText, setReviewText] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [gen, setGen] = useState<{ busy: boolean; err: string | null; text: string; demo: boolean }>({ busy: false, err: null, text: "", demo: false });
  const [copied, setCopied] = useState<string | null>(null);

  function startNew(prefill?: string) {
    setGen({ busy: false, err: null, text: "", demo: false });
    if (prefill !== undefined) setTopic(prefill);
    setNewOpen(true);
  }

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!brandName.trim() || !brandDomain.trim()) return setGen((g) => ({ ...g, err: "İşletme adını ve sitesini gir." }));
    setGen({ busy: true, err: null, text: "", demo: false });
    try {
      const body = reviews ? { kind, brandName, brandDomain, reviewText, rating: rating ?? undefined } : { kind, brandName, brandDomain, topic };
      const res = await fetch("/api/local/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Üretim başarısız oldu");
      setGen({ busy: false, err: null, text: data.text, demo: !!data.demoMode });
      setRk((k) => k + 1);
      window.dispatchEvent(new Event("epicsem:usage-changed"));
    } catch (err) {
      setGen({ busy: false, err: err instanceof Error ? err.message : "Bir şeyler ters gitti", text: "", demo: false });
    }
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    });
  }

  /* ---------------- metrikler ---------------- */
  const list = items ?? [];
  const month = list.filter((i) => daysAgo(i.createdAt) < 30).length;
  const last = list[0] ?? null;
  const rated = list.filter((i) => i.rating);
  const avg = rated.length ? (rated.reduce((a, i) => a + (i.rating ?? 0), 0) / rated.length).toFixed(1) : null;
  const neg = rated.filter((i) => (i.rating ?? 5) <= 2);
  const weeks = useMemo(() => {
    const out: { l: string; n: number }[] = [];
    for (let w = 7; w >= 0; w--) {
      const end = Date.now() - w * 7 * 864e5;
      const start = end - 7 * 864e5;
      out.push({ l: new Date(end).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }), n: list.filter((i) => { const t = new Date(i.createdAt).getTime(); return t > start && t <= end; }).length });
    }
    return out;
  }, [list]);

  const shown = list
    .filter((i) => !reviews || rf === "all" || (rf === "neg" ? (i.rating ?? 0) >= 1 && (i.rating ?? 0) <= 2 : rf === "mid" ? i.rating === 3 : (i.rating ?? 0) >= 4))
    .filter((i) => !q || (i.input + " " + i.output).toLocaleLowerCase("tr").includes(q.toLocaleLowerCase("tr")));

  const kpis: [string, string, string, string][] = reviews
    ? [
        ["Yanıtlanan yorum", String(list.length), "", "toplam taslak"],
        ["Son 30 gün", String(month), "", "yeni yanıt"],
        ["Ortalama puan", avg ?? "—", avg ? "/5" : "", `${rated.length} puanlı yorum`],
        ["Olumsuz yorum", String(neg.length), "", "1–2 yıldız"],
        ["Son yanıt", last ? (daysAgo(last.createdAt) === 0 ? "Bugün" : `${daysAgo(last.createdAt)} gün`) : "—", "", last ? "önce" : "henüz yok"],
      ]
    : [
        ["Gönderi taslağı", String(list.length), "", "toplam"],
        ["Son 30 gün", String(month), "", "yeni gönderi"],
        ["Haftalık ortalama", list.length ? (weeks.reduce((a, w) => a + w.n, 0) / 8).toFixed(1) : "0", "", "son 8 hafta"],
        ["Son gönderi", last ? (daysAgo(last.createdAt) === 0 ? "Bugün" : `${daysAgo(last.createdAt)} gün`) : "—", "", last ? "önce" : "henüz yok"],
        ["Hedef", "1", "/hafta", "Google aktif profilleri öne çıkarır"],
      ];

  const actions: { kind: string; color: string; title: string; body: string; cta: React.ReactNode }[] = [];
  if (reviews) {
    if (neg.length)
      actions.push({
        kind: "Öncelik",
        color: "text-danger-ink",
        title: `${neg.length} olumsuz yorum var`,
        body: "Olumsuz yorumlara 24 saat içinde, özür dileyip çözüm öneren kısa bir yanıt hem müşteriyi hem yorumu okuyan herkesi etkiler.",
        cta: <button type="button" onClick={() => setRf("neg")} className={BTN2}>Olumsuzları göster</button>,
      });
    actions.push({
      kind: "Yeni yorum",
      color: "text-accent",
      title: "Yeni bir yoruma yanıt hazırla",
      body: "Google Business Profile'daki yorumu kopyala, puanını seç; markanın tonunda kısa bir yanıt taslağı hazırlansın.",
      cta: <button type="button" onClick={() => startNew()} className={BTN2}>Yanıt hazırla</button>,
    });
    actions.push({
      kind: "Fırsat",
      color: "text-seo-ink",
      title: "Yanıtlarda hizmeti ve şehri an",
      body: "\"Kadıköy'deki manikür hizmetimiz\" gibi doğal ifadeler yerel aramada ve AI cevaplarında işletmeni güçlendirir. Taslaklar bunu otomatik yapar.",
      cta: <Link href="/geo" className={BTN2}>AI görünürlüğü</Link>,
    });
  } else {
    if (!last || daysAgo(last.createdAt) >= 7)
      actions.push({
        kind: "Bu hafta",
        color: "text-danger-ink",
        title: last ? `${daysAgo(last.createdAt)} gündür gönderi yok` : "Henüz gönderi yok",
        body: "Google, düzenli paylaşım yapan profilleri yerel aramada daha canlı gösterir. Haftada bir gönderi yeterli.",
        cta: <button type="button" onClick={() => startNew("")} className={BTN2}>Gönderi hazırla</button>,
      });
    actions.push({
      kind: "Fikir",
      color: "text-accent",
      title: "Konu bulamıyor musun?",
      body: "Kampanya, yeni ürün, müşteri yorumu ya da sık sorulan bir soru. Aşağıdaki fikirlerden birine tıkla, taslak hazırlansın.",
      cta: <button type="button" onClick={() => startNew(POST_IDEAS[0])} className={BTN2}>Fikirle başla</button>,
    });
    actions.push({
      kind: "Yorumlar",
      color: "text-seo-ink",
      title: "Yorumları yanıtsız bırakma",
      body: "Yanıtlanan yorumlar, profilin güvenilirliğini ve yerel sıralamanı artırır.",
      cta: <Link href="/local?tab=reviews" className={BTN2}>Yorum Yanıtları</Link>,
    });
  }

  const biz = project?.name ?? (brandName || null);
  const title = reviews ? (biz ? `${biz} yorumlarına ne cevap veriyor?` : "Yorum Yanıtları") : biz ? `${biz} Google profilinde ne paylaşıyor?` : "GBP Gönderileri";
  const desc = reviews
    ? `${list.length} yanıt taslağı${avg ? ` · ortalama ${avg}★` : ""} · markanın tonunda, kopyala-yapıştır`
    : `${list.length} gönderi taslağı${last ? ` · son gönderi ${day(last.createdAt)}` : ""} · Google Business Profile için`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={desc}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={reviews ? "/local" : "/local?tab=reviews"} className={BTN2}>
              {reviews ? "GBP Gönderileri" : "Yorum Yanıtları"}
            </Link>
            <button type="button" onClick={() => startNew()} className={BTN1}>
              {reviews ? "+ Yeni yanıt" : "+ Yeni gönderi"}
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map(([l, v, suf, hint]) => (
          <div key={l} className={`${CARD} px-4 py-4`}>
            <div className="text-xs font-medium text-sub">{l}</div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className={`text-[26px] font-semibold leading-8 tabular-nums ${l === "Olumsuz yorum" && neg.length ? "text-danger-ink" : ""}`}>{items === null ? "…" : v}</span>
              {suf && <span className="text-sm text-sub">{suf}</span>}
            </div>
            <div className="mt-1 h-4 truncate text-[11px] text-sub">{hint}</div>
          </div>
        ))}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Ne yapmalı?</h3>
        <div className="grid gap-3 md:grid-cols-3">
          {actions.slice(0, 3).map((a) => (
            <div key={a.title} className={`${CARD} flex flex-col p-4`}>
              <div className={`text-[11px] font-semibold uppercase tracking-wide ${a.color}`}>{a.kind}</div>
              <h4 className="mt-1.5 text-sm font-semibold leading-5">{a.title}</h4>
              <p className="mt-1 text-[13px] text-sub">{a.body}</p>
              <div className="mt-auto flex justify-end pt-3">{a.cta}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
        <div className={`${CARD} overflow-hidden`}>
          <div className="flex flex-wrap items-center gap-2 px-5 py-3">
            <span className="text-sm font-semibold">{reviews ? "Yanıtlar" : "Gönderiler"}</span>
            {reviews &&
              ([
                ["all", "Tümü"],
                ["neg", "1–2★"],
                ["mid", "3★"],
                ["pos", "4–5★"],
              ] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setRf(k)} className={chip(rf === k)}>
                  {l}
                </button>
              ))}
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ara…" className="ml-auto h-8 w-44 rounded-[9px] border border-border bg-panel px-3 text-[13px] outline-none focus:border-[#BDB4FF]" />
          </div>
          {items === null ? (
            <TableSkeleton bare rows={4} cols={3} />
          ) : shown.length === 0 ? (
            <div className="border-t border-border px-6 py-10 text-center">
              <div className="text-sm font-semibold">{list.length ? "Bu filtrede kayıt yok" : reviews ? "Henüz yanıt taslağı yok" : "Henüz gönderi taslağı yok"}</div>
              <p className="mx-auto mt-1 max-w-sm text-[13px] text-sub">{reviews ? "Google'daki bir yorumu yapıştır, markanın tonunda yanıt taslağı hazırlansın." : "Bir konu yaz ya da hazır fikirlerden birini seç; gönderi taslağı hazırlansın."}</p>
              {!list.length && (
                <button type="button" onClick={() => startNew()} className={`${BTN1} mt-4`}>
                  {reviews ? "+ Yeni yanıt" : "+ Yeni gönderi"}
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-y border-border bg-[#fafafa] text-left text-xs text-sub">
                  {reviews && <th className="w-24 py-2 pl-5 font-medium">Puan</th>}
                  <th className={`py-2 font-medium ${reviews ? "pr-3" : "pl-5 pr-3"}`}>{reviews ? "Yorum" : "Konu"}</th>
                  <th className="hidden py-2 pr-3 font-medium md:table-cell">{reviews ? "Yanıt" : "Gönderi"}</th>
                  <th className="py-2 pr-5 text-right font-medium">Tarih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.slice(0, 200).map((i) => (
                  <tr key={i.id} onClick={() => setOpen(i)} className="cursor-pointer hover:bg-[#fafafa]">
                    {reviews && <td className={`py-2.5 pl-5 text-xs tracking-tight ${(i.rating ?? 5) <= 2 ? "text-danger-ink" : (i.rating ?? 0) === 3 ? "text-warn-ink" : "text-[#f59e0b]"}`}>{stars(i.rating)}</td>}
                    <td className={`max-w-[18rem] py-2.5 ${reviews ? "pr-3" : "pl-5 pr-3"}`}>
                      <div className="truncate font-medium">{i.input}</div>
                      {!project && <div className="text-[11px] text-sub">{i.business}</div>}
                    </td>
                    <td className="hidden max-w-[22rem] py-2.5 pr-3 text-sub md:table-cell">
                      <div className="truncate">{i.output}</div>
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-5 text-right text-xs text-sub">{day(i.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="space-y-3">
          {reviews ? (
            <div className={CARD}>
              <div className="px-5 pt-4">
                <h3 className="text-sm font-semibold">Puan dağılımı</h3>
                <p className="text-xs text-sub">Yanıt verilen yorumların yıldızı</p>
              </div>
              <ul className="space-y-2 px-5 pb-4 pt-3">
                {[5, 4, 3, 2, 1].map((s) => {
                  const n = rated.filter((i) => i.rating === s).length;
                  const max = Math.max(1, ...[1, 2, 3, 4, 5].map((x) => rated.filter((i) => i.rating === x).length));
                  return (
                    <li key={s} className="flex items-center gap-3 text-[13px]">
                      <span className="w-8 text-sub">{s}★</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full" style={{ width: `${(n / max) * 100}%`, background: s <= 2 ? "#ef4444" : s === 3 ? "#f59e0b" : "#16a34a" }} />
                      </span>
                      <span className="w-6 text-right text-xs tabular-nums text-sub">{n}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <div className={CARD}>
              <div className="px-5 pt-4">
                <h3 className="text-sm font-semibold">Gönderi fikirleri</h3>
                <p className="text-xs text-sub">Tıkla, taslak hazırlansın</p>
              </div>
              <div className="flex flex-wrap gap-1.5 px-5 pb-4 pt-3">
                {POST_IDEAS.map((t) => (
                  <button key={t} type="button" onClick={() => startNew(t)} className={chip(false)}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className={CARD}>
            <div className="px-5 pt-4">
              <h3 className="text-sm font-semibold">Haftalık üretim</h3>
              <p className="text-xs text-sub">Son 8 hafta</p>
            </div>
            <div className="flex h-24 items-end gap-1.5 px-5 pb-2 pt-3">
              {weeks.map((w) => {
                const max = Math.max(1, ...weeks.map((x) => x.n));
                return (
                  <div key={w.l} title={`${w.l}: ${w.n}`} className="flex flex-1 flex-col items-center gap-1">
                    <div className="w-full rounded-t-[4px] bg-accent" style={{ height: `${Math.max(3, (w.n / max) * 64)}px`, opacity: w.n ? 1 : 0.15 }} />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between px-5 pb-3 text-[11px] text-sub">
              <span>{weeks[0].l}</span>
              <span>{weeks[weeks.length - 1].l}</span>
            </div>
          </div>
          <div className={`${CARD} p-4 text-[12px] leading-5 text-sub`}>
            Google&apos;a hiçbir şey otomatik gönderilmez. Taslağı kopyalayıp Google Business Profile&apos;da {reviews ? "yorumun altındaki yanıt kutusuna" : "\"Güncelleme ekle\" alanına"} yapıştırırsın.
          </div>
        </div>
      </div>

      {/* Taslak detayı */}
      <Drawer isOpen={!!open} onClose={() => setOpen(null)} eyebrow={open ? `${open.business} · ${day(open.createdAt)}` : ""} title={reviews ? (open?.rating ? `${stars(open.rating)} yorum` : "Yorum yanıtı") : "Gönderi taslağı"} size="lg">
        {open && (
          <div className="space-y-5 text-[13px]">
            <div>
              <div className="mb-1.5 text-xs font-medium text-sub">{reviews ? "Müşterinin yorumu" : "Konu"}</div>
              <div className="whitespace-pre-wrap rounded-xl bg-[#fafafa] p-3">{open.input}</div>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium text-sub">{reviews ? "Yanıt taslağı" : "Gönderi metni"}</div>
              <div className="whitespace-pre-wrap rounded-xl border border-border p-3 leading-6">{open.output}</div>
              <div className="mt-2 flex items-center gap-2">
                <button type="button" onClick={() => copy(open.output, `o${open.id}`)} className={BTN1}>
                  {copied === `o${open.id}` ? "Kopyalandı ✓" : "Kopyala"}
                </button>
                <span className="text-[11px] text-sub">{open.output.length} karakter{!reviews && open.output.length > 1500 ? " · GBP sınırı 1.500" : ""}</span>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* Yeni taslak */}
      <Drawer
        isOpen={newOpen}
        onClose={() => setNewOpen(false)}
        eyebrow={reviews ? "Yorum Yanıtları" : "GBP Gönderileri"}
        title={reviews ? "Yeni yorum yanıtı" : "Yeni gönderi"}
        subtitle="Markanın tonunda taslak hazırlanır; 1 içerik kotası kullanır. Google'a otomatik gönderilmez."
        size="lg"
        as="form"
        onSubmit={generate}
        footer={
          <div className="flex items-center justify-between gap-3">
            <UsageMeter metric="contentGenerations" />
            <button disabled={gen.busy || (reviews ? !reviewText.trim() : !topic.trim())} className={`${BTN1} shrink-0 whitespace-nowrap`}>
              {gen.busy ? "Hazırlanıyor…" : gen.text ? "Yeniden üret" : "Taslak hazırla"}
            </button>
          </div>
        }
      >
        <div className="space-y-5 text-[13px]">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-sub">İşletme</div>
            <div className="grid grid-cols-2 gap-2">
              <input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="İşletme adı" className={INPUT} />
              <input value={brandDomain} onChange={(e) => setBrandDomain(e.target.value)} placeholder="site.com" className={INPUT} />
            </div>
          </div>
          {reviews ? (
            <>
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-sub">Müşterinin yorumu</div>
                <textarea value={reviewText} onChange={(e) => setReviewText(e.target.value)} rows={5} placeholder="Google'daki yorumu buraya yapıştır" className="w-full rounded-[10px] border border-border bg-panel px-3 py-2 outline-none focus:border-[#BDB4FF]" />
              </div>
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-sub">Puan</div>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((r) => (
                    <button key={r} type="button" onClick={() => setRating(rating === r ? null : r)} className={chip(rating === r)}>
                      {r}★
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-sub">Konu</div>
                <textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={3} placeholder="ör. hafta sonu %20 indirim, yeni hizmetimiz, bayram çalışma saatleri" className="w-full rounded-[10px] border border-border bg-panel px-3 py-2 outline-none focus:border-[#BDB4FF]" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {POST_IDEAS.map((t) => (
                  <button key={t} type="button" onClick={() => setTopic(t)} className={chip(topic === t)}>
                    {t}
                  </button>
                ))}
              </div>
            </>
          )}
          <ErrorBlock message={gen.err} />
          {gen.text && (
            <div className="border-t border-border pt-4">
              <div className="mb-1.5 text-xs font-medium text-sub">{gen.demo ? "Örnek (demo mod, yapay zekâ çalışmadı)" : "Taslak hazır"}</div>
              <div className="whitespace-pre-wrap rounded-xl border border-[#BDB4FF] bg-accent/[0.03] p-3 leading-6">{gen.text}</div>
              <button type="button" onClick={() => copy(gen.text, "new")} className={`${BTN1} mt-2`}>
                {copied === "new" ? "Kopyalandı ✓" : "Kopyala"}
              </button>
            </div>
          )}
        </div>
      </Drawer>
    </div>
  );
}
