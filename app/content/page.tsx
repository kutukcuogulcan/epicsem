"use client";

import { useEffect, useState } from "react";
import type { CmsConnection, ContentDraft } from "@/types";
import UsageMeter from "@/components/UsageMeter";
import Breadcrumb from "@/components/Breadcrumb";
import FAQSection from "@/components/FAQSection";
import ExampleScenario from "@/components/ExampleScenario";

const SCENARIO_STEPS = [
  {
    title: "Gap Analysis bir boşluk bulur",
    body: "\"En iyi mobilya markaları hangileri?\" promptunda hiçbir sayfa anılmıyor bulgusu content brief'e dönüşür.",
  },
  {
    title: "\"Generate article\" tıklanır",
    body: "Brief, Content Studio'ya gönderilir ve taslak otomatik oluşturulur.",
  },
  {
    title: "Uydurma yerine [NEEDS: ...] işaretlenir",
    body: "Modelin dayanak bulamadığı bir istatistik varsa, onu uydurmak yerine açıkça [NEEDS: gerçek rakam] olarak bırakılır.",
  },
  {
    title: "İnsan incelemesi yapılır",
    body: "Taslak, [NEEDS: ...] alanları doldurulup gözden geçirilir.",
  },
  {
    title: "WordPress taslağı olarak yayınlanır",
    body: "\"Publish as WordPress draft\" ile içerik canlıya değil, WordPress'te bir taslak olarak gönderilir — yayına alma kararı kullanıcıya kalır.",
  },
];

const FAQ_ITEMS = [
  {
    q: "İçerik uyduruluyor mu, nereden geliyor?",
    a: "Hayır. Her taslak sadece Gap Analysis'teki gerçek bir content brief'e dayanır. Modelin dayanak bulamadığı bir bilgi varsa, onu uydurmak yerine açıkça [NEEDS: ...] şeklinde işaretleyip sana bırakır.",
  },
  {
    q: "Yayınladığımda direkt canlıya mı çıkıyor?",
    a: "Hayır — yayınlama her zaman WordPress'te bir taslak (draft) oluşturur, asla otomatik yayına almaz. İncelemeyi ve yayına alma kararını sen WordPress üzerinden veriyorsun.",
  },
  {
    q: "Birden fazla müşterinin WordPress'ine bağlanabilir miyim?",
    a: "Evet — her müşteri için ayrı bir bağlantı (site adresi, kullanıcı adı, application password) kaydedebilir, taslağı yayınlarken hangi bağlantıyı kullanacağını seçebilirsin.",
  },
  {
    q: "Aylık kaç içerik üretebilirim?",
    a: "Ücretsiz planda ayda 20 içerik üretimi hakkın var. Demo modda (API anahtarı tanımlı değilken) üretim bu kotadan düşmez.",
  },
];

interface DraftListItem {
  id: number;
  sourceUrl: string;
  article: { title: string; demoMode: boolean };
  status: ContentDraft["status"];
  createdAt: string;
}

