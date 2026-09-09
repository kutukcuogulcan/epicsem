"use client";

import { useState } from "react";
import type { ArticleAuditResult, ArticleSchemaStatus } from "@/types";
import ToolPageHeader from "@/components/ToolPageHeader";
import UsageMeter from "@/components/UsageMeter";
import PromptBlock from "@/components/PromptBlock";
import FAQSection from "@/components/FAQSection";
import ExampleScenario from "@/components/ExampleScenario";

const SCENARIO_STEPS = [
  {
    title: "Bir sayfa URL'i girilir",
    body: "Denetlenecek tek bir sayfa — örneğin yeni yayınlanan bir blog yazısı veya ürün sayfası.",
  },
  {
    title: "Sayfa gerçekten taranır",
    body: "Title, meta açıklama, canonical, görsellerin alt metni, internal linkler ve varsa mevcut schema — hepsi sayfanın kendi HTML'inden çekilir.",
  },
  {
    title: "Model, sadece taranan veriyle çalışır",
    body: "Karakter sayısı kurallarına göre title/meta önerisi, eksik alt metinler, kaçırılmış internal link fırsatları ve FAQ/Article schema — hiçbiri sayfada olmayan bir şeyi uydurmaz.",
  },
  {
    title: "Somut makale önerileri çıkar",
    body: "Bulunan boşluklara (kaçırılmış link fırsatları, eksik içerik) dayanarak 2-4 yeni makale fikri — başlık, hedef anahtar kelime, açı ve taslak başlıklarıyla.",
  },
];

const FAQ_ITEMS = [
  {
    q: "Bu araç /audit'ten farkı ne?",
    a: "/audit teknik/deterministik bir tarama — kod tabanlı kurallarla title/meta/schema var mı yok mu kontrol eder, ücretsizdir. Article Writer bir yapay zeka modeline sayfanın gerçek içeriğini gönderip metin kalitesini değerlendirir (karakter sayısı, alt metin kalitesi, kaçırılan link fırsatları) ve üstüne somut makale önerileri üretir — bu yüzden aylık kullanım kotanıza dahildir.",
  },
  {
    q: "Öneriler uyduruluyor mu?",
    a: "Hayır. Model yalnızca sayfadan gerçekten çekilen veriyle çalışır — sayfayı kendisi taramaz, taramayı araç yapar ve sonucu modele verir. Makale önerileri de yalnızca bu taramada bulunan gerçek boşluklara dayanır.",
  },
  {
    q: "FAQ/Article schema JSON-LD'sini nereye yapıştırıyorum?",
    a: "Üretilen JSON-LD bloğunu kopyalayıp sayfanızın <head> kısmına bir <script type=\"application/ld+json\"> etiketi içinde ekleyin. Sayfada zaten bir schema varsa araç bunu doğrulayıp uyumsuzlukları işaretler, üstüne yenisini eklemenizi önermez.",
  },
  {
    q: "Neden bazen 'demo modu' görüyorum?",
    a: "Bu özellik gerçek bir yapay zeka modeli çağırır — ANTHROPIC_API_KEY veya OPENAI_API_KEY bağlı değilse araç bunu açıkça 'demo modu' olarak işaretler ve hiçbir öneriyi gerçekmiş gibi göstermez.",
  },
];

const SCHEMA_STATUS_LABEL: Record<ArticleSchemaStatus, string> = {
  "present-valid": "Mevcut ve doğru",
  "present-mismatch": "Mevcut ama uyumsuz",
  missing: "Eksik",
  "not-applicable": "Bu sayfa için geçerli değil",
};

