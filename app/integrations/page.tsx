"use client";

import { useEffect, useState } from "react";
import ToolPageHeader from "@/components/ToolPageHeader";
import { PROVIDERS, type ProviderDef, type ProviderId } from "@/lib/integration-providers";
import PageGuide from "@/components/PageGuide";

interface Row {
  provider: string;
  config: Record<string, string>;
  secretsMasked: Record<string, string>;
  updatedAt: string;
}

const GROUPS: { title: string; ids: ProviderId[] }[] = [
  { title: "Arama verisi", ids: ["serpapi", "google_ads", "serpbear"] },
  { title: "İndeksleme ve backlink", ids: ["indexnow", "bing", "ahrefs"] },
  { title: "Performans ve görsel", ids: ["google_psi", "ogimg"] },
];

const LOGO: Record<ProviderId, { bg: string; t: string }> = {
  serpapi: { bg: "bg-[#0f9d58]", t: "S" },
  google_ads: { bg: "bg-[#4285f4]", t: "G" },
  serpbear: { bg: "bg-[#7c5cff]", t: "SB" },
  indexnow: { bg: "bg-[#0a7aff]", t: "IN" },
  bing: { bg: "bg-[#008373]", t: "B" },
  google_psi: { bg: "bg-[#f4b400]", t: "PS" },
  ogimg: { bg: "bg-[#ec4899]", t: "OG" },
  ahrefs: { bg: "bg-[#ff8800]", t: "A" },
};

