"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Drawer, ErrorBlock } from "@/components/ui";
import { extractFaq, slugify } from "@/lib/article-post";

interface Conn {
  id: number;
  platform: "wordpress" | "shopify" | "webhook";
  label: string;
  siteUrl: string;
}
type Mode = "draft" | "publish" | "schedule";

const PLATFORM: Record<string, string> = { wordpress: "WordPress", shopify: "Shopify", webhook: "Webhook" };
const pad = (n: number) => String(n).padStart(2, "0");
/** datetime-local için yerel saat biçimi (yarın 10:00 varsayılan). */
function defaultLocal() {
  const d = new Date(Date.now() + 864e5);
  d.setHours(10, 0, 0, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Editördeki "Yayınla" çekmecesi — yazıyı bağlı siteye taslak olarak gönderir, hemen yayınlar
 * ya da ileri tarihe zamanlar. AI kullanmaz, kota harcamaz.
 */
export default function PublishDrawer({
  open,
  onClose,
  draftId,
  title,
  markdown,
  metaDescription,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  draftId: number | null;
  title: string;
  markdown: string;
  metaDescription: string;
  onDone?: (r: { state: string; postUrl: string; editUrl: string }) => void;
}) {
  const [conns, setConns] = useState<Conn[] | null>(null);
  const [connId, setConnId] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("draft");
  const [when, setWhen] = useState(defaultLocal());
  const [toc, setToc] = useState(true);
  const [schema, setSchema] = useState(true);
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<null | { state: string; postUrl: string; editUrl: string; downgraded?: boolean; scheduledAt?: string | null }>(null);

  useEffect(() => {
    if (!open) return;
    setDone(null);
    setErr(null);
    setSlug(slugify(title));
    fetch("/api/cms/connections")
      .then((r) => (r.ok ? r.json() : { connections: [] }))
      .then((d) => {
        setConns(d.connections ?? []);
        if (d.connections?.length) setConnId((c) => c ?? d.connections[0].id);
      })
      .catch(() => setConns([]));
  }, [open, title]);

  const faqCount = useMemo(() => extractFaq(markdown).length, [markdown]);
  const needs = useMemo(() => (markdown.match(/\[NEEDS:[^\]]*\]/gi) ?? []).length, [markdown]);
  const h2 = useMemo(() => (markdown.match(/^##\s+/gm) ?? []).length, [markdown]);

  async function submit() {
    if (!draftId || !connId) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/content/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId, connectionId: connId, mode, scheduleAt: mode === "schedule" ? new Date(when).toISOString() : undefined, toc, schema, slug }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Gönderilemedi");
      setDone(d);
      onDone?.(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gönderilemedi");
    } finally {
      setBusy(false);
    }
  }

  const MODES: { v: Mode; t: string; d: string }[] = [
    { v: "draft", t: "Sitede taslak", d: "Sitende taslak olarak durur, son kontrolü sen yaparsın." },
    { v: "publish", t: "Hemen yayınla", d: "Yazı şimdi canlıya çıkar." },
    { v: "schedule", t: "Zamanla", d: "Seçtiğin tarih ve saatte site kendisi yayınlar." },
  ];

  const btn = mode === "publish" ? "Şimdi yayınla" : mode === "schedule" ? "Zamanla" : "Taslak olarak gönder";

  return (
    <Drawer
      isOpen={open}
      onClose={onClose}
      eyebrow="Yayın"
      title="Sitene gönder"
      subtitle={title || "Başlıksız yazı"}
      size="md"
      footer={
        !done && conns && conns.length > 0 ? (
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="h-8 rounded-[10px] px-3 text-sm font-medium text-sub hover:bg-muted">
              Vazgeç
            </button>
            <button type="button" onClick={submit} disabled={busy || !connId || !draftId} className="h-8 rounded-[10px] bg-accent px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {busy ? "Gönderiliyor…" : btn}
            </button>
          </div>
        ) : null
      }
    >
      {conns === null ? (
        <div className="text-sm text-sub">Bağlantılar yükleniyor…</div>
      ) : conns.length === 0 ? (
        <div className="space-y-3 text-sm">
          <p className="text-sub">Henüz bağlı bir site yok. WordPress, Shopify ya da webhook bağlantısı ekleyince yazıları buradan tek tıkla gönderebilirsin.</p>
          <Link href="/content" className="inline-flex h-8 items-center rounded-[10px] bg-accent px-3 text-sm font-medium text-white">
            Site bağla →
          </Link>
        </div>
      ) : done ? (
        <div className="space-y-3 text-sm">
          <div className="rounded-xl border border-seo/30 bg-seo/5 px-4 py-3">
            <div className="font-medium text-seo">
              {done.state === "published" ? "Yayınlandı ✓" : done.state === "scheduled" ? "Zamanlandı ✓" : "Sitene taslak olarak gönderildi ✓"}
            </div>
            {done.state === "scheduled" && done.scheduledAt && <div className="mt-0.5 text-sub">{new Date(done.scheduledAt).toLocaleString("tr-TR", { dateStyle: "long", timeStyle: "short" })} tarihinde yayına girecek.</div>}
          </div>
          {done.downgraded && (
            <div className="rounded-xl border border-warn/30 bg-warn/5 px-4 py-3 text-sub">
              Yazıda doldurulmamış <code>[NEEDS: …]</code> alanı olduğu için canlıya çıkarılmadı, taslak olarak gönderildi. Bu alanları doldurup tekrar gönderebilirsin.
            </div>
          )}
          <div className="flex gap-3">
            {done.postUrl && (
              <a href={done.postUrl} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
                Yazıyı aç ↗
              </a>
            )}
            {done.editUrl && done.editUrl !== done.postUrl && (
              <a href={done.editUrl} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
                Sitede düzenle ↗
              </a>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-5 text-sm">
          <label className="block">
            <span className="font-medium">Site</span>
            <select value={connId ?? ""} onChange={(e) => setConnId(Number(e.target.value))} className="mt-1.5 w-full rounded-[10px] border border-border bg-panel px-3 py-2 outline-none">
              {conns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label || c.siteUrl} · {PLATFORM[c.platform] ?? c.platform}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="font-medium">Nasıl gönderilsin?</span>
            <div className="mt-1.5 space-y-2">
              {MODES.map((m) => (
                <button
                  key={m.v}
                  type="button"
                  onClick={() => setMode(m.v)}
                  className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left ${mode === m.v ? "border-[#BDB4FF] bg-accent/5 ring-1 ring-[#BDB4FF]" : "border-border hover:bg-muted/50"}`}
                >
                  <span className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border ${mode === m.v ? "border-[5px] border-accent" : "border-[#D5D7DA]"}`} />
                  <span>
                    <span className="block font-medium">{m.t}</span>
                    <span className="block text-xs text-sub">{m.d}</span>
                  </span>
                </button>
              ))}
            </div>
            {mode === "schedule" && (
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="mt-2 w-full rounded-[10px] border border-border bg-panel px-3 py-2 outline-none" />
            )}
            {mode !== "draft" && needs > 0 && (
              <p className="mt-2 rounded-lg bg-warn/10 px-3 py-2 text-xs text-ink/70">
                Yazıda {needs} doldurulmamış <code>[NEEDS: …]</code> alanı var. Bunlar doldurulmadan yazı canlıya çıkmaz, taslak olarak gönderilir.
              </p>
            )}
          </div>

          <label className="block">
            <span className="font-medium">URL kısa adı</span>
            <div className="mt-1.5 flex items-center rounded-[10px] border border-border bg-panel px-3">
              <span className="text-sub">/</span>
              <input value={slug} onChange={(e) => setSlug(e.target.value)} className="flex-1 bg-transparent py-2 outline-none" />
            </div>
          </label>

          <div className="space-y-2">
            <span className="font-medium">Yayın öncesi eklenecekler</span>
            <label className="flex items-start gap-2.5">
              <input type="checkbox" checked={toc} onChange={(e) => setToc(e.target.checked)} className="mt-0.5 accent-[#4F00FF]" />
              <span>
                İçindekiler listesi
                <span className="block text-xs text-sub">{h2 >= 3 ? `${h2} başlıktan otomatik oluşturulur.` : "En az 3 ana başlık olunca eklenir."}</span>
              </span>
            </label>
            <label className="flex items-start gap-2.5">
              <input type="checkbox" checked={schema} onChange={(e) => setSchema(e.target.checked)} className="mt-0.5 accent-[#4F00FF]" />
              <span>
                Şema (makale{faqCount >= 2 ? ` + ${faqCount} soruluk SSS` : ""})
                <span className="block text-xs text-sub">Google ve AI motorlarının yazıyı doğru anlaması için. WordPress&apos;te Epicsem Connector eklentisi gerekir.</span>
              </span>
            </label>
            <div className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-sub">
              Meta açıklama: {metaDescription ? <span className="text-ink/70">{metaDescription}</span> : <span className="text-warn">boş — sağ paneldeki SEO bölümünden ekle</span>}
            </div>
          </div>

          <ErrorBlock message={err} />
        </div>
      )}
    </Drawer>
  );
}
