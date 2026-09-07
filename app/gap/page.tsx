"use client";

import { useEffect, useMemo, useState } from "react";
import type { EngineId, GapRow, GeoVisibilitySummary } from "@/types";
import type { ContentBrief } from "@/lib/content-brief";
import PromptBlock from "@/components/PromptBlock";
import UsageMeter from "@/components/UsageMeter";
import Breadcrumb from "@/components/Breadcrumb";
import StatCard from "@/components/StatCard";
import FAQSection from "@/components/FAQSection";
import ExampleScenario from "@/components/ExampleScenario";
import { useAgencyName } from "@/lib/use-agency-name";

const SCENARIO_STEPS = [
  {
    title: "Marka, rakip ve sayfa URL'leri girilir",
    body: "Marka bilgisi, promptlar ve denetlenecek sayfa URL'leri (ör. ana sayfa ve en çok trafik alan blog yazısı) girilir.",
  },
  {
    title: "Audit + GEO aynı anda çaprazlanır",
    body: "Her sayfa için teknik SEO/AXO skoru ile GEO testinin o sayfayı gerçekten anıp anmadığı aynı tabloda birleştirilir.",
  },
  {
    title: "\"Strong but invisible\" etiketi çıkar",
    body: "Bir blog yazısı teknik olarak sağlam, hiçbir crawler engellenmemiş, ama hiçbir AI yanıtında anılmıyor — \"Invisible\" olarak işaretlenir.",
  },
  {
    title: "Content brief otomatik üretilir",
    body: "Sayfanın kaybettiği promptlar somut başlık/FAQ önerilerine çevrilir.",
  },
  {
    title: "Content Studio'ya gönderilir",
    body: "\"Generate article\" ile brief, Content Studio'da bir WordPress taslağına dönüşür.",
  },
];

const FAQ_ITEMS = [
  {
    q: "Gap Analysis tam olarak neyi karşılaştırıyor?",
    a: "Her sayfa için Audit'in ölçtüğü teknik sağlamlığı ve AI crawler erişimini, GEO testinin o sayfayı gerçekten anıp anmadığıyla çaprazlar. Yalnız birini okuduğunda göremeyeceğin şeyi gösterir: teknik olarak sağlam ama hiç anılmayan bir sayfa.",
  },
  {
    q: "\"AI'ya kapalı\", \"Sağlam ama görünmez\", \"Anılıyor\", \"İyileştirme gerekli\" etiketleri ne anlama geliyor?",
    a: "AI'ya kapalı: sayfa AI crawler'lara kapalı. Sağlam ama görünmez: teknik olarak sağlam ve erişilebilir ama hiçbir AI yanıtında anılmıyor. Anılıyor: en az bir AI yanıtında anılıyor. İyileştirme gerekli: kısmi teknik veya erişim sorunları var.",
  },
  {
    q: "İçerik brief'leri (Content Briefs) nereden geliyor?",
    a: "Girdiğin promptlardan hangilerinin hiçbir sayfanı bulamadığını tespit edip, o kaybedilen promptları somut bir başlık/FAQ önerisine çeviriyor. Buradan \"Generate article\" ile Content Studio'da bir WordPress taslağına dönüştürebilirsin.",
  },
  {
    q: "Audit ve GEO'yu ayrı ayrı çalıştırmak yetmez mi?",
    a: "Ayrı ayrı okuduğunda ikisi de yarım bir cevap verir: Audit \"teknik olarak sağlam\" der, GEO \"anılıyor mu\" der. Gap Analysis ikisini aynı satırda birleştirip asıl soruyu cevaplar: sağlam olduğu halde neden anılmıyor?",
  },
];
import { buildContentBriefPrompt } from "@/lib/claude-code-prompt";

const ENGINE_LABEL: Record<EngineId, string> = {
  openai: "ChatGPT (OpenAI)",
  anthropic: "Claude (Anthropic)",
  google: "Gemini (Google)",
  perplexity: "Perplexity",
  deepseek: "DeepSeek",
  xai: "Grok (xAI)",
  meta: "Meta AI (sadece demo)",
  microsoft: "Copilot (sadece demo)",
};

const DEFAULT_ENGINES: EngineId[] = ["openai", "anthropic", "google", "perplexity"];

const EN_PROMPT_PRESET = "best tools for [your category]\nhow to choose a [your category] tool\n[brand] vs [competitor]";
const TR_PROMPT_PRESET =
  "[kategori] için en iyi markalar hangileri?\nİstanbul'da [kategori] konusunda hangi firmayı önerirsiniz?\n[marka] güvenilir mi?\n[marka] ile [rakip] arasındaki fark ne?";