function SchemaStatusBadge({ status }: { status: ArticleSchemaStatus }) {
  const cls =
    status === "present-valid"
      ? "bg-seo/10 text-seo"
      : status === "missing"
      ? "bg-danger/10 text-danger"
      : status === "present-mismatch"
      ? "bg-warn/10 text-warn"
      : "bg-muted text-ink/50";
  return <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${cls}`}>{SCHEMA_STATUS_LABEL[status]}</span>;
}

export default function ArticleWriterPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ArticleAuditResult | null>(null);

  async function runAnalysis(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) {
      setError("Denetlenecek bir sayfa URL'i girin.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/article-writer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analiz başarısız oldu");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <ToolPageHeader
        breadcrumbLabel="Article Writer"
        title="Article Writer"
        body="Tek bir sayfayı derinlemesine denetler — title, meta, canonical, görsel alt metni, internal link fırsatları, FAQ/Article schema — ve bulunan boşluklara göre somut makale önerileri üretir. /audit'in ücretsiz teknik taramasından farklı olarak bir yapay zeka modeli çalıştırır."
      >
        <UsageMeter metric="contentGenerations" />
      </ToolPageHeader>

      <form onSubmit={runAnalysis} className="flex gap-3">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="example.com/blog/bir-yazi"
          required
          className="flex-1 rounded-lg bg-panel border border-border px-4 py-2.5 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-accent text-white px-5 py-2.5 text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? "Analiz ediliyor…" : "Analizi başlat"}
        </button>
      </form>

      {error && <div className="card border-danger/40 text-danger text-sm">{error}</div>}

      {result && (
        <div className="space-y-8">
          {result.demoMode && (
            <div className="card border-warn/40 text-warn text-sm">
              Demo modu — gerçek bir model API anahtarı bağlı değil, aşağıdaki öneriler [DEMO DATA] olarak işaretlendi.
            </div>
          )}

          <div className="card space-y-1 text-sm text-ink/60">
            <div><span className="text-ink/40">URL:</span> {result.url}</div>
            <div><span className="text-ink/40">Sayfa tipi:</span> {result.pageType || "—"}</div>
            <div><span className="text-ink/40">Arama niyeti:</span> {result.searchIntent || "—"}</div>
            <div><span className="text-ink/40">Hedef anahtar kelime:</span> {result.targetKeyword || "—"}</div>
            <div><span className="text-ink/40">Model:</span> {result.model}</div>
          </div>

          <div className="card space-y-3">
            <h2 className="font-bold">1. Sayfa Başlığı (Title)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-muted p-3">
                <div className="text-xs text-ink/40 mb-1">Mevcut ({result.title.currentLength} karakter)</div>
                <div>{result.title.current || "(boş)"}</div>
              </div>
              <div className="rounded-lg bg-accent/[0.06] border border-accent/20 p-3">
                <div className="text-xs text-accent/70 mb-1">Önerilen ({result.title.suggestedLength} karakter)</div>
                <div>{result.title.suggested || "—"}</div>
              </div>
            </div>
            {result.title.why && <p className="text-sm text-ink/60">→ {result.title.why}</p>}
          </div>

          <div className="card space-y-3">
            <h2 className="font-bold">2. Meta Açıklaması</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-muted p-3">
                <div className="text-xs text-ink/40 mb-1">Mevcut</div>
                <div>{result.metaDescription.current || "(boş)"}</div>
              </div>
              <div className="rounded-lg bg-accent/[0.06] border border-accent/20 p-3">
                <div className="text-xs text-accent/70 mb-1">Önerilen</div>
                <div>{result.metaDescription.suggested || "—"}</div>
              </div>
            </div>
            {result.metaDescription.why && <p className="text-sm text-ink/60">→ {result.metaDescription.why}</p>}
          </div>

          <div className="card space-y-3">
            <h2 className="font-bold">3. Canonical URL</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-muted p-3">
                <div className="text-xs text-ink/40 mb-1">Mevcut</div>
                <div>{result.canonical.current || "(yok)"}</div>
              </div>
              <div className="rounded-lg bg-accent/[0.06] border border-accent/20 p-3">
                <div className="text-xs text-accent/70 mb-1">Önerilen</div>
                <div>{result.canonical.suggested || "—"}</div>
              </div>
            </div>
            {result.canonical.why && <p className="text-sm text-ink/60">→ {result.canonical.why}</p>}
          </div>

          <div className="card space-y-3">
            <h2 className="font-bold">
              4. Görsel Alt Metinleri
              <span className="ml-2 text-xs font-normal text-ink/40">
                {result.imagesTotal} görsel bulundu{result.imagesSkipped > 0 ? `, ${result.imagesSkipped} tanesi atlandı` : ""}
              </span>
            </h2>
            {result.imageAlts.length === 0 ? (
              <p className="text-sm text-ink/50">Sorun bulunamadı — tüm görsellerin alt metni uygun görünüyor.</p>
            ) : (
              <div className="space-y-2">
                {result.imageAlts.map((img, i) => (
                  <div key={i} className="rounded-lg bg-muted p-3 text-sm space-y-1">
                    <div className="text-xs text-ink/40 truncate">{img.src}</div>
                    <div><span className="text-ink/40">Mevcut:</span> {img.currentAlt || "(eksik)"}</div>
                    <div className="text-accent">→ {img.suggestedAlt}</div>
                    {img.why && <div className="text-xs text-ink/40">{img.why}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card space-y-3">
            <h2 className="font-bold">5. Internal Linkler</h2>
            {result.linkIssues.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-semibold text-ink/70">Mevcut linklerde sorun</div>
                {result.linkIssues.map((link, i) => (
                  <div key={i} className="rounded-lg bg-muted p-3 text-sm space-y-1">
                    <div><span className="text-ink/40">Anchor:</span> "{link.anchorText}" → {link.targetUrl}</div>
                    <div className="text-warn">{link.issue}</div>
                    <div className="text-accent">→ önerilen: "{link.suggestedAnchor}"</div>
                  </div>
                ))}
              </div>
            )}
            {result.missingLinks.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-semibold text-ink/70">Kaçırılmış link fırsatları</div>
                {result.missingLinks.map((link, i) => (
                  <div key={i} className="rounded-lg bg-accent/[0.06] border border-accent/20 p-3 text-sm space-y-1">
                    <div className="italic text-ink/60">"…{link.context}…"</div>
                    <div><span className="text-ink/40">Önerilen anchor:</span> "{link.suggestedAnchor}" → {link.suggestedTargetUrlPattern}</div>
                    {link.why && <div className="text-xs text-ink/40">{link.why}</div>}
                  </div>
                ))}
              </div>
            )}
            {result.linkIssues.length === 0 && result.missingLinks.length === 0 && (
              <p className="text-sm text-ink/50">Sorun veya kaçırılmış fırsat bulunamadı.</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="card space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-bold">6. FAQ Schema</h2>
                <SchemaStatusBadge status={result.faqSchema.status} />
              </div>
              {result.faqSchema.note && <p className="text-sm text-ink/60">{result.faqSchema.note}</p>}
              {result.faqSchema.jsonLd && (
                <PromptBlock title="FAQPage JSON-LD" prompt={result.faqSchema.jsonLd} bare />
              )}
            </div>
            <div className="card space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-bold">7. Article Schema</h2>
                <SchemaStatusBadge status={result.articleSchema.status} />
              </div>
              {result.articleSchema.note && <p className="text-sm text-ink/60">{result.articleSchema.note}</p>}
              {result.articleSchema.jsonLd && (
                <PromptBlock title="Article JSON-LD" prompt={result.articleSchema.jsonLd} bare />
              )}
            </div>
          </div>

          {result.articleRecommendations.length > 0 && (
            <div className="space-y-3">
              <div>
                <h2 className="font-bold">8. Makale Önerileri</h2>
                <p className="text-sm text-ink/50">Yukarıda bulunan boşluklara dayanarak — uydurma konu değil.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {result.articleRecommendations.map((rec, i) => (
                  <div key={i} className="card space-y-2">
                    <div className="font-semibold text-sm">{rec.title}</div>
                    <div className="text-xs text-ink/40">Hedef kelime: {rec.targetKeyword}</div>
                    <p className="text-sm text-ink/60">{rec.angle}</p>
                    <ul className="text-sm text-ink/60 list-disc pl-4 space-y-0.5">
                      {rec.outline.map((o, j) => (
                        <li key={j}>{o}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.priorityActions.length > 0 && (
            <div className="card space-y-2">
              <h2 className="font-bold">9. Öncelik Sırası</h2>
              <ol className="space-y-1.5 text-sm">
                {result.priorityActions.map((action, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-muted text-ink/50 text-xs font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span>{action}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      <ExampleScenario heading="Yeni yayınlanan bir blog yazısı Article Writer'dan geçiyor" steps={SCENARIO_STEPS} />

      <FAQSection items={FAQ_ITEMS} />
    </div>
  );
}
