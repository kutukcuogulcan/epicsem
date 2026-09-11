"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface BrandRow {
  name: string;
  domain: string;
}

type InputType = "seo-gap" | "listicle" | "news" | "comparison" | "alternatives";

interface ContentInput {
  id: number;
  type: InputType;
  topic: string;
  label: string;
  language: string;
  status: "queued" | "drafted" | "failed";
  draftId: number | null;
  error: string | null;
  createdAt: string;
}

interface DraftSummary {
  id: number;
  sourceUrl: string;
  article: { title: string };
  status: "draft" | "published-to-wp";
  createdAt: string;
}

const TYPE_LABEL: Record<InputType, string> = {
  "seo-gap": "SEO Makale",
  listicle: "Liste yazısı",
  news: "Haber temelli",
  comparison: "Karşılaştırma",
  alternatives: "Alternatifler",
};

const TYPE_BADGE_CLASS: Record<InputType, string> = {
  "seo-gap": "badge-info",
  listicle: "badge-info",
  news: "bg-warn/10 text-warn",
  comparison: "bg-seo/10 text-seo",
  alternatives: "bg-seo/10 text-seo",
};

// Quick-action cards. `direct: true` means clicking adds the input immediately
// (server picks a real, grounded Gap Analysis finding — no form needed); otherwise
// clicking reveals a single URL field, since that URL *is* the grounding source.
const CARDS: { type: InputType | "youtube" | "free-tool"; title: string; hint: string; direct?: boolean; disabled?: boolean }[] = [
  { type: "seo-gap", title: "SEO Makale Ekle", hint: "Son Gap Analysis bulgusundan", direct: true },
  { type: "news", title: "Haber Temelli Yazı", hint: "Gerçek bir haber URL'si" },
  { type: "comparison", title: "Rakip Karşılaştırması", hint: "Rakip sayfa URL'si" },
  { type: "alternatives", title: "Rakip Alternatifleri", hint: "Rakip sayfa URL'si" },
  { type: "listicle", title: "Liste Yazısı", hint: "Son Gap Analysis bulgusundan", direct: true },
  { type: "youtube", title: "YouTube → Blog Yazısı", hint: "Yakında", disabled: true },
  { type: "free-tool", title: "Ücretsiz Araç Şablonu", hint: "Yakında", disabled: true },
];

function CardIcon({ type }: { type: string }) {
  const common = { width: 16, height: 16, viewBox: "0 0 18 18", fill: "none", stroke: "currentColor", strokeWidth: 1.5 } as const;
  switch (type) {
    case "seo-gap":
      return (
        <svg {...common}>
          <path d="M3 3h12v12H3z" />
          <path d="M6 7h6M6 10h6M6 13h3" />
        </svg>
      );
    case "listicle":
      return (
        <svg {...common}>
          <circle cx="4" cy="5" r="1" fill="currentColor" />
          <circle cx="4" cy="9" r="1" fill="currentColor" />
          <circle cx="4" cy="13" r="1" fill="currentColor" />
          <path d="M7.5 5h7M7.5 9h7M7.5 13h7" />
        </svg>
      );
    case "news":
      return (
        <svg {...common}>
          <path d="M3 4h9v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4z" />
          <path d="M12 7h3v6a2 2 0 0 1-2 2" />
          <path d="M5.5 6.5h4M5.5 9h4M5.5 11.5h2" />
        </svg>
      );
    case "comparison":
      return (
        <svg {...common}>
          <circle cx="6" cy="9" r="3.5" />
          <circle cx="12" cy="9" r="3.5" />
        </svg>
      );
    case "alternatives":
      return (
        <svg {...common}>
          <path d="M3 9h5M8 9l-2-2M8 9l-2 2" />
          <path d="M15 9h-5M10 9l2-2M10 9l2 2" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...common}>
          <rect x="2.5" y="4.5" width="13" height="9" rx="2" />
          <path d="M7.5 7.2v3.6l3.5-1.8z" fill="currentColor" stroke="none" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="3" y="3" width="12" height="12" rx="2" />
        </svg>
      );
  }
}