const VERDICT_LABEL: Record<GapRow["verdict"], string> = {
  blocked: "AI'ya kapalı",
  invisible: "Sağlam ama görünmez",
  cited: "Anılıyor",
  "needs-work": "İyileştirme gerekli",
};

const VERDICT_BADGE: Record<GapRow["verdict"], string> = {
  blocked: "badge-critical",
  invisible: "badge-info",
  cited: "badge-pass",
  "needs-work": "badge-warning",
};

interface BrandRow {
  name: string;
  domain: string;
}

export default function GapPage() {
  const [brand, setBrand] = useState<BrandRow>({ name: "", domain: "" });
  const [competitors, setCompetitors] = useState<BrandRow[]>([{ name: "", domain: "" }]);
  const [promptsText, setPromptsText] = useState(
    "best tools for [your category]\nhow to choose a [your category] tool\n[brand] vs [competitor]"
  );
  const [pageUrlsText, setPageUrlsText] = useState("");
  const [engines, setEngines] = useState<EngineId[]>(DEFAULT_ENGINES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<GeoVisibilitySummary[] | null>(null);
  const [gapMatrix, setGapMatrix] = useState<GapRow[] | null>(null);
  const [contentBriefs, setContentBriefs] = useState<ContentBrief[] | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [generatingUrl, setGeneratingUrl] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [agencyName, setAgencyName] = useAgencyName();

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("clientId");
    if (!id) return;
    fetch(`/api/clients/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.client) return;
        setBrand({ name: data.client.name, domain: data.client.domain });
        if (data.client.competitors.length > 0) setCompetitors(data.client.competitors);
        setPageUrlsText(data.client.domain);
      })
      .catch(() => {});
  }, []);

  const prompts = useMemo(
    () => promptsText.split("\n").map((p) => p.trim()).filter(Boolean),
    [promptsText]
  );
  const pageUrls = useMemo(
    () => pageUrlsText.split("\n").map((p) => p.trim()).filter(Boolean),
    [pageUrlsText]
  );

  function updateCompetitor(i: number, field: keyof BrandRow, value: string) {
    setCompetitors((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));
  }

  async function generateArticle(brief: ContentBrief) {
    setGeneratingUrl(brief.url);
    setGenerateError(null);
    try {
      const res = await fetch("/api/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...brief, brandName: brand.name, brandDomain: brand.domain }),
      });
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "İçerik üretimi başarısız oldu");
      window.location.href = `/content?draftId=${data.draft.id}`;
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Bir şeyler ters gitti");
      setGeneratingUrl(null);
    }
  }

  async function downloadPdf() {
    if (!gapMatrix) return;
    const res = await fetch("/api/report/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agencyName: agencyName.trim() || undefined,
        clientName: brand.name,
        clientDomain: brand.domain,
        geo: summaries ? { summaries } : null,
        gap: { gapMatrix, contentBriefs: contentBriefs ?? [] },
      }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = "epicsem-gap-report.pdf";
    a.click();
    URL.revokeObjectURL(objectUrl);
  }

  async function runAnalysis(e: React.FormEvent) {
    e.preventDefault();
    if (!brand.name || !brand.domain) {
      setError("Enter your brand name and domain.");
      return;
    }
    if (prompts.length === 0) {
      setError("Enter at least one prompt.");
      return;
    }
    if (pageUrls.length === 0) {
      setError("Enter at least one page URL to audit.");
      return;
    }
    if (engines.length === 0) {
      setError("Pick at least one engine.");
      return;
    }
    setLoading(true);
    setError(null);
    setSummaries(null);
    setGapMatrix(null);
    setContentBriefs(null);
    try {
      const res = await fetch("/api/gap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand,
          competitors: competitors.filter((c) => c.name && c.domain),
          prompts,
          engines,
          pageUrls,
        }),
      });
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analiz başarısız oldu");
      setSummaries(data.summaries);
      setGapMatrix(data.gapMatrix);
      setContentBriefs(data.contentBriefs);
      setDemoMode(data.demoMode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Breadcrumb items={[{ label: "Ana Sayfa", href: "/" }, { label: "Gap Analysis" }]} />
        <h1 className="text-2xl font-semibold">Gap Analysis</h1>
        <p className="text-ink/60 text-sm">
          SEO + AXO denetiminizi GEO görünürlük testiyle çaprazlar: listelediğiniz her sayfa teknik olarak sağlam
          mı, AI crawler&apos;lara açık mı — ve ikisinin tek başına cevaplayamadığı soru: herhangi bir AI motoru
          bu sayfayı gerçekten anıyor mu?
        </p>
        <UsageMeter metric="engineQueries" />
      </div>

      <form onSubmit={runAnalysis} className="space-y-5">
        <div className="card space-y-3">
          <h2 className="font-medium text-sm">Markanız</h2>
          <div className="grid grid-cols-2 gap-3">
            <input
              value={brand.name}
              onChange={(e) => setBrand((b) => ({ ...b, name: e.target.value }))}
              placeholder="Marka adı"
              required
              className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <input
              value={brand.domain}
              onChange={(e) => setBrand((b) => ({ ...b, domain: e.target.value }))}
              placeholder="marka-domaini.com"
              required
              className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
        </div>

        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-sm">Rakipler (opsiyonel)</h2>
            <button
              type="button"
              onClick={() => setCompetitors((c) => [...c, { name: "", domain: "" }])}
              className="text-xs text-accent hover:underline"
            >
              + Rakip ekle
            </button>
          </div>
          {competitors.map((c, i) => (
            <div key={i} className="grid grid-cols-2 gap-3">
              <input
                value={c.name}
                onChange={(e) => updateCompetitor(i, "name", e.target.value)}
                placeholder="Rakip adı"
                className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <input
                value={c.domain}
                onChange={(e) => updateCompetitor(i, "domain", e.target.value)}
                placeholder="rakip-domaini.com"
                className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
          ))}
        </div>

        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-sm">Promptlar (satır satır)</h2>
            <div className="flex gap-2 text-xs">
              <button type="button" onClick={() => setPromptsText(EN_PROMPT_PRESET)} className="text-accent hover:underline">
                EN örnek
              </button>
              <span className="text-ink/20">·</span>
              <button type="button" onClick={() => setPromptsText(TR_PROMPT_PRESET)} className="text-accent hover:underline">
                TR örnek
              </button>
            </div>
          </div>
          <textarea
            value={promptsText}
            onChange={(e) => setPromptsText(e.target.value)}
            rows={4}
            className="w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent font-mono"
          />
        </div>

        <div className="card space-y-3">
          <h2 className="font-medium text-sm">Denetlenecek kritik sayfalarınız (satır satır URL)</h2>
          <textarea
            value={pageUrlsText}
            onChange={(e) => setPageUrlsText(e.target.value)}
            rows={3}
            placeholder={"sizindomaininiz.com\nsizindomaininiz.com/blog/en-iyi-yaziniz"}
            className="w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent font-mono"
          />
        </div>

        <div className="card space-y-3">
          <h2 className="font-medium text-sm">Motorlar</h2>
          <div className="flex flex-wrap gap-4 text-sm">
            {(Object.keys(ENGINE_LABEL) as EngineId[]).map((eng) => (
              <label key={eng} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={engines.includes(eng)}
                  onChange={(e) =>
                    setEngines((prev) =>
                      e.target.checked ? [...prev, eng] : prev.filter((x) => x !== eng)
                    )
                  }
                />
                {ENGINE_LABEL[eng]}
              </label>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-accent text-white px-5 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? "Analiz ediliyor…" : `${pageUrls.length || 0} sayfayı ${prompts.length} prompta karşı analiz et`}
        </button>
      </form>

      {error && <div className="card border-danger/40 text-danger text-sm">{error}</div>}

      {demoMode && gapMatrix && (
        <div className="card border-warn/40 text-warn text-sm">
          <strong>Demo modda</strong> çalışıyor — GEO atıfları domain/anasayfa seviyesinde simüle edilir, bu yüzden
          domain genel olarak anılıyor olsa bile derin sayfalarda genelde 0 tam-URL atfı görürsünüz. Gerçek sayfa
          yollu atıflar için <code>.env</code>&apos;e gerçek API anahtarları ekleyin.
        </div>
      )}

      {gapMatrix && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <input
            value={agencyName}
            onChange={(e) => setAgencyName(e.target.value)}
            placeholder="Ajans adınız (opsiyonel — PDF'te görünür)"
            className="w-64 rounded-lg bg-panel border border-border px-3 py-1.5 text-xs outline-none focus:border-accent"
          />
          <button
            onClick={downloadPdf}
            className="text-xs rounded-lg border border-border px-3 py-1.5 hover:bg-muted text-ink/70"
          >
            PDF rapor indir
          </button>
        </div>
      )}

      {summaries && (
        <div className="space-y-3">
          <h2 className="font-medium">Görünürlük özeti</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {summaries.map((s) => (
              <StatCard
                key={s.brand}
                label={s.brand}
                value={`${Math.round(s.visibility * 100)}%`}
                description={`Pazar payı ${Math.round(s.shareOfVoice * 100)}%`}
                tone={s.rank === 1 ? "seo" : "accent"}
              />
            ))}
          </div>
        </div>
      )}

      {gapMatrix && (
        <div className="card">
          <h2 className="font-medium">Gap matrisi</h2>
          <p className="text-sm text-ink/50 mb-4">Her sayfa için teknik sağlık ile gerçek AI atfının karşılaştırması.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-ink/40 text-left">
                <tr>
                  <th className="py-2 pr-4">Sayfa</th>
                  <th className="py-2 pr-4">SEO</th>
                  <th className="py-2 pr-4">AXO</th>
                  <th className="py-2 pr-4">Engellenen bot</th>
                  <th className="py-2 pr-4">Anıldı (sayfa)</th>
                  <th className="py-2 pr-4">Anıldı (domain)</th>
                  <th className="py-2 pr-4">Değerlendirme</th>
                </tr>
              </thead>
              <tbody>
                {gapMatrix.map((row) => (
                  <tr key={row.url} className="border-t border-border">
                    <td className="py-2 pr-4 max-w-[220px] truncate" title={row.url}>{row.url}</td>
                    <td className="py-2 pr-4">{row.seoScore}</td>
                    <td className="py-2 pr-4">{row.aiCrawlScore}</td>
                    <td className="py-2 pr-4">{row.blockedBots || "—"}</td>
                    <td className="py-2 pr-4">{row.citedExact}</td>
                    <td className="py-2 pr-4">{row.citedDomain}</td>
                    <td className="py-2 pr-4">
                      <span className={`badge ${VERDICT_BADGE[row.verdict]}`}>{VERDICT_LABEL[row.verdict]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-ink/30">
            "Sağlam ama görünmez" = SEO/AXO skorları iyi, engelli değil, ama bu koşuda hiçbir AI motoru sayfayı
            anmadı — teknik olarak hazır ama henüz atıf kazanmayan sayfa. Bunun sebebi genelde içerik biçimidir
            (yeterince "cevap-önce" değil, FAQ schema yok), teknik bir sorun değil — denetimin Düzeltmeler
            bölümüne bakın.
          </p>
        </div>
      )}

      {contentBriefs && contentBriefs.length > 0 && (
        <div className="space-y-3">
          <div>
            <h2 className="font-medium">İçerik brifleri</h2>
            <p className="text-sm text-ink/50">
              Henüz kazanmayan her sayfa için: bu koşuda kaybettiği promptlar ve denetimin bulduğu somut içerik
              eksikleri. Bu koşunun kendi verisinden üretildi — hiçbir şey uydurulmadı.
            </p>
          </div>
          <div className="space-y-3">
            {contentBriefs.map((brief) => (
              <div key={brief.url} className="card space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm font-medium truncate" title={brief.url}>{brief.url}</div>
                  <span className={`badge ${VERDICT_BADGE[brief.verdict]}`}>{VERDICT_LABEL[brief.verdict]}</span>
                </div>
                <p className="text-xs text-ink/50">{brief.reason}</p>

                {brief.contentGaps.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-ink/60 mb-1">İçerik eksikleri</div>
                    <ul className="text-xs text-ink/60 space-y-1 list-disc list-inside">
                      {brief.contentGaps.map((g, i) => (
                        <li key={i}>{g}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {brief.suggestedHeadings.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-ink/60 mb-1">
                      Bu markanın kazanmadığı promptlar — bunları başlık/FAQ maddelerine dönüştürün
                    </div>
                    <ul className="text-xs text-accent space-y-1 list-disc list-inside">
                      {brief.suggestedHeadings.map((h, i) => (
                        <li key={i}>{h}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <PromptBlock
                  bare
                  title="Fix with Claude Code"
                  description="Bu sayfanın tam eksikleriyle önceden doldurulmuş bir prompt — sitenizin reposunda çalışan Claude Code'a yapıştırın."
                  prompt={buildContentBriefPrompt(brief, brand.name)}
                />

                <div className="border-t border-border pt-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-ink/50">
                    Ya da Epicsem sizin için taslak hazırlasın — yalnızca bu brifin gerçek verisine dayanır,
                    incelemeniz için bir WordPress taslağı olarak yayınlanır, asla otomatik yayınlanmaz.
                  </p>
                  <button
                    type="button"
                    onClick={() => generateArticle(brief)}
                    disabled={generatingUrl === brief.url}
                    className="text-xs rounded-lg bg-accent text-white px-3 py-1.5 hover:opacity-90 disabled:opacity-50 shrink-0"
                  >
                    {generatingUrl === brief.url ? "Oluşturuluyor…" : "Makale oluştur"}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {generateError && <div className="card border-danger/40 text-danger text-sm">{generateError}</div>}
        </div>
      )}

      <ExampleScenario heading="Bir mobilya markası 'sağlam ama görünmez' sayfasını buluyor" steps={SCENARIO_STEPS} />

      <FAQSection items={FAQ_ITEMS} />
    </div>
  );
}
