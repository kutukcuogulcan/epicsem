"use client";

import { useEffect, useRef, useState } from "react";
import { useProject, type Project } from "./ProjectProvider";
import { Drawer } from "./ui";

/** Sol menünün altındaki proje seçici (Arvow "Website & Brand"). */
export default function ProjectSwitcher() {
  const { project, projects, suggestions, ready, select, error } = useProject();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<null | { id?: number; name: string; domain: string; competitors: { name: string; domain: string }[] }>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const fav = (d: string) => `https://www.google.com/s2/favicons?domain=${d}&sz=32`;
  const startNew = (domain = "") => {
    const label = domain.split(".")[0] ?? "";
    setForm({ name: label ? label.charAt(0).toLocaleUpperCase("tr") + label.slice(1) : "", domain, competitors: [] });
    setOpen(false);
  };
  const startEdit = (p: Project) => {
    setForm({ id: p.id, name: p.name, domain: p.domain, competitors: p.competitors });
    setOpen(false);
  };

  async function choose(id: number) {
    setBusy(true);
    try {
      await select(id);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <div className="px-2 pb-1 text-[12px] font-medium text-ink/45">Proje</div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-panel px-2.5 py-2 text-left text-[13px] hover:bg-muted/60"
      >
        {project ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fav(project.domain)} alt="" className="h-4 w-4 shrink-0 rounded" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-ink">{project.name}</span>
              <span className="block truncate text-[11px] text-slate-500">{project.domain}</span>
            </span>
          </>
        ) : (
          <span className="flex-1 text-slate-500">{ready ? "Proje seç" : "Yükleniyor…"}</span>
        )}
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="shrink-0 text-ink/40">
          <path d="M3 4.5l3-3 3 3M3 7.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 right-0 z-40 mb-2 max-h-80 overflow-y-auto rounded-xl border border-border bg-panel p-1.5 shadow-lg">
          {error && <div className="px-2 py-1.5 text-xs text-danger">{error}</div>}
          {projects.map((p) => (
            <div key={p.id} className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] ${project?.id === p.id ? "bg-muted" : "hover:bg-muted/60"}`}>
              <button type="button" disabled={busy} onClick={() => choose(p.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fav(p.domain)} alt="" className="h-4 w-4 shrink-0 rounded" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block truncate text-[11px] text-slate-500">{p.domain}</span>
                </span>
              </button>
              {project?.id === p.id && <span className="text-xs text-accent">✓</span>}
              <button type="button" onClick={() => startEdit(p)} className="hidden rounded px-1 text-[11px] text-slate-500 hover:text-ink group-hover:block">
                Düzenle
              </button>
            </div>
          ))}
          {suggestions.length > 0 && (
            <>
              <div className="px-2 pb-1 pt-2 text-[11px] font-medium text-slate-500">Verisi olan siteler</div>
              {suggestions.map((s) => (
                <button key={s} type="button" onClick={() => startNew(s)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-ink/70 hover:bg-muted/60">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fav(s)} alt="" className="h-4 w-4 shrink-0 rounded opacity-70" />
                  <span className="flex-1 truncate">{s}</span>
                  <span className="text-[11px] text-accent">proje yap</span>
                </button>
              ))}
            </>
          )}
          <button type="button" onClick={() => startNew()} className="mt-1 w-full rounded-lg border-t border-border px-2 py-2 text-left text-[13px] font-semibold text-accent hover:bg-accent/5">
            + Yeni proje
          </button>
        </div>
      )}

      {form && <ProjectForm initial={form} onClose={() => setForm(null)} />}
    </div>
  );
}

function ProjectForm({ initial, onClose }: { initial: { id?: number; name: string; domain: string; competitors: { name: string; domain: string }[] }; onClose: () => void }) {
  const { create, update } = useProject();
  const [name, setName] = useState(initial.name);
  const [domain, setDomain] = useState(initial.domain);
  const [comps, setComps] = useState(initial.competitors.length ? initial.competitors : [{ name: "", domain: "" }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inp = "w-full rounded-lg border border-border bg-panel px-3 py-2 text-sm outline-none focus:border-accent";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const competitors = comps.filter((c) => c.name.trim() && c.domain.trim());
      if (initial.id) await update({ id: initial.id, name, domain, competitors });
      else await create({ name, domain, competitors });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Kaydedilemedi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      isOpen
      onClose={onClose}
      as="form"
      onSubmit={save}
      title={initial.id ? "Projeyi düzenle" : "Yeni proje"}
      subtitle="Seçili proje tüm sayfalarda kullanılır: site, marka adı ve rakipler bir kez girilir."
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">
            Vazgeç
          </button>
          <button disabled={busy || !name.trim() || domain.trim().length < 3} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Kaydediliyor…" : initial.id ? "Kaydet" : "Oluştur ve seç"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-slate-500">Marka adı</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ör. İş Bankası" className={inp} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-slate-500">Site</span>
          <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="ör. isbank.com.tr" className={inp} />
        </label>
        <div className="space-y-2">
          <span className="text-xs font-semibold text-slate-500">Rakipler (GEO ve rakip analizlerinde kullanılır)</span>
          {comps.map((c, i) => (
            <div key={i} className="flex gap-2">
              <input value={c.name} onChange={(e) => setComps((a) => a.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Rakip adı" className={inp} />
              <input value={c.domain} onChange={(e) => setComps((a) => a.map((x, j) => (j === i ? { ...x, domain: e.target.value } : x)))} placeholder="rakip.com" className={inp} />
              <button type="button" onClick={() => setComps((a) => a.filter((_, j) => j !== i))} className="px-1 text-slate-400 hover:text-danger" aria-label="Sil">
                ✕
              </button>
            </div>
          ))}
          {comps.length < 8 && (
            <button type="button" onClick={() => setComps((a) => [...a, { name: "", domain: "" }])} className="text-xs font-semibold text-accent hover:underline">
              + Rakip ekle
            </button>
          )}
        </div>
        {err && <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{err}</div>}
      </div>
    </Drawer>
  );
}
