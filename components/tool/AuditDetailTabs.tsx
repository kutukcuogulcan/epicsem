"use client";

import { useEffect, useMemo, useState } from "react";
import type { BulkImportResult } from "@/types";
import { ISSUE_LABEL, ISSUE_SEVERITY, SEVERITY_LABEL } from "@/lib/bulk-labels";
import { short } from "./PageRow";

const PAGE = 200;

function StatusPill({ code }: { code: number | null | undefined }) {
  if (code === undefined || code === null) return <span className="text-xs text-ink/30">—</span>;
  const cls = code === 0 || code >= 400 ? "bg-danger/10 text-danger" : code >= 300 ? "bg-warn/10 text-warn" : code === -1 ? "bg-danger/10 text-danger" : "bg-seo/10 text-seo";
  return <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${cls}`}>{code === 0 ? "hata" : code === -1 ? "döngü" : code}</span>;
}

function Toolbar({ children, count }: { children: React.ReactNode; count: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
      {children}
      <span className="ml-auto text-xs text-ink/40">{count} satır</span>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-full border px-3 py-1 text-xs font-semibold ${on ? "border-ink bg-ink text-white" : "border-border text-ink/60 hover:border-ink/30"}`}>
      {children}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="px-5 py-10 text-center text-sm text-ink/45">{text}</div>;
}

