"use client";

import Link from "next/link";
import { Drawer, ErrorBlock, PageHeader } from "@/components/ui";
import { publishLabel } from "@/lib/publish-state";

import { useEffect, useState } from "react";
import type { CmsConnection, CmsPlatform, ContentDraft } from "@/types";
import UsageMeter from "@/components/UsageMeter";
import ContentHub from "@/components/ContentHub";

interface DraftListItem {
  id: number;
  sourceUrl: string;
  article: { title: string; demoMode?: boolean };
  status?: ContentDraft["status"];
  publishedPostUrl?: string | null;
  publishState?: string | null;
  scheduledAt?: string | null;
  publishError?: string | null;
  site?: string | null;
  createdAt: string;
}

export default function ContentStudioPage() {
  const [connections, setConnections] = useState<CmsConnection[]>([]);
  const [drafts, setDrafts] = useState<DraftListItem[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [connsLoaded, setConnsLoaded] = useState(false);

  const [connForm, setConnForm] = useState<{ platform: CmsPlatform; label: string; siteUrl: string; authIdentifier: string; authSecret: string }>({
    platform: "wordpress",
    label: "",
    siteUrl: "",
    authIdentifier: "",
    authSecret: "",
  });
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [savingConn, setSavingConn] = useState(false);
  const [connError, setConnError] = useState<string | null>(null);


  function refreshConnections() {
    fetch("/api/cms/connections")
      .then((res) => (res.status === 401 ? { connections: [] } : res.json()))
      .then((data) => setConnections(data.connections ?? []))
      .catch(() => {})
      .finally(() => setConnsLoaded(true));
  }

  function refreshDrafts() {
    fetch("/api/content")
      .then((res) => (res.status === 401 ? { drafts: [] } : res.json()))
      .then((data) => setDrafts(data.drafts ?? []))
      .catch(() => {});
  }

  useEffect(() => {
    // Eski bağlantılar: /content?draftId= → editör
    const id = new URLSearchParams(window.location.search).get("draftId");
    if (id) {
      window.location.replace(`/editor?draftId=${id}`);
      return;
    }
    refreshConnections();
    refreshDrafts();
  }, []);

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    setConnError(null);
    try {
      const res = await fetch("/api/cms/connections/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: connForm.platform,
          siteUrl: connForm.siteUrl,
          authIdentifier: connForm.authIdentifier,
          authSecret: connForm.authSecret,
        }),
      });
      const data = await res.json();
      setTestResult(
        data.ok
          ? { ok: true, message: `${data.siteUserName ?? connForm.authIdentifier ?? connForm.siteUrl} olarak bağlandı.` }
          : { ok: false, message: data.error ?? "Bağlantı başarısız oldu." }
      );
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : "Bağlantı başarısız oldu." });
    } finally {
      setTesting(false);
    }
  }

  async function saveConnection(e: React.FormEvent) {
    e.preventDefault();
    setSavingConn(true);
    setConnError(null);
    try {
      const res = await fetch("/api/cms/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(connForm),
      });
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bağlantı kaydedilemedi");
      setConnForm({ platform: "wordpress", label: "", siteUrl: "", authIdentifier: "", authSecret: "" });
      setTestResult(null);
      setAddOpen(false);
      refreshConnections();
    } catch (err) {
      setConnError(err instanceof Error ? err.message : "Bir şeyler ters gitti");
    } finally {
      setSavingConn(false);
    }
  }

  async function deleteConnection(id: number) {
    await fetch(`/api/cms/connections?id=${id}`, { method: "DELETE" });
    refreshConnections();
  }

  const BTN1 = "inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-accent px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60";
  const BTN2 = "inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-panel px-3 text-sm font-medium text-ink shadow-[inset_0_0_0_1px_#D5D7DA,0_1px_2px_rgba(13,18,28,0.05)] hover:bg-muted disabled:opacity-50";
  const CARD = "rounded-2xl border border-border bg-panel shadow-[0_1px_2px_rgba(13,18,28,0.05)]";
  const INPUT = "h-9 w-full rounded-[10px] border border-border bg-panel px-3 text-sm outline-none focus:border-[#BDB4FF]";
  const chip = (on: boolean) =>
    `inline-flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-[13px] font-medium whitespace-nowrap ${on ? "bg-accent/5 text-ink shadow-[inset_0_0_0_1px_#BDB4FF]" : "bg-panel text-sub shadow-[inset_0_0_0_1px_#E4E5E8] hover:text-ink"}`;
  const PL: Record<string, string> = { wordpress: "WordPress", shopify: "Shopify", webhook: "Webhook" };
  const sent = drafts.filter((d) => publishLabel(d).key !== "draft");
  const published = drafts.filter((d) => publishLabel(d).key === "published");
  const scheduled = drafts.filter((d) => publishLabel(d).key === "scheduled");
  const failed = drafts.filter((d) => publishLabel(d).key === "error");
  const waiting = drafts.filter((d) => publishLabel(d).key === "draft");

  const actions: { kind: string; color: string; title: string; body: string; cta: React.ReactNode }[] = [];
  if (!connections.length)
    actions.push({
      kind: "Kurulum",
      color: "text-danger",
      title: "Henüz bağlı site yok",
      body: "WordPress, Shopify ya da Webhook (Wix, Webflow, Ghost, Framer…) bağla; yazıları editörden tek tıkla sitene taslak olarak gönder ya da zamanla.",
      cta: <button type="button" onClick={() => setAddOpen(true)} className={BTN2}>Site bağla</button>,
    });
  if (failed.length)
    actions.push({
      kind: "Hata",
      color: "text-danger",
      title: `${failed.length} yazı gönderilemedi`,
      body: `"${failed[0].article.title || "Başlıksız"}": ${failed[0].publishError ?? "gönderim hatası"}`,
      cta: <Link href={`/editor?draftId=${failed[0].id}`} className={BTN2}>Yazıyı aç</Link>,
    });
  if (waiting.length && connections.length)
    actions.push({
      kind: "Bekleyen",
      color: "text-accent",
      title: `${waiting.length} yazı henüz sitede değil`,
      body: "Editörde \"Yayınla\" ile sitene taslak olarak gönderebilir, hemen yayınlayabilir ya da ileri bir tarihe zamanlayabilirsin.",
      cta: <Link href="/editor" className={BTN2}>Tüm Yazılar</Link>,
    });
  if (actions.length < 3)
    actions.push({
      kind: "Otomatik",
      color: "text-seo",
      title: "Yayını Autoblog'a bırak",
      body: "Autoblog, kelime listesinden ya da beslemeden yazıları düzenli üretip bağlı siteye taslak olarak gönderir.",
      cta: <Link href="/campaigns" className={BTN2}>Autoblog</Link>,
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title={connections.length ? "Yazıların nereye yayınlanıyor?" : "Yayın Hedefleri"}
        description={
          connections.length
            ? `${connections.length} bağlı site · ${sent.length} yazı gönderildi · ${published.length} yayında`
            : "Yazılarının gideceği siteleri bağla. Yayınlama varsayılan olarak sitede taslak oluşturur; sen onaylayınca yayına çıkar."
        }
        actions={
          <button type="button" onClick={() => setAddOpen(true)} className={BTN1}>
            + Site bağla
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {([
          ["Bağlı site", String(connections.length), connections.length ? Array.from(new Set(connections.map((c) => PL[c.platform] ?? c.platform))).join(", ") : "henüz yok", ""],
          ["Sitede taslak", String(drafts.filter((d) => publishLabel(d).key === "remote-draft").length), "onayını bekliyor", ""],
          ["Zamanlanmış", String(scheduled.length), "ileri tarihli", ""],
          ["Yayında", String(published.length), "canlı yazı", published.length ? "text-seo" : ""],
          ["Hata", String(failed.length), "gönderilemeyen", failed.length ? "text-danger" : ""],
        ] as const).map(([l, v, hint, col]) => (
          <div key={l} className={`${CARD} px-4 py-4`}>
            <div className="text-xs font-medium text-sub">{l}</div>
            <div className={`mt-1.5 text-[26px] font-semibold leading-8 tabular-nums ${col}`}>{connsLoaded ? v : "…"}</div>
            <div className="mt-1 h-4 truncate text-[11px] text-sub">{hint}</div>
          </div>
        ))}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Ne yapmalı?</h3>
        <div className={`grid gap-3 ${["", "md:grid-cols-1", "md:grid-cols-2", "md:grid-cols-3"][Math.min(actions.length, 3)]}`}>
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

      <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr]">
        <div className={`${CARD} overflow-hidden`}>
          <div className="px-5 py-3 text-sm font-semibold">Bağlı siteler</div>
          {connections.length === 0 ? (
            <div className="border-t border-border px-5 py-8 text-center text-[13px] text-sub">
              Henüz bağlı site yok.
              <div className="mt-3">
                <button type="button" onClick={() => setAddOpen(true)} className={BTN1}>
                  + Site bağla
                </button>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {connections.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-5 py-3 text-[13px]">
                  <span className="rounded-md bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">{PL[c.platform] ?? c.platform}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{c.label}</div>
                    <div className="truncate text-[11px] text-sub">
                      {c.siteUrl}
                      {c.authIdentifier ? ` · ${c.authIdentifier}` : ""}
                    </div>
                  </div>
                  <button type="button" onClick={() => deleteConnection(c.id)} className="text-xs font-medium text-danger/70 hover:text-danger">
                    Kaldır
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={`${CARD} overflow-hidden`}>
          <div className="flex items-center justify-between px-5 py-3">
            <span className="text-sm font-semibold">Son gönderilenler</span>
            <Link href="/editor" className="text-xs font-medium text-accent hover:underline">
              Tüm Yazılar →
            </Link>
          </div>
          {sent.length === 0 ? (
            <div className="border-t border-border px-5 py-8 text-center text-[13px] text-sub">Henüz siteye gönderilen yazı yok. Editörde &quot;Yayınla&quot; ile gönder.</div>
          ) : (
            <table className="w-full text-[13px]">
              <tbody className="divide-y divide-border border-t border-border">
                {sent.slice(0, 12).map((d) => {
                  const st = publishLabel(d);
                  return (
                    <tr key={d.id} className="hover:bg-[#fafafa]">
                      <td className="max-w-[18rem] py-2.5 pl-5">
                        <Link href={`/editor?draftId=${d.id}`} className="block truncate font-medium hover:text-accent">
                          {d.article.title || "Başlıksız"}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span title={st.hint} className={`whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-5 text-right text-xs">
                        {d.publishedPostUrl ? (
                          <a href={d.publishedPostUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                            aç ↗
                          </a>
                        ) : (
                          <span className="text-sub">{new Date(d.createdAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <ContentHub />

      {/* Site bağla */}
      <Drawer
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        eyebrow="Yayın Hedefleri"
        title="Site bağla"
        subtitle="Bağlantı bilgileri şifreli saklanır. Yayınlama varsayılan olarak sitede taslak oluşturur."
        size="lg"
        as="form"
        onSubmit={saveConnection}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={testConnection}
              disabled={testing || !connForm.siteUrl || !connForm.authSecret || (connForm.platform === "wordpress" && !connForm.authIdentifier)}
              className={BTN2}
            >
              {testing ? "Test ediliyor…" : "Bağlantıyı test et"}
            </button>
            <button type="submit" disabled={savingConn || !connForm.label} className={BTN1}>
              {savingConn ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        }
      >
        <div className="space-y-4 text-[13px]">
          <div className="flex flex-wrap gap-2">
            {(["wordpress", "shopify", "webhook"] as CmsPlatform[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() =>
                  setConnForm((f) => ({
                    ...f,
                    platform: p,
                    authIdentifier: "",
                    authSecret: p === "webhook" ? `whsec_${Array.from(crypto.getRandomValues(new Uint8Array(16))).map((x) => x.toString(16).padStart(2, "0")).join("")}` : "",
                  }))
                }
                className={chip(connForm.platform === p)}
              >
                {p === "shopify" ? "Shopify" : p === "webhook" ? "Webhook · Zapier · Make" : "WordPress"}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-sub">Etiket</div>
            <input value={connForm.label} onChange={(e) => setConnForm((f) => ({ ...f, label: e.target.value }))} placeholder={connForm.platform === "shopify" ? "ör. Müşterinin Shopify mağazası" : connForm.platform === "webhook" ? "ör. Webflow – Zapier" : "ör. Şirket blogu"} required className={INPUT} />
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-sub">{connForm.platform === "webhook" ? "Webhook adresi" : "Site adresi"}</div>
            <input value={connForm.siteUrl} onChange={(e) => setConnForm((f) => ({ ...f, siteUrl: e.target.value }))} placeholder={connForm.platform === "shopify" ? "magaza.myshopify.com" : connForm.platform === "webhook" ? "https://hooks.zapier.com/hooks/catch/…" : "https://siten.com"} required className={INPUT} />
          </div>
          {connForm.platform === "wordpress" && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-sub">WordPress kullanıcı adı</div>
              <input value={connForm.authIdentifier} onChange={(e) => setConnForm((f) => ({ ...f, authIdentifier: e.target.value }))} required className={INPUT} />
            </div>
          )}
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-sub">{connForm.platform === "shopify" ? "Admin API token (shpat_…)" : connForm.platform === "webhook" ? "İmza anahtarı" : "Uygulama parolası"}</div>
            <input value={connForm.authSecret} onChange={(e) => setConnForm((f) => ({ ...f, authSecret: e.target.value }))} type={connForm.platform === "webhook" ? "text" : "password"} required className={INPUT} />
          </div>
          <p className="rounded-lg bg-[#fafafa] px-3 py-2 text-xs leading-5 text-sub">
            {connForm.platform === "webhook"
              ? "Wix, Webflow, Ghost, Framer, Squarespace, Notion… için: Zapier'de 'Webhooks by Zapier → Catch Hook' (ya da Make/n8n'de Webhook) oluştur, adresini buraya yapıştır. Yazı title, metaDescription, markdown ve html alanlarıyla JSON olarak gider; istek X-Epicsem-Signature (HMAC-SHA256) ile imzalanır."
              : connForm.platform === "shopify"
                ? "Shopify'da: Ayarlar → Uygulamalar ve satış kanalları → Uygulama geliştir → özel uygulama oluştur, Admin API'de write_content iznini aç, oluşan token'ı buraya yapıştır."
                : "WordPress'te: Kullanıcılar → Profil → Uygulama Parolaları → yeni bir tane ekle. Gerçek giriş parolan değil."}
          </p>
          {testResult && <p className={`rounded-lg px-3 py-2 text-xs ${testResult.ok ? "bg-seo/10 text-seo" : "bg-danger/5 text-danger"}`}>{testResult.message}</p>}
          <ErrorBlock message={connError} />
        </div>
      </Drawer>
    </div>
  );
}