export default function ContentHub() {
  const [brand, setBrand] = useState<BrandRow>({ name: "", domain: "" });
  const [inputs, setInputs] = useState<ContentInput[] | null>(null);
  const [drafts, setDrafts] = useState<DraftSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"inputs" | "generations" | "publications">("inputs");
  const [openFormType, setOpenFormType] = useState<InputType | null>(null);
  const [urlValue, setUrlValue] = useState("");
  const [addingType, setAddingType] = useState<InputType | null>(null);
  const [generatingId, setGeneratingId] = useState<number | null>(null);

  const hasBrand = Boolean(brand.name && brand.domain);

  const loadInputs = useCallback(async () => {
    if (!brand.domain) {
      setInputs(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/content-inputs?brandDomain=${encodeURIComponent(brand.domain)}`);
      if (res.status === 401) return;
      const data = await res.json();
      if (res.ok) setInputs(data.inputs);
    } catch {
      // secondary panel — stay quiet on transient failures
    } finally {
      setLoading(false);
    }
  }, [brand.domain]);

  const loadDrafts = useCallback(async () => {
    try {
      const res = await fetch("/api/content");
      if (res.status === 401) return;
      const data = await res.json();
      if (res.ok) setDrafts(data.drafts);
    } catch {
      // secondary panel
    }
  }, []);

  useEffect(() => {
    loadInputs();
  }, [loadInputs]);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  const generationsCount = drafts?.length ?? 0;
  const publicationsCount = useMemo(() => drafts?.filter((d) => d.status === "published-to-wp").length ?? 0, [drafts]);

  async function addDirect(type: "seo-gap" | "listicle") {
    setAddingType(type);
    setError(null);
    try {
      const res = await fetch("/api/content-inputs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand, type }),
      });
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Eklenemedi");
      setInputs((prev) => [data.input, ...(prev ?? [])]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti");
    } finally {
      setAddingType(null);
    }
  }

  async function addUrlInput(type: "news" | "comparison" | "alternatives") {
    if (!urlValue.trim()) {
      setError("Bir URL girin.");
      return;
    }
    setAddingType(type);
    setError(null);
    try {
      const res = await fetch("/api/content-inputs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand, type, sourceUrl: urlValue.trim() }),
      });
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Eklenemedi");
      setInputs((prev) => [data.input, ...(prev ?? [])]);
      setOpenFormType(null);
      setUrlValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti");
    } finally {
      setAddingType(null);
    }
  }

  function onCardClick(type: InputType | "youtube" | "free-tool", direct?: boolean, disabled?: boolean) {
    if (disabled) return;
    if (direct) {
      addDirect(type as "seo-gap" | "listicle");
      return;
    }
    setError(null);
    setUrlValue("");
    setOpenFormType(openFormType === type ? null : (type as InputType));
  }

  async function generate(id: number) {
    setGeneratingId(id);
    setError(null);
    try {
      const res = await fetch("/api/content-inputs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Üretilemedi");
      await loadInputs();
      await loadDrafts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti");
      await loadInputs();
    } finally {
      setGeneratingId(null);
    }
  }

  async function remove(id: number) {
    setInputs((prev) => prev?.filter((i) => i.id !== id) ?? prev);
    try {
      await fetch("/api/content-inputs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {
      loadInputs();
    }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div>
          <h2 className="font-bold">Content Hub</h2>
          <p className="text-xs text-ink/50 mt-0.5">
            Her giriş gerçek bir kaynağa dayanır — ya en son Gap Analysis bulgunuza, ya da sizin verdiğiniz gerçek
            bir URL&apos;ye. Hiçbir başlık veya sayı uydurulmaz.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input
            value={brand.name}
            onChange={(e) => setBrand((b) => ({ ...b, name: e.target.value }))}
            placeholder="Marka adı"
            className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            value={brand.domain}
            onChange={(e) => setBrand((b) => ({ ...b, domain: e.target.value }))}
            placeholder="marka-domaini.com"
            className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {CARDS.map((c) => (
            <button
              key={c.type}
              type="button"
              disabled={!hasBrand || c.disabled || addingType === c.type}
              onClick={() => onCardClick(c.type, c.direct, c.disabled)}
              className={`text-left rounded-lg border p-2.5 transition-colors ${
                openFormType === c.type ? "border-accent bg-accent/5" : "border-border hover:bg-muted"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <span className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center text-ink/60">
                <CardIcon type={c.type} />
              </span>
              <div className="mt-1.5 text-xs font-semibold leading-tight">{c.title}</div>
              <div className="text-[10px] text-ink/40 mt-0.5">
                {addingType === c.type ? "Ekleniyor…" : c.hint}
              </div>
            </button>
          ))}
        </div>

        {openFormType && (openFormType === "news" || openFormType === "comparison" || openFormType === "alternatives") && (
          <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 p-2.5">
            <input
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              placeholder={openFormType === "news" ? "https://gercek-haber-sitesi.com/haber" : "https://rakip-domaini.com/sayfa"}
              className="flex-1 rounded-lg bg-panel border border-border px-3 py-1.5 text-sm outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => addUrlInput(openFormType)}
              disabled={addingType === openFormType}
              className="rounded-lg bg-accent text-white px-3.5 py-1.5 text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              Ekle
            </button>
          </div>
        )}

        {error && <div className="text-xs text-danger">{error}</div>}
        {!hasBrand && <div className="text-xs text-ink/40">Kartlara tıklamak için önce marka adı ve alan adını girin.</div>}
      </div>

      <div className="card space-y-3">
        <div className="flex gap-4 text-sm border-b border-border">
          <button
            type="button"
            onClick={() => setTab("inputs")}
            className={`pb-2 -mb-px border-b-2 ${tab === "inputs" ? "border-accent text-accent font-semibold" : "border-transparent text-ink/50"}`}
          >
            Inputs {inputs ? `(${inputs.length})` : ""}
          </button>
          <button
            type="button"
            onClick={() => setTab("generations")}
            className={`pb-2 -mb-px border-b-2 ${tab === "generations" ? "border-accent text-accent font-semibold" : "border-transparent text-ink/50"}`}
          >
            Generations ({generationsCount})
          </button>
          <button
            type="button"
            onClick={() => setTab("publications")}
            className={`pb-2 -mb-px border-b-2 ${tab === "publications" ? "border-accent text-accent font-semibold" : "border-transparent text-ink/50"}`}
          >
            Publications ({publicationsCount})
          </button>
        </div>

        {tab === "inputs" && (
          <>
            {!hasBrand && <div className="text-sm text-ink/40 text-center py-4">Önce markanızı girin.</div>}
            {hasBrand && loading && <div className="text-sm text-ink/40 text-center py-4">Yükleniyor…</div>}
            {hasBrand && !loading && inputs && inputs.length === 0 && (
              <div className="text-sm text-ink/40 text-center py-4">Kuyrukta henüz bir şey yok — yukarıdaki kartlardan ekleyin.</div>
            )}
            {hasBrand && inputs && inputs.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-ink/40 text-left">
                    <tr>
                      <th className="py-2 pr-4">#</th>
                      <th className="py-2 pr-4">Input</th>
                      <th className="py-2 pr-4">Dil</th>
                      <th className="py-2 pr-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {inputs.map((input, i) => (
                      <tr key={input.id} className="border-t border-border">
                        <td className="py-2 pr-4 text-ink/40">{inputs.length - i}</td>
                        <td className="py-2 pr-4 max-w-md">
                          <div className="flex items-center gap-2">
                            <span className="h-6 w-6 rounded bg-muted flex items-center justify-center text-ink/50 shrink-0">
                              <CardIcon type={input.type} />
                            </span>
                            <div className="min-w-0">
                              <div className="truncate" title={input.label}>
                                {input.label}
                              </div>
                              <span className={`badge ${TYPE_BADGE_CLASS[input.type]} mt-0.5`}>{TYPE_LABEL[input.type]}</span>
                              {input.status === "failed" && input.error && (
                                <div className="text-xs text-danger mt-0.5 truncate" title={input.error}>
                                  {input.error}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-2 pr-4 text-ink/50">{input.language.toUpperCase()}</td>
                        <td className="py-2 pr-4 text-right whitespace-nowrap">
                          {input.status === "drafted" ? (
                            <span className="badge badge-pass">Taslak hazır</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => generate(input.id)}
                              disabled={generatingId === input.id}
                              className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50 mr-2"
                            >
                              {generatingId === input.id ? "Üretiliyor…" : input.status === "failed" ? "Tekrar dene" : "Generate Article"}
                            </button>
                          )}
                          <button type="button" onClick={() => remove(input.id)} className="text-xs text-ink/30 hover:text-danger">
                            Sil
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === "generations" && (
          <div className="space-y-2">
            {generationsCount === 0 && <div className="text-sm text-ink/40 text-center py-4">Henüz üretilen taslak yok.</div>}
            {drafts?.slice(0, 10).map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 text-sm border-t border-border py-2 first:border-t-0">
                <span className="truncate">{d.article.title}</span>
                <span className="text-xs text-ink/40 shrink-0">{new Date(d.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
            {generationsCount > 0 && (
              <p className="text-xs text-ink/30 pt-1">Aşağıdaki taslak listesinden içeriği görüntüleyip yayınlayabilirsiniz.</p>
            )}
          </div>
        )}

        {tab === "publications" && (
          <div className="space-y-2">
            {publicationsCount === 0 && <div className="text-sm text-ink/40 text-center py-4">Henüz yayınlanan yok.</div>}
            {drafts
              ?.filter((d) => d.status === "published-to-wp")
              .slice(0, 10)
              .map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 text-sm border-t border-border py-2 first:border-t-0">
                  <span className="truncate">{d.article.title}</span>
                  <span className="badge badge-pass shrink-0">Yayınlandı</span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