/* ------------------------------ Linkler ------------------------------ */
export function LinksTab({ result }: { result: BulkImportResult }) {
  const [f, setF] = useState<"all" | "internal" | "external" | "broken" | "nofollow" | "anchor">("all");
  const [q, setQ] = useState("");
  const status = useMemo(() => new Map(result.rows.map((r) => [r.url, r.statusCode])), [result.rows]);
  const ext = result.assets?.externalLinks ?? {};
  const all = useMemo(
    () =>
      result.rows.flatMap((r) =>
        (r.metrics?.outLinks ?? []).map((l) => ({ from: r.url, ...l, code: l.external ? ext[l.to] : status.get(l.to) }))
      ),
    [result.rows, ext, status]
  );
  const GENERIC = /^(tıkla(yın|yınız)?|buraya tıkla(yın)?|burada|buraya|devamı|devamını oku|daha fazla|detay(lar)?|incele|click here|here|read more|more|learn more|link)$/i;
  const list = all.filter((l) => {
    if (f === "internal" && l.external) return false;
    if (f === "external" && !l.external) return false;
    if (f === "broken" && !(l.code !== undefined && l.code !== null && (l.code >= 400 || l.code === 0))) return false;
    if (f === "nofollow" && !l.nofollow) return false;
    if (f === "anchor" && (l.external || (l.anchor && !GENERIC.test(l.anchor.trim())))) return false;
    if (q && !`${l.from} ${l.to} ${l.anchor}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  if (!all.length) return <Empty text="Bu taramada link listesi yok — siteyi yeniden tarayınca dolacak." />;
  const brokenN = all.filter((l) => l.code !== undefined && l.code !== null && (l.code >= 400 || l.code === 0)).length;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-panel">
      <Toolbar count={list.length}>
        <Chip on={f === "all"} onClick={() => setF("all")}>Tümü</Chip>
        <Chip on={f === "internal"} onClick={() => setF("internal")}>İç</Chip>
        <Chip on={f === "external"} onClick={() => setF("external")}>Dış</Chip>
        <Chip on={f === "broken"} onClick={() => setF("broken")}>Kırık · {brokenN}</Chip>
        <Chip on={f === "nofollow"} onClick={() => setF("nofollow")}>Nofollow</Chip>
        <Chip on={f === "anchor"} onClick={() => setF("anchor")}>Boş/anlamsız metin</Chip>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ara…" className="w-44 rounded-lg border border-border px-3 py-1 text-xs outline-none focus:border-accent" />
      </Toolbar>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink/45">
              <th className="px-5 py-2.5 font-medium">Kaynak sayfa</th>
              <th className="py-2.5 pr-3 font-medium">Hedef</th>
              <th className="py-2.5 pr-3 font-medium">Link metni</th>
              <th className="py-2.5 pr-3 font-medium">Tür</th>
              <th className="py-2.5 pr-5 font-medium">Hedef durumu</th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, PAGE).map((l, i) => (
              <tr key={i} className="border-t border-border">
                <td className="max-w-[14rem] truncate px-5 py-2 text-ink/60" title={l.from}>{short(l.from)}</td>
                <td className="max-w-[16rem] truncate py-2 pr-3 font-medium" title={l.to}>
                  <a href={l.to} target="_blank" rel="noreferrer" className="hover:text-accent">{short(l.to)}</a>
                </td>
                <td className="max-w-[12rem] truncate py-2 pr-3">{l.anchor ? <span className="text-ink/70">{l.anchor}</span> : <span className="text-warn">boş</span>}</td>
                <td className="py-2 pr-3 text-xs">
                  <span className="text-ink/55">{l.external ? "Dış" : "İç"}</span>
                  {l.nofollow && <span className="ml-1 rounded bg-muted px-1 text-[10px] font-semibold text-ink/60">nofollow</span>}
                </td>
                <td className="py-2 pr-5"><StatusPill code={l.code} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.length > PAGE && <p className="border-t border-border px-5 py-2 text-xs text-ink/40">İlk {PAGE} satır gösteriliyor — filtreyi daraltın.</p>}
    </div>
  );
}

/* ------------------------------ Görseller ------------------------------ */
export function ImagesTab({ result }: { result: BulkImportResult }) {
  const [f, setF] = useState<"all" | "broken" | "large" | "noalt" | "nosize">("all");
  const info = result.assets?.images ?? {};
  const rows = useMemo(() => {
    const m = new Map<string, { src: string; pages: Set<string>; alt: string | null; hasSize: boolean }>();
    for (const r of result.rows)
      for (const im of r.metrics?.images ?? []) {
        const e = m.get(im.src) ?? { src: im.src, pages: new Set<string>(), alt: im.alt, hasSize: im.hasSize };
        e.pages.add(r.url);
        if (im.alt === null) e.alt = null;
        if (!im.hasSize) e.hasSize = false;
        m.set(im.src, e);
      }
    return [...m.values()].map((e) => ({ ...e, status: info[e.src]?.status, kb: info[e.src]?.kb ?? null })).sort((a, b) => (b.kb ?? 0) - (a.kb ?? 0));
  }, [result.rows, info]);
  const list = rows.filter((r) =>
    f === "broken" ? r.status !== undefined && (r.status >= 400 || r.status === 0) : f === "large" ? (r.kb ?? 0) > 100 : f === "noalt" ? r.alt === null : f === "nosize" ? !r.hasSize : true
  );
  if (!rows.length) return <Empty text="Bu taramada görsel listesi yok — siteyi yeniden tarayınca dolacak." />;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-panel">
      <Toolbar count={list.length}>
        <Chip on={f === "all"} onClick={() => setF("all")}>Tümü · {rows.length}</Chip>
        <Chip on={f === "broken"} onClick={() => setF("broken")}>Kırık</Chip>
        <Chip on={f === "large"} onClick={() => setF("large")}>100 KB+</Chip>
        <Chip on={f === "noalt"} onClick={() => setF("noalt")}>Alt metni yok</Chip>
        <Chip on={f === "nosize"} onClick={() => setF("nosize")}>Boyutsuz</Chip>
      </Toolbar>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink/45">
              <th className="px-5 py-2.5 font-medium">Görsel</th>
              <th className="py-2.5 pr-3 font-medium">Durum</th>
              <th className="py-2.5 pr-3 font-medium">Boyut</th>
              <th className="py-2.5 pr-3 font-medium">Alt metni</th>
              <th className="py-2.5 pr-5 font-medium">Sayfa</th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, PAGE).map((r) => (
              <tr key={r.src} className="border-t border-border">
                <td className="px-5 py-2">
                  <span className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.src} alt="" loading="lazy" className="h-8 w-8 shrink-0 rounded border border-border object-cover" />
                    <a href={r.src} target="_blank" rel="noreferrer" className="max-w-[16rem] truncate font-medium hover:text-accent" title={r.src}>{r.src.split("/").pop()}</a>
                  </span>
                </td>
                <td className="py-2 pr-3"><StatusPill code={r.status} /></td>
                <td className={`py-2 pr-3 tabular-nums ${(r.kb ?? 0) > 100 ? "font-bold text-warn" : "text-ink/60"}`}>{r.kb != null ? `${r.kb} KB` : "—"}</td>
                <td className="max-w-[14rem] truncate py-2 pr-3">{r.alt === null ? <span className="text-warn">yok</span> : r.alt === "" ? <span className="text-ink/40">boş (dekoratif)</span> : <span className="text-ink/70">{r.alt}</span>}</td>
                <td className="py-2 pr-5 tabular-nums text-ink/60">{r.pages.size}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------ Yönlendirmeler ------------------------------ */
export function RedirectsTab({ result }: { result: BulkImportResult }) {
  const list = result.rows.filter((r) => r.statusCode !== null && r.statusCode >= 300 && r.statusCode < 400);
  if (!list.length) return <Empty text="Bu taramada yönlendirme bulunmadı." />;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-panel">
      <Toolbar count={list.length}>
        <span className="text-sm font-bold">Yönlendirme zincirleri</span>
      </Toolbar>
      <div className="divide-y divide-border">
        {list.slice(0, PAGE).map((r) => {
          const hops = r.metrics?.redirectHops ?? [{ url: r.url, status: r.statusCode! }, ...(r.metrics?.redirectTarget ? [{ url: r.metrics.redirectTarget, status: 0 }] : [])];
          const bad = hops.length > 2 || hops.some((h) => h.status === -1 || h.status >= 400);
          return (
            <div key={r.url} className="flex flex-wrap items-center gap-2 px-5 py-3 text-sm">
              {hops.map((h, i) => (
                <span key={i} className="flex items-center gap-2">
                  {i > 0 && <span className="text-ink/30">→</span>}
                  <span className="max-w-[18rem] truncate font-medium" title={h.url}>{short(h.url)}</span>
                  {!(i === hops.length - 1 && h.status === 0 && !r.metrics?.redirectHops) && <StatusPill code={h.status} />}
                </span>
              ))}
              {bad && <span className="ml-auto rounded bg-danger/10 px-2 py-0.5 text-[11px] font-bold text-danger">{hops.some((h) => h.status === -1) ? "Döngü" : hops.length > 2 ? `${hops.length - 1} adım` : "Kırık hedef"}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------ Karşılaştırma ------------------------------ */
export function CompareTab({ result, prevId, prevLabel }: { result: BulkImportResult; prevId: number | null; prevLabel: string | null }) {
  const [prev, setPrev] = useState<BulkImportResult | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (prevId == null) return;
    setPrev(null);
    fetch(`/api/import/runs?id=${prevId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setPrev)
      .catch(() => setErr(true));
  }, [prevId]);

  const diff = useMemo(() => {
    if (!prev) return null;
    const key = (code: string, url: string) => `${code}\u0000${url}`;
    const now = new Set(result.rows.flatMap((r) => r.issues.map((c) => key(c, r.url))));
    const before = new Set(prev.rows.flatMap((r) => r.issues.map((c) => key(c, r.url))));
    const group = (keys: string[]) => {
      const m = new Map<string, string[]>();
      for (const k of keys) {
        const [c, u] = k.split("\u0000");
        m.set(c, [...(m.get(c) ?? []), u]);
      }
      return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
    };
    const added = [...now].filter((k) => !before.has(k));
    const fixed = [...before].filter((k) => !now.has(k));
    const nowUrls = new Set(result.rows.map((r) => r.url));
    const prevUrls = new Set(prev.rows.map((r) => r.url));
    return {
      added: group(added),
      fixed: group(fixed),
      addedN: added.length,
      fixedN: fixed.length,
      newPages: [...nowUrls].filter((u) => !prevUrls.has(u)).length,
      gonePages: [...prevUrls].filter((u) => !nowUrls.has(u)).length,
      healthNow: result.summary.healthScore ?? null,
      healthPrev: prev.summary.healthScore ?? null,
    };
  }, [prev, result]);

  if (prevId == null) return <Empty text="Karşılaştırmak için aynı siteyi en az iki kez tarayın." />;
  if (err) return <Empty text="Önceki tarama yüklenemedi." />;
  if (!diff) return <div className="h-40 animate-pulse rounded-2xl bg-muted" />;

  const Col = ({ title, tone, items, n }: { title: string; tone: "danger" | "seo"; items: [string, string[]][]; n: number }) => (
    <div className="rounded-2xl border border-border bg-panel">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <span className="text-sm font-bold">{title}</span>
        <span className={`text-lg font-extrabold tabular-nums ${tone === "danger" ? "text-danger" : "text-seo"}`}>{n}</span>
      </div>
      {items.length === 0 ? (
        <div className="px-5 py-6 text-sm text-ink/45">Yok.</div>
      ) : (
        <div className="divide-y divide-border">
          {items.map(([code, urls]) => (
            <details key={code} className="group px-5 py-2.5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  <span className="text-ink/30 group-open:rotate-90">▸</span>
                  {ISSUE_LABEL[code] ?? code}
                  <span className="text-[10px] font-bold text-ink/40">{SEVERITY_LABEL[ISSUE_SEVERITY[code] ?? "notice"]}</span>
                </span>
                <span className="font-bold tabular-nums">{urls.length}</span>
              </summary>
              <div className="mt-1.5 space-y-0.5 pl-5">
                {urls.slice(0, 12).map((u) => (
                  <div key={u} className="truncate text-xs text-ink/55">{short(u)}</div>
                ))}
                {urls.length > 12 && <div className="text-xs text-ink/40">+{urls.length - 12} sayfa</div>}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { l: "Sağlık skoru", v: `${diff.healthPrev ?? "—"} → ${diff.healthNow ?? "—"}` },
          { l: "Düzelen sorun", v: diff.fixedN, c: "text-seo" },
          { l: "Yeni sorun", v: diff.addedN, c: "text-danger" },
          { l: "Yeni / kaybolan sayfa", v: `+${diff.newPages} / −${diff.gonePages}` },
        ].map((x) => (
          <div key={x.l} className="rounded-2xl border border-border bg-panel p-4">
            <div className="text-xs text-ink/50">{x.l}</div>
            <div className={`mt-1 text-xl font-extrabold tabular-nums ${x.c ?? ""}`}>{x.v}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-ink/45">Karşılaştırılan: {prevLabel}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Col title="Düzelen sorunlar" tone="seo" items={diff.fixed} n={diff.fixedN} />
        <Col title="Yeni çıkan sorunlar" tone="danger" items={diff.added} n={diff.addedN} />
      </div>
    </div>
  );
}

/* ------------------------------ Kopya içerik kartı ------------------------------ */
export function DuplicateGroups({ result }: { result: BulkImportResult }) {
  const groups = result.assets?.duplicateGroups ?? [];
  if (!groups.length) return null;
  return (
    <div className="rounded-2xl border border-border bg-panel">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <span className="text-sm font-bold">Neredeyse aynı içerikli sayfalar</span>
        <span className="text-xs text-ink/40">{groups.length} grup · metin benzerliği %85+</span>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-2">
        {groups.slice(0, 8).map((g, i) => (
          <div key={i} className="rounded-xl border border-border p-3">
            <div className="text-[11px] font-bold text-warn">Grup {i + 1} · {g.length} sayfa</div>
            {g.slice(0, 5).map((u) => (
              <div key={u} className="truncate text-xs text-ink/65">{short(u)}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