export default function ContentStudioPage() {
  const [connections, setConnections] = useState<CmsConnection[]>([]);
  const [drafts, setDrafts] = useState<DraftListItem[]>([]);
  const [selectedDraft, setSelectedDraft] = useState<ContentDraft | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);

  const [connForm, setConnForm] = useState({ label: "", siteUrl: "", wpUsername: "", wpAppPassword: "" });
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [savingConn, setSavingConn] = useState(false);
  const [connError, setConnError] = useState<string | null>(null);

  const [selectedConnectionId, setSelectedConnectionId] = useState<number | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  function refreshConnections() {
    fetch("/api/cms/connections")
      .then((res) => (res.status === 401 ? { connections: [] } : res.json()))
      .then((data) => setConnections(data.connections ?? []))
      .catch(() => {});
  }

  function refreshDrafts() {
    fetch("/api/content")
      .then((res) => (res.status === 401 ? { drafts: [] } : res.json()))
      .then((data) => setDrafts(data.drafts ?? []))
      .catch(() => {});
  }

  function loadDraft(id: number) {
    setLoadingDraft(true);
    fetch(`/api/content?id=${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.draft) {
          setSelectedDraft(data.draft);
          window.history.replaceState(null, "", `/content?draftId=${id}`);
        }
      })
      .finally(() => setLoadingDraft(false));
  }

  useEffect(() => {
    refreshConnections();
    refreshDrafts();
    const id = new URLSearchParams(window.location.search).get("draftId");
    if (id) loadDraft(Number(id));
  }, []);

  useEffect(() => {
    if (connections.length > 0 && selectedConnectionId === null) setSelectedConnectionId(connections[0].id);
  }, [connections, selectedConnectionId]);

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    setConnError(null);
    try {
      const res = await fetch("/api/cms/connections/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteUrl: connForm.siteUrl,
          wpUsername: connForm.wpUsername,
          wpAppPassword: connForm.wpAppPassword,
        }),
      });
      const data = await res.json();
      setTestResult(
        data.ok
          ? { ok: true, message: `${data.siteUserName ?? connForm.wpUsername} olarak bağlandı.` }
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
      setConnForm({ label: "", siteUrl: "", wpUsername: "", wpAppPassword: "" });
      setTestResult(null);
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

  async function publish() {
    if (!selectedDraft || !selectedConnectionId) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch("/api/content/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: selectedDraft.id, connectionId: selectedConnectionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Yayınlama başarısız oldu");
      loadDraft(selectedDraft.id);
      refreshDrafts();
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "Bir şeyler ters gitti");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Breadcrumb items={[{ label: "Ana Sayfa", href: "/" }, { label: "İçerik Stüdyosu" }]} />
        <h1 className="text-3xl font-extrabold tracking-tight">İçerik Stüdyosu</h1>
        <p className="text-ink/60 text-sm max-w-3xl">
          <a href="/gap" className="text-accent hover:underline">Gap Analysis</a>&apos;te üretilen makaleler
          buraya gelir. Her taslak sadece o sayfanın gerçek audit/gap bulgularına dayanır — modelin dayanak
          bulamadığı her şey, uydurma bir bilgi yerine açık bir <code>[NEEDS: …]</code> placeholder&apos;ı olarak
          bırakılır. Yayınlama her zaman bir <strong>WordPress taslağı</strong> oluşturur, asla canlı bir gönderi
          değil — inceleyip yayına almayı siz WordPress&apos;ten yaparsınız.
        </p>
        <UsageMeter metric="contentGenerations" />
      </div>

      <div className="card space-y-4">
        <h2 className="font-bold">WordPress bağlantıları</h2>
        {connections.length === 0 && <p className="text-sm text-ink/40">Henüz bağlantı yok — aşağıdan bir tane ekleyin.</p>}
        <div className="space-y-2">
          {connections.map((c) => (
            <div key={c.id} className="flex items-center justify-between text-sm rounded-lg bg-muted px-3 py-2">
              <div>
                <span className="font-medium">{c.label}</span>{" "}
                <span className="text-ink/40">— {c.siteUrl} ({c.wpUsername}, {c.wpAppPasswordMasked})</span>
              </div>
              <button onClick={() => deleteConnection(c.id)} className="text-xs text-danger hover:underline">
                Kaldır
              </button>
            </div>
          ))}
        </div>

        <form onSubmit={saveConnection} className="space-y-2 border-t border-border pt-4">
          <div className="grid grid-cols-2 gap-2">
            <input
              value={connForm.label}
              onChange={(e) => setConnForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="Etiket (örn. Müşterinin WP sitesi)"
              required
              className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <input
              value={connForm.siteUrl}
              onChange={(e) => setConnForm((f) => ({ ...f, siteUrl: e.target.value }))}
              placeholder="https://musteri-sitesi.com"
              required
              className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <input
              value={connForm.wpUsername}
              onChange={(e) => setConnForm((f) => ({ ...f, wpUsername: e.target.value }))}
              placeholder="WordPress kullanıcı adı"
              required
              className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <input
              value={connForm.wpAppPassword}
              onChange={(e) => setConnForm((f) => ({ ...f, wpAppPassword: e.target.value }))}
              placeholder="Uygulama parolası"
              type="password"
              required
              className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <p className="text-xs text-ink/40">
            WordPress'te: Kullanıcılar → Profil → Uygulama Parolaları → yeni bir tane ekleyin. Gerçek giriş parolanız değil.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={testConnection}
              disabled={testing || !connForm.siteUrl || !connForm.wpUsername || !connForm.wpAppPassword}
              className="text-xs rounded-lg border border-border px-3 py-1.5 hover:bg-muted disabled:opacity-50"
            >
              {testing ? "Test ediliyor…" : "Bağlantıyı test et"}
            </button>
            <button
              type="submit"
              disabled={savingConn || !connForm.label}
              className="text-xs font-semibold rounded-lg bg-accent text-white px-3 py-1.5 hover:opacity-90 disabled:opacity-50"
            >
              {savingConn ? "Kaydediliyor…" : "Bağlantıyı kaydet"}
            </button>
            {testResult && (
              <span className={testResult.ok ? "text-xs text-seo" : "text-xs text-danger"}>{testResult.message}</span>
            )}
          </div>
          {connError && <div className="text-xs text-danger">{connError}</div>}
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <div className="card space-y-2 h-fit">
          <h2 className="font-bold text-sm">Taslaklar</h2>
          {drafts.length === 0 && (
            <p className="text-xs text-ink/40">
              Henüz yok — <a href="/gap" className="text-accent hover:underline">Gap Analysis</a>'teki bir içerik brifinden bir tane oluşturun.
            </p>
          )}
          {drafts.map((d) => (
            <button
              key={d.id}
              onClick={() => loadDraft(d.id)}
              className={`w-full text-left text-xs rounded-lg px-3 py-2 hover:bg-muted ${
                selectedDraft?.id === d.id ? "bg-muted" : ""
              }`}
            >
              <div className="font-medium truncate">{d.article.title}</div>
              <div className="text-ink/40 flex items-center gap-2">
                <span>{d.status === "published-to-wp" ? "WP'de yayınlandı" : "Taslak"}</span>
                {d.article.demoMode && <span className="text-warn">demo</span>}
              </div>
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {loadingDraft && <div className="card text-sm text-ink/40">Yükleniyor…</div>}

          {!loadingDraft && !selectedDraft && (
            <div className="card text-sm text-ink/40">Soldan bir taslak seçin, ya da Gap Analysis'ten yeni bir tane oluşturun.</div>
          )}

          {!loadingDraft && selectedDraft && (
            <div className="card space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="font-bold">{selectedDraft.article.title}</h2>
                  <p className="text-xs text-ink/40 mt-1">
                    {selectedDraft.sourceUrl} için · {selectedDraft.article.model}
                    {selectedDraft.article.demoMode && " · simüle edildi — API anahtarı tanımlı değil"}
                  </p>
                </div>
                {selectedDraft.status === "published-to-wp" && (
                  <span className="badge badge-pass">WordPress'te yayınlandı</span>
                )}
              </div>

              <p className="text-sm text-ink/70 italic">{selectedDraft.article.metaDescription}</p>

              {selectedDraft.article.openPlaceholders.length > 0 && (
                <div className="rounded-lg border border-warn/40 bg-warn/5 p-3 text-xs text-warn space-y-1">
                  <div className="font-medium">Yayına hazır olmadan önce bir insan gerekiyor:</div>
                  {selectedDraft.article.openPlaceholders.map((p, i) => (
                    <div key={i}>{p}</div>
                  ))}
                </div>
              )}

              <pre className="whitespace-pre-wrap text-sm text-ink/80 bg-muted rounded-lg p-4 max-h-[28rem] overflow-y-auto font-sans">
                {selectedDraft.article.bodyMarkdown}
              </pre>

              {selectedDraft.status === "published-to-wp" ? (
                <div className="flex gap-3 text-sm">
                  {selectedDraft.publishedPostUrl && (
                    <a href={selectedDraft.publishedPostUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                      Gönderiyi görüntüle
                    </a>
                  )}
                  {selectedDraft.publishedEditUrl && (
                    <a href={selectedDraft.publishedEditUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                      WordPress'te düzenle
                    </a>
                  )}
                </div>
              ) : (
                <div className="border-t border-border pt-3 space-y-2">
                  {connections.length === 0 ? (
                    <p className="text-xs text-ink/40">Bu taslağı yayınlamak için yukarıdan bir WordPress bağlantısı ekleyin.</p>
                  ) : (
                    <div className="flex items-center gap-3 flex-wrap">
                      <select
                        value={selectedConnectionId ?? ""}
                        onChange={(e) => setSelectedConnectionId(Number(e.target.value))}
                        className="text-sm rounded-lg bg-panel border border-border px-2 py-1.5 outline-none"
                      >
                        {connections.map((c) => (
                          <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                      </select>
                      <button
                        onClick={publish}
                        disabled={publishing}
                        className="text-sm font-semibold rounded-lg bg-accent text-white px-4 py-1.5 hover:opacity-90 disabled:opacity-50"
                      >
                        {publishing ? "Yayınlanıyor…" : "WordPress taslağı olarak yayınla"}
                      </button>
                    </div>
                  )}
                  {publishError && <div className="text-xs text-danger">{publishError}</div>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ExampleScenario heading="Kaybedilen bir prompt, yayına hazır bir taslağa dönüşüyor" steps={SCENARIO_STEPS} />

      <FAQSection items={FAQ_ITEMS} />
    </div>
  );
}
