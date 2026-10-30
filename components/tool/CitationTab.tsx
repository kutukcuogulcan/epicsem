"use client";

import { useEffect, useMemo, useState } from "react";
import { BIZ_LABEL, DIRECTORIES, GROUP_LABEL, type BizType, type DirGroup } from "@/lib/citation-directories";

interface Profile {
  bizType?: BizType;
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  category?: string;
  description?: string;
  texts?: {
    tagline?: { tr?: string; en?: string };
    short?: { tr?: string; en?: string };
    long?: { tr?: string; en?: string };
    categories?: string[];
    keywords?: string[];
    demo?: boolean;
  } | null;
}
interface StatusRow {
  dirId: string;
  status: string;
  listingUrl: string | null;
  linkFound: boolean | null;
  checkedAt: string | null;
}

const STATUS: Record<string, [string, string]> = {
  todo: ["Yapılacak", "bg-muted text-ink/55"],
  sent: ["Başvuruldu", "bg-warn/10 text-warn"],
  live: ["Yayında", "bg-seo/10 text-seo"],
  skip: ["Atla", "bg-muted text-ink/35"],
};
const PRIO: Record<number, string> = { 3: "Mutlaka", 2: "Önerilir", 1: "İsteğe bağlı" };

function Copy({ label, value }: { label: string; value?: string }) {
  const [ok, setOk] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(value).then(() => {
        setOk(true);
        setTimeout(() => setOk(false), 1500);
      })}
      className="group flex w-full items-start gap-3 rounded-xl border border-border bg-panel px-3 py-2.5 text-left transition hover:border-accent/40"
    >
      <span className="w-20 shrink-0 pt-0.5 text-[10px] font-bold uppercase tracking-wide text-ink/40">{label}</span>
      <span className="min-w-0 flex-1 whitespace-pre-line text-xs leading-relaxed text-ink/80">{value}</span>
      <span className={`shrink-0 text-[10px] font-bold ${ok ? "text-seo" : "text-accent opacity-0 group-hover:opacity-100"}`}>{ok ? "Kopyalandı" : "Kopyala"}</span>
    </button>
  );
}

