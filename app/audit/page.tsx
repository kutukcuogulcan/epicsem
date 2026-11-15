"use client";

import { useEffect, useState } from "react";
import type { SeoAuditResult } from "@/types";
import AuditOverview from "@/components/tool/AuditOverview";
import AuditDashboard, { type AuditHistoryPoint } from "@/components/tool/AuditDashboard";
import { useAgencyName } from "@/lib/use-agency-name";
import { useProject } from "@/components/ProjectProvider";
import { Drawer, ErrorBlock, PageHeader } from "@/components/ui";

export default function AuditPage() {
  const [url, setUrl] = useState("");
  const { project } = useProject();
  useEffect(() => {
    if (project) setUrl(`https://${project.domain}`);
  }, [project?.domain]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SeoAuditResult | null>(null);
  const [agencyName, setAgencyName] = useAgencyName();
  const [refreshKey, setRefreshKey] = useState(0);
  const [history, setHistory] = useState<AuditHistoryPoint[]>([]);
  const [resultAt, setResultAt] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);

  // Aktif projenin son denetimini otomatik göster.
  useEffect(() => {
    if (!project?.domain) return;
    let off = false;
    fetch(`/api/audit/latest?domain=${encodeURIComponent(project.domain)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (off) return;
        if (d?.latest) {
          setResult(d.latest.result);
          setResultAt(d.latest.createdAt);
          setHistory(d.latest.history ?? []);
        } else {
          setResult(null);
          setHistory([]);
        }
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [project?.domain, refreshKey]);

  useEffect(() => {
    // Ana sayfadaki "siteniz.com" kutusundan gelen ?url= ön-doldurması.
    const pre = new URLSearchParams(window.location.search).get("url");
    if (pre) setUrl(pre);
  }, []);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("clientId");
    if (!id) return;
    fetch(`/api/clients/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.client) setUrl(data.client.domain);
      })
      .catch(() => {});
  }, []);

  async function runAudit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) {
      setError("Taranacak bir URL girin.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Denetim başarısız oldu");
      setResult(data);
      setResultAt(new Date().toISOString());
      setHistory((h) => [...h, { score: data.score, aiCrawlScore: data.aiCrawlScore, createdAt: new Date().toISOString() }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti");
    } finally {
      setLoading(false);
    }
  }

  async function downloadPdf() {
    if (!result) return;
    const res = await fetch("/api/report/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agencyName: agencyName.trim() || undefined,
        clientName: result.meta.title || result.url,
        clientDomain: result.url,
        audit: result,
      }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = "epicsem-audit-report.pdf";
    a.click();
    URL.revokeObjectURL(objectUrl);
  }

  const host = (() => {
    try {
      return result ? new URL(result.url).hostname.replace(/^www\./, "") : project?.domain ?? "";
    } catch {
      return project?.domain ?? "";
    }
  })();
  const BTN1 = "inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-accent px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60";
  const BTN2 = "inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-panel px-3 text-sm font-medium text-ink shadow-[inset_0_0_0_1px_#D5D7DA,0_1px_2px_rgba(13,18,28,0.05)] hover:bg-muted";

  return (
    <div className="space-y-6">
      <PageHeader
        title={result ? `${host} ne kadar sağlıklı?` : "Site Denetimi"}
        description={
          result
            ? `${result.url} · ~${result.meta.wordCount} kelime · son denetim ${new Date(resultAt ?? result.fetchedAt).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
            : "Teknik SEO temelleri ve GPTBot, ClaudeBot, PerplexityBot gibi AI tarayıcılarının sayfaya erişimi — tek taramada."
        }
        actions={
          <div className="flex items-center gap-2">
            {result && (
              <button type="button" onClick={() => setPdfOpen(true)} className={BTN2}>
                PDF rapor
              </button>
            )}
            <button type="button" onClick={() => setFormOpen(true)} disabled={loading} className={BTN1}>
              {loading ? "Taranıyor…" : "+ Yeni denetim"}
            </button>
          </div>
        }
      />

      <ErrorBlock message={error} />

      {loading && (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-panel px-5 py-4 text-sm shadow-[0_1px_2px_rgba(13,18,28,0.05)]">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          {url} taranıyor — sayfa, robots.txt, sitemap ve AI botu erişimi kontrol ediliyor…
        </div>
      )}

      {result ? (
        <AuditDashboard result={result} history={history} />
      ) : (
        !loading && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-dashed border-border bg-panel px-6 py-10 text-center">
              <div className="text-base font-semibold">{project ? `${project.domain} için henüz denetim yok` : "Henüz denetim yok"}</div>
              <p className="mx-auto mt-1 max-w-md text-sm text-sub">Siteni tara; teknik SEO sorunlarını, AI tarayıcılarının erişimini ve hazır düzeltme kodlarını tek ekranda gör. AI kullanmaz, ücretsizdir.</p>
              <button type="button" onClick={() => setFormOpen(true)} className={`${BTN1} mt-4`}>
                Denetimi başlat
              </button>
            </div>
            <AuditOverview refreshKey={refreshKey} onPick={(u) => { setUrl(u); setFormOpen(true); }} />
          </div>
        )
      )}

      <Drawer isOpen={formOpen} onClose={() => setFormOpen(false)} eyebrow="Site Denetimi" title="Yeni denetim" subtitle="Bir sayfa adresi yaz; teknik SEO ve AI erişimi kontrol edilir." size="md">
        <form
          onSubmit={(e) => {
            setFormOpen(false);
            runAudit(e);
          }}
          className="space-y-3"
        >
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="ör. https://siteniz.com/sayfa" required className="h-10 w-full rounded-[10px] border border-border bg-panel px-3 text-sm outline-none focus:border-[#BDB4FF]" />
          <button type="submit" disabled={loading} className={BTN1}>
            Denetimi başlat →
          </button>
        </form>
      </Drawer>

      <Drawer isOpen={pdfOpen} onClose={() => setPdfOpen(false)} eyebrow="Rapor" title="PDF rapor indir" subtitle="Müşterine gönderebileceğin markalı rapor." size="md">
        <div className="space-y-3">
          <input value={agencyName} onChange={(e) => setAgencyName(e.target.value)} placeholder="Ajans adın (opsiyonel, PDF'te görünür)" className="h-10 w-full rounded-[10px] border border-border bg-panel px-3 text-sm outline-none focus:border-[#BDB4FF]" />
          <button type="button" onClick={downloadPdf} className={BTN1}>
            PDF indir
          </button>
        </div>
      </Drawer>
    </div>
  );
}