export default function IntegrationsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [envSerp, setEnvSerp] = useState(false);
  const [sharedDemo, setSharedDemo] = useState(false);
  const [open, setOpen] = useState<ProviderDef | null>(null);

  async function refresh() {
    const r = await fetch("/api/integrations");
    if (r.status === 401) {
      window.location.href = "/login?next=/integrations";
      return;
    }
    const d = await r.json();
    setRows(d.integrations ?? []);
    setEnvSerp(!!d.envSerpApi);
    setSharedDemo(!!d.sharedDemo);
  }
  useEffect(() => {
    refresh();
  }, []);

  const rowOf = (id: string) => rows?.find((r) => r.provider === id);
  const connected = (rows ?? []).filter((r) => r.config._status === "ok").length;

  return (
    <div className="space-y-8">
      <ToolPageHeader
        breadcrumbLabel="Entegrasyonlar"
        title="Entegrasyonlar"
        body="Kendi hesaplarını bağla; veriler doğrudan o servisten gelir. Hiçbiri zorunlu değil — bağlı olmayanlarda Epicsem'in ücretsiz yerleşik yöntemi çalışır."
      />

      {sharedDemo && (
        <div className="rounded-2xl border border-warn/30 bg-warn/5 p-4 text-sm leading-6 text-ink/70">
          <strong>Ortak demo hesabındasın.</strong> Girişsiz ziyaretçiler aynı demo hesabını paylaştığı için burada anahtar kaydedilemez. Kendi servislerini bağlamak için{" "}
          <a href="/login?next=/integrations" className="font-semibold text-accent">kendi hesabınla giriş yap</a>.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Bağlı servis", `${connected} / ${PROVIDERS.length}`],
          ["Ücretsiz kullanılabilen", String(PROVIDERS.length)],
          ["Hata veren", String((rows ?? []).filter((r) => r.config._status === "error").length)],
          ["Son güncelleme", rows?.length ? new Date(rows.map((r) => r.updatedAt).sort().pop()!).toLocaleDateString("tr-TR") : "—"],
        ].map(([l, v]) => (
          <div key={l} className="rounded-xl border border-border bg-panel shadow-sm p-4">
            <div className="text-[11px] text-ink/50">{l}</div>
            <div className="text-2xl font-semibold tabular-nums">{v}</div>
          </div>
        ))}
      </div>

      {GROUPS.map((g) => (
        <section key={g.title} className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink/45">{g.title}</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {g.ids.map((id) => {
              const p = PROVIDERS.find((x) => x.id === id)!;
              const r = rowOf(id);
              const status = r?.config._status;
              const viaEnv = id === "serpapi" && !r && envSerp;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setOpen(p)}
                  className="group flex flex-col gap-3 rounded-xl border border-border bg-panel shadow-sm p-5 text-left transition hover:border-accent/40 hover:shadow-[0_8px_30px_-12px_rgba(93,22,255,0.25)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl text-xs font-semibold text-white ${LOGO[id].bg}`}>{LOGO[id].t}</div>
                      <div>
                        <div className="font-bold">{p.name}</div>
                        <div className="text-[11px] text-ink/50">{p.price}</div>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                        status === "ok" || viaEnv ? "bg-seo/10 text-seo" : status === "error" ? "bg-danger/10 text-danger" : "bg-muted text-ink/50"
                      }`}
                    >
                      {status === "ok" ? "Bağlı" : viaEnv ? "Sistem anahtarı" : status === "error" ? "Hata" : "Bağlı değil"}
                    </span>
                  </div>
                  <p className="text-sm leading-6 text-ink/60">{p.tagline}</p>
                  {r?.config._message && <p className={`text-[11px] ${status === "ok" ? "text-seo" : "text-danger"}`}>{r.config._message}</p>}
                  <div className="mt-auto flex flex-wrap gap-1.5">
                    {p.usedIn.map((u) => (
                      <span key={u} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-ink/55">
                        {u}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <p className="text-[11px] text-ink/45">
        Anahtarlar şifreli bağlantı üzerinden sunucuda saklanır ve sana yalnızca son 4 hanesi gösterilir. Anahtarlarını kimseyle paylaşma; gerektiğinde servisin kendi panelinden yenileyebilirsin.
      </p>

      {open && <ProviderDrawer p={open} row={rowOf(open.id)} onClose={() => setOpen(null)} onSaved={refresh} />}

      <PageGuide id="integrations" />
    </div>
  );
}

function ProviderDrawer({ p, row, onClose, onSaved }: { p: ProviderDef; row?: Row; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(p.fields.filter((f) => !f.secret).map((f) => [f.key, row?.config[f.key] ?? ""])));
  const [secs, setSecs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setRes(null);
    try {
      const r = await fetch("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: p.id, config: vals, secrets: secs }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Kaydedilemedi");
      setRes({ ok: d.ok, text: d.message });
      setSecs({});
      await onSaved();
    } catch (err) {
      setRes({ ok: false, text: err instanceof Error ? err.message : "Kaydedilemedi" });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    await fetch(`/api/integrations?provider=${p.id}`, { method: "DELETE" });
    await onSaved();
    setBusy(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Kapat" onClick={onClose} className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" />
      <form onSubmit={save} className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-panel shadow-2xl animate-[pop-in_0.25s_ease-out]">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Entegrasyon</div>
            <div className="font-bold">{p.name}</div>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-ink/50 hover:bg-muted">
            ✕
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <p className="text-sm leading-6 text-ink/65">{p.tagline}</p>
          <ol className="space-y-2 rounded-xl bg-muted/60 p-4 text-[13px] leading-5 text-ink/70">
            {p.steps.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-bold text-accent">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <div className="flex gap-3 text-xs font-semibold">
            <a href={p.signupUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              Hesap / anahtar al ↗
            </a>
            <a href={p.docsUrl} target="_blank" rel="noreferrer" className="text-ink/55 hover:underline">
              Belgeler ↗
            </a>
          </div>
          {p.fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wide text-ink/45">
                {f.label}
                {f.optional && <span className="ml-1 normal-case font-medium text-ink/35">(isteğe bağlı)</span>}
              </label>
              {f.secret ? (
                <input
                  type="password"
                  autoComplete="off"
                  value={secs[f.key] ?? ""}
                  onChange={(e) => setSecs((s) => ({ ...s, [f.key]: e.target.value }))}
                  placeholder={row?.secretsMasked[f.key] ? `Kayıtlı: ${row.secretsMasked[f.key]} — değiştirmek için yaz` : f.placeholder}
                  className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm outline-none focus:border-accent"
                />
              ) : (
                <input
                  value={vals[f.key] ?? ""}
                  onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm outline-none focus:border-accent"
                />
              )}
              {f.help && <p className="text-[11px] leading-4 text-ink/45">{f.help}</p>}
            </div>
          ))}
          {p.id === "indexnow" && row?.config.key && row.config.siteUrl && (
            <div className="rounded-xl border border-accent/20 bg-accent/5 p-3 text-[12px] leading-5 text-ink/70">
              Sitene şu dosyayı koy: <code className="break-all font-semibold">{row.config.siteUrl.replace(/\/+$/, "")}/{row.config.key}.txt</code>
              <br />
              İçeriği: <code className="break-all font-semibold">{row.config.key}</code>
              <a
                className="mt-1 block font-semibold text-accent hover:underline"
                href={`data:text/plain;charset=utf-8,${encodeURIComponent(row.config.key)}`}
                download={`${row.config.key}.txt`}
              >
                Dosyayı indir
              </a>
            </div>
          )}
          {res && <div className={`rounded-xl px-4 py-2.5 text-sm ${res.ok ? "bg-seo/5 text-seo" : "bg-danger/5 text-danger"}`}>{res.text}</div>}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border px-6 py-4">
          {row ? (
            <button type="button" onClick={remove} disabled={busy} className="text-sm font-semibold text-danger/70 hover:text-danger disabled:opacity-40">
              Bağlantıyı kaldır
            </button>
          ) : (
            <span />
          )}
          <button disabled={busy} className="rounded-xl bg-accent px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Test ediliyor…" : "Kaydet ve test et"}
          </button>
        </div>
      </form>
    </div>
  );
}