/** Backlink sayfası → "Kayıt listesi" sekmesi. */
export default function CitationTab({ site }: { site: string }) {
  const [profile, setProfile] = useState<Profile>({});
  const [rows, setRows] = useState<Record<string, StatusRow>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [writing, setWriting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [lang, setLang] = useState<"tr" | "en">("tr");
  const [showAll, setShowAll] = useState(false);
  const [editProfile, setEditProfile] = useState(false);

  async function load() {
    if (!site) return;
    setLoading(true);
    const r = await fetch(`/api/citations?site=${encodeURIComponent(site)}`);
    const d = await r.json().catch(() => ({}));
    setProfile(d.profile ?? {});
    setRows(Object.fromEntries((d.statuses ?? []).map((s: StatusRow) => [s.dirId, s])));
    setEditProfile(!d.profile?.name);
    setLoading(false);
  }
  useEffect(() => {
    const t = setTimeout(load, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site]);

  const biz: BizType = profile.bizType ?? "ecommerce";
  const list = useMemo(
    () => DIRECTORIES.filter((d) => showAll || d.for.includes(biz)).sort((a, b) => b.priority - a.priority),
    [biz, showAll]
  );
  const groups = useMemo(() => {
    const g = new Map<DirGroup, typeof list>();
    for (const d of list) g.set(d.group, [...(g.get(d.group) ?? []), d]);
    return [...g.entries()];
  }, [list]);
  const relevant = DIRECTORIES.filter((d) => d.for.includes(biz) && rows[d.id]?.status !== "skip");
  const done = relevant.filter((d) => rows[d.id]?.status === "live").length;
  const sent = relevant.filter((d) => rows[d.id]?.status === "sent").length;
  const must = relevant.filter((d) => d.priority === 3);
  const mustDone = must.filter((d) => rows[d.id]?.status === "live").length;
  const linked = Object.values(rows).filter((r) => r.linkFound === true).length;

  async function saveProfile(e?: React.FormEvent) {
    e?.preventDefault();
    setSaving(true);
    setMsg(null);
    const r = await fetch("/api/citations", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ site, profile }) });
    setSaving(false);
    if (r.ok) {
      setEditProfile(false);
      setMsg({ ok: true, text: "İşletme bilgileri kaydedildi." });
    } else setMsg({ ok: false, text: (await r.json().catch(() => ({}))).error ?? "Kaydedilemedi" });
  }

  async function writeTexts() {
    setWriting(true);
    setMsg(null);
    try {
      const r = await fetch("/api/citations/texts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ site }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Metinler yazılamadı");
      setProfile((p) => ({ ...p, texts: d.texts }));
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Metinler yazılamadı" });
    } finally {
      setWriting(false);
    }
  }

  async function update(dirId: string, patch: { status?: string; listingUrl?: string }) {
    setRows((r) => ({ ...r, [dirId]: { dirId, status: r[dirId]?.status ?? "todo", listingUrl: r[dirId]?.listingUrl ?? null, linkFound: r[dirId]?.linkFound ?? null, checkedAt: r[dirId]?.checkedAt ?? null, ...patch } as StatusRow }));
    const r = await fetch("/api/citations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ site, dirId, ...patch }) });
    if (!r.ok) setMsg({ ok: false, text: (await r.json().catch(() => ({}))).error ?? "Kaydedilemedi" });
  }

  async function checkAll(dirId?: string) {
    setChecking(true);
    setMsg(null);
    const r = await fetch("/api/citations/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ site, dirId }) });
    const d = await r.json().catch(() => ({}));
    setChecking(false);
    if (!r.ok) return setMsg({ ok: false, text: d.error ?? "Kontrol başarısız" });
    const res: { linkFound: boolean | null }[] = d.results ?? [];
    setMsg({ ok: true, text: res.length ? `${res.length} profil kontrol edildi: ${res.filter((x) => x.linkFound === true).length} linkli, ${res.filter((x) => x.linkFound === false).length} linksiz, ${res.filter((x) => x.linkFound === null).length} doğrulanamadı (giriş isteyen sayfa).` : "Kontrol edilecek profil adresi yok — önce profil linklerini gir." });
    await load();
  }

  const t = profile.texts;
  const inp = "w-full rounded-xl border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-accent";

  if (!site) return <div className="rounded-2xl border border-border bg-panel p-8 text-center text-sm text-ink/50">Önce yukarıya siteni yaz.</div>;
  if (loading) return <div className="h-40 animate-pulse rounded-2xl border border-border bg-panel" />;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Yayında", `${done} / ${relevant.length}`, "önerilen kayıtlardan"],
          ["Mutlaka olanlar", `${mustDone} / ${must.length}`, "öncelikli kayıtlar"],
          ["Başvuruldu", String(sent), "onay bekleyen"],
          ["Link doğrulandı", String(linked), "profilde site linki var"],
        ].map(([l, v, s]) => (
          <div key={l} className="rounded-2xl border border-border bg-panel p-4">
            <div className="text-[11px] text-ink/50">{l}</div>
            <div className="text-2xl font-extrabold tabular-nums">{v}</div>
            <div className="text-[11px] text-ink/40">{s}</div>
          </div>
        ))}
      </div>

      {msg && <div className={`rounded-xl px-4 py-2.5 text-sm ${msg.ok ? "bg-seo/5 text-seo" : "bg-danger/5 text-danger"}`}>{msg.text}</div>}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        {/* İşletme bilgileri */}
        <div className="rounded-2xl border border-border bg-panel">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div>
              <div className="text-sm font-bold">İşletme bilgileri</div>
              <div className="text-[11px] text-ink/45">Her kayıtta birebir aynı yaz — tutarlılık hem Google hem AI için önemli</div>
            </div>
            {!editProfile && (
              <button type="button" onClick={() => setEditProfile(true)} className="text-xs font-semibold text-accent hover:underline">
                Düzenle
              </button>
            )}
          </div>
          {editProfile ? (
            <form onSubmit={saveProfile} className="space-y-3 p-5">
              <select value={biz} onChange={(e) => setProfile((p) => ({ ...p, bizType: e.target.value as BizType }))} className={inp}>
                {(Object.keys(BIZ_LABEL) as BizType[]).map((k) => (
                  <option key={k} value={k}>
                    {BIZ_LABEL[k]}
                  </option>
                ))}
              </select>
              <input value={profile.name ?? ""} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} placeholder="İşletme adı (resmi)" className={inp} required />
              <input value={profile.category ?? ""} onChange={(e) => setProfile((p) => ({ ...p, category: e.target.value }))} placeholder="Ana kategori (ör. Kadın giyim mağazası)" className={inp} />
              <input value={profile.address ?? ""} onChange={(e) => setProfile((p) => ({ ...p, address: e.target.value }))} placeholder="Açık adres (yerel işletmeler için)" className={inp} />
              <div className="grid grid-cols-2 gap-2">
                <input value={profile.phone ?? ""} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} placeholder="Telefon" className={inp} />
                <input value={profile.email ?? ""} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} placeholder="E-posta" className={inp} />
              </div>
              <textarea value={profile.description ?? ""} onChange={(e) => setProfile((p) => ({ ...p, description: e.target.value }))} rows={3} placeholder="Kısaca ne yapıyorsunuz? (AI metinleri buna dayanır)" className={inp} />
              <button disabled={saving} className="w-full rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                {saving ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </form>
          ) : (
            <div className="space-y-2 p-5">
              <div className="mb-1 text-[11px] text-ink/45">{BIZ_LABEL[biz]}</div>
              <Copy label="Ad" value={profile.name} />
              <Copy label="Site" value={`https://${site}`} />
              <Copy label="Kategori" value={profile.category} />
              <Copy label="Adres" value={profile.address} />
              <Copy label="Telefon" value={profile.phone} />
              <Copy label="E-posta" value={profile.email} />
            </div>
          )}
        </div>

        {/* Hazır metinler */}
        <div className="rounded-2xl border border-border bg-panel">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
            <div>
              <div className="text-sm font-bold">Kayıt metinleri</div>
              <div className="text-[11px] text-ink/45">Formlara kopyala-yapıştır · bilgi bankana dayanır, uydurmaz</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-border p-0.5 text-[11px] font-semibold">
                {(["tr", "en"] as const).map((l) => (
                  <button key={l} type="button" onClick={() => setLang(l)} className={`rounded-md px-2 py-0.5 ${lang === l ? "bg-ink text-white" : "text-ink/55"}`}>
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
              <button type="button" onClick={writeTexts} disabled={writing || !profile.name} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
                {writing ? "Yazılıyor…" : t ? "✦ Yeniden yaz" : "✦ Metinleri yaz"}
              </button>
            </div>
          </div>
          <div className="space-y-2 p-5">
            {t ? (
              <>
                <Copy label="Slogan" value={t.tagline?.[lang]} />
                <Copy label="Kısa" value={t.short?.[lang]} />
                <Copy label="Uzun" value={t.long?.[lang]} />
                <Copy label="Kategoriler" value={t.categories?.join(", ")} />
                <Copy label="Kelimeler" value={t.keywords?.join(", ")} />
                {t.demo && <p className="text-[11px] text-warn">Demo modu: AI bağlı olmadığı için girdiğin açıklamadan basit metinler oluşturuldu.</p>}
              </>
            ) : (
              <p className="py-6 text-center text-sm text-ink/45">{profile.name ? "\"Metinleri yaz\" ile slogan, kısa ve uzun açıklama hazırlansın (1 içerik kotası)." : "Önce işletme bilgilerini kaydet."}</p>
            )}
          </div>
        </div>
      </div>

      {/* Kayıt listesi */}
      <div className="overflow-hidden rounded-2xl border border-border bg-panel">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
          <div className="mr-auto">
            <div className="text-sm font-bold">Kayıt listesi</div>
            <div className="text-[11px] text-ink/45">{showAll ? "Tüm kayıtlar" : `${BIZ_LABEL[biz]} için önerilenler`}</div>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-ink/60">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="accent-[#5d16ff]" />
            Tümünü göster
          </label>
          <button type="button" onClick={() => checkAll()} disabled={checking} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50">
            {checking ? "Kontrol ediliyor…" : "Linkleri kontrol et"}
          </button>
        </div>
        {groups.map(([g, items]) => (
          <div key={g}>
            <div className="border-b border-border bg-muted/40 px-5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-ink/45">{GROUP_LABEL[g]}</div>
            <ul className="divide-y divide-border">
              {items.map((d) => {
                const r = rows[d.id];
                const st = r?.status ?? "todo";
                return (
                  <li key={d.id} className={`grid gap-3 px-5 py-3 md:grid-cols-[1.4fr_1fr_auto] md:items-center ${st === "skip" ? "opacity-50" : ""}`}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`https://www.google.com/s2/favicons?domain=${new URL(d.url).hostname}&sz=32`} alt="" className="h-4 w-4 rounded" />
                        <span className="text-sm font-semibold">{d.name}</span>
                        <span className={`rounded px-1.5 py-px text-[10px] font-bold ${d.priority === 3 ? "bg-accent/10 text-accent" : "bg-muted text-ink/50"}`}>{PRIO[d.priority]}</span>
                        {!d.link && <span className="rounded bg-muted px-1.5 py-px text-[10px] text-ink/45">link vermez</span>}
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-ink/55">{d.why}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        defaultValue={r?.listingUrl ?? ""}
                        onBlur={(e) => e.target.value.trim() !== (r?.listingUrl ?? "") && update(d.id, { listingUrl: e.target.value.trim(), ...(e.target.value.trim() && st === "todo" ? { status: "sent" } : {}) })}
                        placeholder="Profil adresin (yayınlanınca)"
                        className="min-w-0 flex-1 rounded-lg border border-border bg-muted px-2.5 py-1.5 text-xs outline-none focus:border-accent"
                      />
                      {r?.linkFound === true && <span title="Profilde site linki bulundu" className="text-xs font-bold text-seo">✓ link</span>}
                      {r?.linkFound === false && <span title="Profilde site linki bulunamadı" className="text-xs font-bold text-danger">link yok</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <select value={st} onChange={(e) => update(d.id, { status: e.target.value })} className={`rounded-lg border-0 px-2 py-1.5 text-[11px] font-semibold ${STATUS[st][1]}`}>
                        {Object.entries(STATUS).map(([k, [l]]) => (
                          <option key={k} value={k}>
                            {l}
                          </option>
                        ))}
                      </select>
                      <a href={d.url} target="_blank" rel="noreferrer" className="whitespace-nowrap rounded-lg bg-ink px-3 py-1.5 text-[11px] font-bold text-white hover:opacity-90">
                        Kayda git ↗
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-ink/40">
        Formlar otomatik doldurulmaz: kayıt sitelerinin çoğu bot korumalıdır ve otomatik kayıt spam sayılabilir. Metinleri kopyalayıp kendin yapıştırırsın; profil adresini girince sistem linkin gerçekten durup durmadığını kontrol eder. Liste fikri: backlink-pilot (MIT).
      </p>
    </div>
  );
}
