"use client";

import { useCallback, useEffect, useState } from "react";
import type { EngineId } from "@/types";
import ScoreBadge from "@/components/ScoreBadge";

interface BrandRow {
  name: string;
  domain: string;
}

interface SavedPrompt {
  id: number;
  brandName: string;
  brandDomain: string;
  promptText: string;
  topic: string;
  branded: boolean;
  lastVisibility: number | null;
  lastSentiment: number | null;
  lastMentioned: boolean | null;
  lastRunAt: string | null;
  createdAt: string;
}

// Same "Konu: prompt metni" convention as the ad-hoc textarea above this panel, so a
// prompt saved here reads the same way whether it came from Manual rows or the Import tab.
function parseLine(line: string): { text: string; topic: string } {
  const m = line.match(/^([^:]{1,24}):\s*(.+)$/);
  if (m && m[1].trim().split(/\s+/).length <= 3) {
    return { topic: m[1].trim(), text: m[2].trim() };
  }
  return { topic: "Genel", text: line };
}

export default function SavedPromptsPanel({
  brand,
  competitors,
  engines,
}: {
  brand: BrandRow;
  competitors: BrandRow[];
  engines: EngineId[];
}) {
  const [prompts, setPrompts] = useState<SavedPrompt[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [tab, setTab] = useState<"manual" | "import">("manual");
  const [manualRows, setManualRows] = useState<string[]>([""]);
  const [importText, setImportText] = useState("");
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<number | null>(null);

  const hasBrand = Boolean(brand.name && brand.domain);

  const load = useCallback(async () => {
    if (!brand.domain) {
      setPrompts(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/saved-prompts?brandDomain=${encodeURIComponent(brand.domain)}`);
      if (res.status === 401) return;
      const data = await res.json();
      if (res.ok) setPrompts(data.prompts);
    } catch {
      // silent — this panel is secondary to the main test flow
    } finally {
      setLoading(false);
    }
  }, [brand.domain]);

  useEffect(() => {
    load();
  }, [load]);

  function openModal() {
    setManualRows([""]);
    setImportText("");
    setTab("manual");
    setError(null);
    setModalOpen(true);
  }

  async function addPrompts() {
    const lines =
      tab === "manual"
        ? manualRows.map((r) => r.trim()).filter(Boolean)
        : importText.split("\n").map((r) => r.trim()).filter(Boolean);
    if (lines.length === 0) {
      setError("En az bir prompt girin.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/saved-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand,
          competitors: competitors.filter((c) => c.name && c.domain),
          prompts: lines.map(parseLine),
        }),
      });
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Prompt eklenemedi");
      setPrompts((prev) => [...(data.prompts as SavedPrompt[]), ...(prev ?? [])]);
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti");
    } finally {
      setSaving(false);
    }
  }

  async function runOne(id: number) {
    setRunningId(id);
    setError(null);
    try {
      const res = await fetch("/api/saved-prompts/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, engines }),
      });
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Çalıştırılamadı");
      setPrompts((prev) => prev?.map((p) => (p.id === id ? data.prompt : p)) ?? prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti");
    } finally {
      setRunningId(null);
    }
  }

  async function remove(id: number) {
    setPrompts((prev) => prev?.filter((p) => p.id !== id) ?? prev);
    try {
      await fetch("/api/saved-prompts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {
      load(); // restore true state if the delete didn't actually go through
    }
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold">Kayıtlı promptlar</h2>
          <p className="text-xs text-ink/50 mt-0.5">
            Yukarıdaki testten bağımsız, kalıcı bir prompt kütüphanesi — tek tek, istediğiniz zaman yeniden
            çalıştırabilirsiniz. {engines.length} motor seçiliyken çalıştırılır.
          </p>
        </div>
        <button
          type="button"
          onClick={openModal}
          disabled={!hasBrand}
          title={hasBrand ? undefined : "Önce marka adı ve alan adını girin"}
          className="rounded-lg bg-accent text-white px-3.5 py-2 text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          + Prompt ekle
        </button>
      </div>

      {error && <div className="text-xs text-danger">{error}</div>}

      {!hasBrand && <div className="text-sm text-ink/40 text-center py-4">Önce markanızı girin.</div>}

      {hasBrand && loading && <div className="text-sm text-ink/40 text-center py-4">Yükleniyor…</div>}

      {hasBrand && !loading && prompts && prompts.length === 0 && (
        <div className="text-sm text-ink/40 text-center py-4">
          Henüz kayıtlı prompt yok — &ldquo;+ Prompt ekle&rdquo; ile başlayın.
        </div>
      )}

      {hasBrand && prompts && prompts.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-ink/40 text-left">
              <tr>
                <th className="py-2 pr-4">Prompt</th>
                <th className="py-2 pr-4">Tip</th>
                <th className="py-2 pr-4">Görünürlük</th>
                <th className="py-2 pr-4">Duygu</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {prompts.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="py-2 pr-4 max-w-xs">
                    <div className="truncate" title={p.promptText}>
                      {p.promptText}
                    </div>
                    {p.topic !== "Genel" && <span className="badge bg-ink/5 text-ink/50 mt-1">{p.topic}</span>}
                  </td>
                  <td className="py-2 pr-4">
                    <span className={`badge ${p.branded ? "badge-info" : "bg-ink/5 text-ink/50"}`}>
                      {p.branded ? "Marka bilinen" : "Keşif"}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    <ScoreBadge score={p.lastVisibility} display={p.lastVisibility != null ? `${p.lastVisibility}%` : undefined} />
                  </td>
                  <td className="py-2 pr-4">
                    <ScoreBadge score={p.lastSentiment} kind="sentiment" />
                  </td>
                  <td className="py-2 pr-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => runOne(p.id)}
                      disabled={runningId === p.id}
                      className="text-xs text-accent hover:underline disabled:opacity-50 mr-3"
                    >
                      {runningId === p.id ? "Çalışıyor…" : "Çalıştır"}
                    </button>
                    <button type="button" onClick={() => remove(p.id)} className="text-xs text-ink/30 hover:text-danger">
                      Sil
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-ink/30">
            Görünürlük/duygu, o promptun en son çalıştırıldığında hangi motorların markayı andığının yüzdesi —
            hiç çalıştırılmadıysa boş görünür.
          </p>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => !saving && setModalOpen(false)} />
          <div className="relative bg-panel border border-border rounded-xl shadow-lg w-full max-w-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">Prompt ekle</h3>
              <button type="button" onClick={() => setModalOpen(false)} className="text-ink/40 hover:text-ink">
                ✕
              </button>
            </div>
            <p className="text-xs text-ink/50">
              Markanızın nasıl sorulacağını izleyecek promptlar ekleyin — kaydettikten sonra dilediğiniz zaman
              tek tek yeniden çalıştırabilirsiniz.
            </p>

            <div className="flex gap-4 text-sm border-b border-border">
              <button
                type="button"
                onClick={() => setTab("manual")}
                className={`pb-2 -mb-px border-b-2 ${tab === "manual" ? "border-accent text-accent font-semibold" : "border-transparent text-ink/50"}`}
              >
                Manuel
              </button>
              <button
                type="button"
                onClick={() => setTab("import")}
                className={`pb-2 -mb-px border-b-2 ${tab === "import" ? "border-accent text-accent font-semibold" : "border-transparent text-ink/50"}`}
              >
                İçe aktar
              </button>
            </div>

            {tab === "manual" ? (
              <div className="space-y-2">
                {manualRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={row}
                      onChange={(e) => setManualRows((prev) => prev.map((r, idx) => (idx === i ? e.target.value : r)))}
                      placeholder="örn. [marka] güvenilir mi?"
                      className="flex-1 rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
                    />
                    {manualRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setManualRows((prev) => prev.filter((_, idx) => idx !== i))}
                        className="text-ink/30 hover:text-danger px-1"
                        aria-label="Satırı sil"
                      >
                        🗑
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setManualRows((prev) => [...prev, ""])}
                  className="text-xs text-accent hover:underline"
                >
                  + Satır ekle
                </button>
              </div>
            ) : (
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={6}
                placeholder={"Bir satıra bir prompt — örn.\n[marka] güvenilir mi?\nFiyat: [marka] ne kadar tutar?"}
                className="w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent font-mono"
              />
            )}

            {error && <div className="text-xs text-danger">{error}</div>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={saving}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={addPrompts}
                disabled={saving}
                className="rounded-lg bg-accent text-white px-4 py-2 text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? "Ekleniyor…" : "Prompt ekle"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
