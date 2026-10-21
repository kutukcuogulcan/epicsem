/**
 * Bing Webmaster Tools API (JSON). Kullanıcının kendi API anahtarıyla çalışır.
 * Belgeler: learn.microsoft.com/en-us/bingwebmaster/getting-started
 */
const BASE = "https://ssl.bing.com/webmaster/api.svc/json";

/** "/Date(1399014000000-0700)/" → ISO gün */
function msDate(v: unknown): string | null {
  const m = String(v ?? "").match(/Date\((-?\d+)/);
  return m ? new Date(Number(m[1])).toISOString().slice(0, 10) : null;
}

async function call(apiKey: string, method: string, params: Record<string, string> = {}, body?: unknown) {
  const qs = new URLSearchParams({ ...params, apikey: apiKey });
  const r = await fetch(`${BASE}/${method}?${qs}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json; charset=utf-8" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ErrorCode) {
    const msg = j.Message || j.message || `HTTP ${r.status}`;
    if (r.status === 401 || /InvalidApiKey|NotAuthorized/i.test(String(msg))) throw new Error("Bing API anahtarı geçersiz.");
    throw new Error(`Bing: ${String(msg).slice(0, 200)}`);
  }
  return j.d;
}

export async function bingSites(apiKey: string): Promise<{ url: string; verified: boolean }[]> {
  const d = (await call(apiKey, "GetUserSites")) ?? [];
  return d.map((s: any) => ({ url: String(s.Url), verified: !!s.IsVerified }));
}

export async function bingTraffic(apiKey: string, siteUrl: string): Promise<{ date: string; clicks: number; impressions: number }[]> {
  const d = (await call(apiKey, "GetRankAndTrafficStats", { siteUrl })) ?? [];
  return d
    .map((x: any) => ({ date: msDate(x.Date) ?? "", clicks: Number(x.Clicks ?? 0), impressions: Number(x.Impressions ?? 0) }))
    .filter((x: { date: string }) => x.date)
    .sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date));
}

export interface BingQuery {
  query: string;
  clicks: number;
  impressions: number;
  position: number | null;
}

export async function bingQueries(apiKey: string, siteUrl: string): Promise<BingQuery[]> {
  const d = (await call(apiKey, "GetQueryStats", { siteUrl })) ?? [];
  const agg = new Map<string, { clicks: number; impressions: number; posSum: number; posN: number }>();
  for (const x of d) {
    const q = String(x.Query ?? "").trim();
    if (!q) continue;
    const a = agg.get(q) ?? { clicks: 0, impressions: 0, posSum: 0, posN: 0 };
    a.clicks += Number(x.Clicks ?? 0);
    a.impressions += Number(x.Impressions ?? 0);
    const pos = Number(x.AvgImpressionPosition ?? x.AvgClickPosition ?? 0);
    if (pos > 0) {
      a.posSum += pos * Math.max(1, Number(x.Impressions ?? 1));
      a.posN += Math.max(1, Number(x.Impressions ?? 1));
    }
    agg.set(q, a);
  }
  return [...agg.entries()]
    .map(([query, a]) => ({ query, clicks: a.clicks, impressions: a.impressions, position: a.posN ? Math.round((a.posSum / a.posN) * 10) / 10 : null }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 300);
}

export async function bingUrlQuota(apiKey: string, siteUrl: string): Promise<{ daily: number; monthly: number }> {
  const d = (await call(apiKey, "GetUrlSubmissionQuota", { siteUrl })) ?? {};
  return { daily: Number(d.DailyQuota ?? 0), monthly: Number(d.MonthlyQuota ?? 0) };
}

export async function bingSubmitUrls(apiKey: string, siteUrl: string, urls: string[]): Promise<number> {
  const list = [...new Set(urls)].slice(0, 500);
  await call(apiKey, "SubmitUrlBatch", {}, { siteUrl, urlList: list });
  return list.length;
}
