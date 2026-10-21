/**
 * Google PageSpeed Insights v5 — tek çağrıda hem gerçek kullanıcı verisi (Chrome UX Report,
 * son 28 gün, 75. yüzdelik) hem laboratuvar ölçümü (Lighthouse) döner. Anahtar isteğe bağlı.
 * Kaynak fikir: claude-seo (AgriciDaniel, MIT) Google API katmanı.
 */

export type CwvCategory = "FAST" | "AVERAGE" | "SLOW" | null;

export interface CwvMetric {
  key: "LCP" | "INP" | "CLS" | "FCP" | "TTFB";
  label: string;
  /** 75. yüzdelik değer — LCP/INP/FCP/TTFB ms, CLS birimsiz. */
  p75: number | null;
  category: CwvCategory;
  good: string;
}

export interface PageSpeedResult {
  url: string;
  strategy: "mobile" | "desktop";
  /** Gerçek kullanıcı verisi hangi düzeyde: sayfa, tüm site (origin) ya da yok. */
  fieldScope: "url" | "origin" | "none";
  overall: CwvCategory;
  passed: boolean | null;
  metrics: CwvMetric[];
  labScore: number | null;
  lab: { lcpMs: number | null; tbtMs: number | null; cls: number | null; fcpMs: number | null; si: number | null };
  opportunities: { title: string; savingsMs: number }[];
  fetchedAt: string;
}

const FIELD_KEYS: [CwvMetric["key"], string, string, string][] = [
  ["LCP", "LARGEST_CONTENTFUL_PAINT_MS", "Ana içeriğin yüklenmesi (LCP)", "≤ 2,5 sn"],
  ["INP", "INTERACTION_TO_NEXT_PAINT", "Tıklamaya tepki (INP)", "≤ 200 ms"],
  ["CLS", "CUMULATIVE_LAYOUT_SHIFT_SCORE", "Sayfa kayması (CLS)", "≤ 0,1"],
  ["FCP", "FIRST_CONTENTFUL_PAINT_MS", "İlk görüntü (FCP)", "≤ 1,8 sn"],
  ["TTFB", "EXPERIMENTAL_TIME_TO_FIRST_BYTE", "Sunucu yanıtı (TTFB)", "≤ 0,8 sn"],
];

export async function runPageSpeed(url: string, opts: { strategy?: "mobile" | "desktop"; apiKey?: string | null } = {}): Promise<PageSpeedResult> {
  const strategy = opts.strategy ?? "mobile";
  const qs = new URLSearchParams({ url, strategy, category: "performance", locale: "tr" });
  const key = opts.apiKey || process.env.GOOGLE_PSI_API_KEY;
  if (key) qs.set("key", key);
  const r = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${qs}`, { signal: AbortSignal.timeout(90_000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j?.error?.message ?? `HTTP ${r.status}`;
    if (r.status === 429) throw new Error("PageSpeed kotası doldu — Entegrasyonlar'dan kendi ücretsiz Google API anahtarını ekle.");
    throw new Error(`PageSpeed: ${String(msg).slice(0, 200)}`);
  }
  const le = j.loadingExperience?.metrics ? j.loadingExperience : null;
  const ole = j.originLoadingExperience?.metrics ? j.originLoadingExperience : null;
  const field = le && le.origin_fallback !== true ? le : ole;
  const fieldScope: PageSpeedResult["fieldScope"] = le && le.origin_fallback !== true ? "url" : ole ? "origin" : "none";
  const metrics: CwvMetric[] = FIELD_KEYS.map(([k, apiKey, label, good]) => {
    const m = field?.metrics?.[apiKey];
    let p75: number | null = m?.percentile ?? null;
    if (k === "CLS" && p75 !== null) p75 = p75 / 100; // API CLS'i 100 ile çarpılmış verir
    return { key: k, label, p75, category: (m?.category as CwvCategory) ?? null, good };
  });
  const core = metrics.filter((m) => m.key === "LCP" || m.key === "INP" || m.key === "CLS");
  const passed = core.every((m) => m.category) ? core.every((m) => m.category === "FAST") : null;
  const audits = j.lighthouseResult?.audits ?? {};
  const num = (id: string) => (typeof audits[id]?.numericValue === "number" ? Math.round(audits[id].numericValue * (id === "cumulative-layout-shift" ? 1000 : 1)) / (id === "cumulative-layout-shift" ? 1000 : 1) : null);
  const opportunities = Object.values<any>(audits)
    .filter((a) => a?.details?.type === "opportunity" && (a.details.overallSavingsMs ?? 0) >= 100)
    .map((a) => ({ title: String(a.title), savingsMs: Math.round(a.details.overallSavingsMs) }))
    .sort((a, b) => b.savingsMs - a.savingsMs)
    .slice(0, 6);
  const score = j.lighthouseResult?.categories?.performance?.score;
  return {
    url,
    strategy,
    fieldScope,
    overall: (field?.overall_category as CwvCategory) ?? null,
    passed,
    metrics,
    labScore: typeof score === "number" ? Math.round(score * 100) : null,
    lab: { lcpMs: num("largest-contentful-paint"), tbtMs: num("total-blocking-time"), cls: num("cumulative-layout-shift"), fcpMs: num("first-contentful-paint"), si: num("speed-index") },
    opportunities,
    fetchedAt: new Date().toISOString(),
  };
}
