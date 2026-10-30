import { getIntegration } from "./db";
import type { ProviderId } from "./integration-providers";
import { bingSites } from "./bing";
import { verifyKeyFile } from "./indexnow";
import { ahrefsFreeDR } from "./backlinks";

/**
 * Dış servis istemcileri (sunucu tarafı). Anahtarlar kullanıcının /integrations sayfasında
 * girdiği değerlerden okunur; SerpApi için kullanıcı anahtarı yoksa ortam değişkeni kullanılır.
 */

const T = (ms: number) => AbortSignal.timeout(ms);

// ---------- SerpApi ----------
export async function serpKeyFor(userId: number): Promise<string | null> {
  const i = await getIntegration(userId, "serpapi").catch(() => null);
  return i?.secrets.apiKey || process.env.SERPAPI_API_KEY || null;
}

// ---------- SerpBear ----------
export interface SerpBearKeyword {
  ID: number;
  keyword: string;
  device: string;
  country: string;
  domain: string;
  lastUpdated: string;
  position: number;
  history: Record<string, number>;
  url: string;
  lastUpdateError?: string | false;
}

async function serpbearCfg(userId: number) {
  const i = await getIntegration(userId, "serpbear");
  if (!i?.config.baseUrl || !i.secrets.apiKey) throw new Error("SerpBear bağlı değil — Entegrasyonlar sayfasından adres ve API anahtarı gir.");
  return { base: i.config.baseUrl.replace(/\/+$/, ""), key: i.secrets.apiKey };
}

async function sbFetch(base: string, key: string, path: string, init: RequestInit = {}) {
  const r = await fetch(`${base}${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, signal: T(30_000) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error("SerpBear API anahtarı geçersiz.");
  if (!r.ok || j.error) throw new Error(`SerpBear: ${j.error || `HTTP ${r.status}`}`);
  return j;
}

export async function serpbearDomains(base: string, key: string): Promise<{ domain: string; keywordCount: number }[]> {
  const j = await sbFetch(base, key, "/api/domains");
  return (j.domains ?? []).map((d: any) => ({ domain: String(d.domain), keywordCount: Number(d.keywordCount ?? 0) }));
}

export async function serpbearKeywords(userId: number, domain?: string): Promise<SerpBearKeyword[]> {
  const { base, key } = await serpbearCfg(userId);
  const domains = domain ? [domain] : (await serpbearDomains(base, key)).map((d) => d.domain);
  const out: SerpBearKeyword[] = [];
  for (const d of domains.slice(0, 30)) {
    const j = await sbFetch(base, key, `/api/keywords?domain=${encodeURIComponent(d)}`);
    out.push(...(j.keywords ?? []));
  }
  return out;
}

/** SerpBear'a tüm kelimeleri (ya da bir domaini) yeniden taratır — tarama SerpBear'da arka planda sürer. */
export async function serpbearRefresh(userId: number, domain: string): Promise<number> {
  const { base, key } = await serpbearCfg(userId);
  const j = await sbFetch(base, key, `/api/refresh?id=all&domain=${encodeURIComponent(domain)}`, { method: "POST" });
  return (j.keywords ?? []).length;
}

// ---------- ogimg ----------
export async function ogimgAvailable(userId: number): Promise<boolean> {
  return !!(await getIntegration(userId, "ogimg").catch(() => null));
}

export async function ogimgImage(userId: number, p: { title: string; siteName?: string; description?: string }): Promise<Buffer> {
  const i = await getIntegration(userId, "ogimg");
  const qs = new URLSearchParams({ title: p.title.slice(0, 140), template: i?.config.template || "gradient" });
  if (p.siteName) qs.set("siteName", p.siteName.slice(0, 60));
  if (p.description) qs.set("description", p.description.slice(0, 160));
  if (i?.config.accentColor && /^#?[0-9a-f]{3,8}$/i.test(i.config.accentColor)) qs.set("accentColor", i.config.accentColor.startsWith("#") ? i.config.accentColor : `#${i.config.accentColor}`);
  const headers: Record<string, string> = {};
  if (i?.secrets.apiKey) headers.Authorization = `Bearer ${i.secrets.apiKey}`;
  const r = await fetch(`https://ogimg.xyz/api/og?${qs}`, { headers, signal: T(20_000) });
  if (r.status === 429) throw new Error("ogimg aylık görsel limitine ulaşıldı.");
  if (!r.ok || !/image/i.test(r.headers.get("content-type") ?? "image/png")) throw new Error(`ogimg: HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// ---------- Google Ads (Keyword Planner) ----------
const ADS_API_VERSION = process.env.GOOGLE_ADS_API_VERSION || "v24";
/** Dil ve ülke sabitleri (Google Ads languageConstants / geoTargetConstants). */
const LANG: Record<string, string> = { tr: "1037", en: "1000", de: "1001", fr: "1002", es: "1003", ar: "1019" };
const GEO: Record<string, string> = { TR: "2792", US: "2840", GB: "2826", DE: "2276", FR: "2250", NL: "2528", AZ: "2031", SA: "2682", AE: "2784" };

export interface KeywordVolume {
  keyword: string;
  avgMonthlySearches: number | null;
  competition: "LOW" | "MEDIUM" | "HIGH" | null;
  competitionIndex: number | null;
  lowBid: number | null;
  highBid: number | null;
}

async function adsAccessToken(cfg: { clientId: string; clientSecret: string; refreshToken: string }): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: cfg.refreshToken }),
    signal: T(15_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Google OAuth: ${j.error_description || j.error || `HTTP ${r.status}`}`);
  return j.access_token;
}

export async function adsAvailable(userId: number): Promise<boolean> {
  const i = await getIntegration(userId, "google_ads").catch(() => null);
  return !!(i?.secrets.developerToken && i.secrets.refreshToken && i.config.customerId);
}

/**
 * Keyword Planner: tohum kelimelerden fikir + hacim (generateKeywordIdeas).
 * `keywords` en fazla 20 tohum; dönen her fikir aylık ortalama arama hacmi taşır.
 */
export async function adsKeywordIdeas(userId: number, keywords: string[], lang = "tr", country = "TR"): Promise<KeywordVolume[]> {
  const i = await getIntegration(userId, "google_ads");
  if (!i) throw new Error("Google Keyword Planner bağlı değil.");
  const { developerToken, clientSecret, refreshToken } = i.secrets;
  const { clientId, customerId, loginCustomerId } = i.config;
  if (!developerToken || !clientId || !clientSecret || !refreshToken || !customerId) throw new Error("Google Ads bilgileri eksik.");
  const token = await adsAccessToken({ clientId, clientSecret, refreshToken });
  const cid = customerId.replace(/\D/g, "");
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, "developer-token": developerToken, "Content-Type": "application/json" };
  if (loginCustomerId) headers["login-customer-id"] = loginCustomerId.replace(/\D/g, "");
  const body = {
    language: `languageConstants/${LANG[lang.toLowerCase()] ?? LANG.en}`,
    geoTargetConstants: [`geoTargetConstants/${GEO[country.toUpperCase()] ?? GEO.TR}`],
    keywordPlanNetwork: "GOOGLE_SEARCH",
    includeAdultKeywords: false,
    keywordSeed: { keywords: keywords.slice(0, 20) },
    pageSize: 1000,
  };
  const r = await fetch(`https://googleads.googleapis.com/${ADS_API_VERSION}/customers/${cid}:generateKeywordIdeas`, { method: "POST", headers, body: JSON.stringify(body), signal: T(40_000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = Array.isArray(j) ? j[0]?.error : j.error;
    const detail = err?.details?.[0]?.errors?.[0]?.message || err?.message || `HTTP ${r.status}`;
    throw new Error(`Google Ads: ${detail}`);
  }
  const micros = (v: unknown) => (v == null ? null : Math.round(Number(v) / 10_000) / 100);
  return (j.results ?? []).map((x: any) => ({
    keyword: String(x.text ?? "").toLocaleLowerCase(lang === "tr" ? "tr" : "en"),
    avgMonthlySearches: x.keywordIdeaMetrics?.avgMonthlySearches != null ? Number(x.keywordIdeaMetrics.avgMonthlySearches) : null,
    competition: x.keywordIdeaMetrics?.competition && x.keywordIdeaMetrics.competition !== "UNSPECIFIED" && x.keywordIdeaMetrics.competition !== "UNKNOWN" ? x.keywordIdeaMetrics.competition : null,
    competitionIndex: x.keywordIdeaMetrics?.competitionIndex != null ? Number(x.keywordIdeaMetrics.competitionIndex) : null,
    lowBid: micros(x.keywordIdeaMetrics?.lowTopOfPageBidMicros),
    highBid: micros(x.keywordIdeaMetrics?.highTopOfPageBidMicros),
  }));
}

// ---------- bağlantı testi ----------
export async function testIntegration(provider: ProviderId, config: Record<string, string>, secrets: Record<string, string>, userId: number): Promise<string> {
  switch (provider) {
    case "serpapi": {
      if (!secrets.apiKey) throw new Error("API anahtarı boş.");
      const r = await fetch(`https://serpapi.com/account.json?api_key=${encodeURIComponent(secrets.apiKey)}`, { signal: T(15_000) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(`SerpApi: ${j.error ?? `HTTP ${r.status}`}`);
      const left = j.total_searches_left ?? j.plan_searches_left;
      return `Bağlandı${j.plan_name ? ` · ${j.plan_name}` : ""}${left != null ? ` · kalan arama: ${left}` : ""}`;
    }
    case "serpbear": {
      if (!config.baseUrl || !secrets.apiKey) throw new Error("Adres ve API anahtarı gerekli.");
      const d = await serpbearDomains(config.baseUrl.replace(/\/+$/, ""), secrets.apiKey);
      return `Bağlandı · ${d.length} domain, ${d.reduce((a, x) => a + x.keywordCount, 0)} kelime`;
    }
    case "ogimg": {
      const headers: Record<string, string> = {};
      if (secrets.apiKey) headers.Authorization = `Bearer ${secrets.apiKey}`;
      const r = await fetch(`https://ogimg.xyz/api/og?title=Epicsem&template=${encodeURIComponent(config.template || "gradient")}`, { headers, signal: T(20_000) });
      if (r.status === 401 || r.status === 403) throw new Error("ogimg API anahtarı geçersiz.");
      if (!r.ok) throw new Error(`ogimg: HTTP ${r.status}`);
      return secrets.apiKey ? "Bağlandı · anahtarlı plan" : "Bağlandı · ücretsiz plan (filigranlı, ayda 50 görsel)";
    }
    case "google_ads": {
      const ideas = await adsKeywordIdeas(userId, ["seo"], "tr", "TR");
      return `Bağlandı · test sorgusu ${ideas.length} fikir döndürdü`;
    }
    case "google_psi": {
      if (!secrets.apiKey) return "Anahtarsız kullanılacak (paylaşımlı kota)";
      const r = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent("https://www.google.com/")}&category=performance&strategy=desktop&key=${encodeURIComponent(secrets.apiKey)}`, { signal: T(90_000) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`PageSpeed: ${j?.error?.message ?? `HTTP ${r.status}`}`);
      return "Bağlandı · kendi kotanla çalışıyor";
    }
    case "bing": {
      if (!secrets.apiKey) throw new Error("API anahtarı boş.");
      const sites = await bingSites(secrets.apiKey);
      return `Bağlandı · ${sites.length} site (${sites.filter((x) => x.verified).length} doğrulanmış)`;
    }
    case "ahrefs": {
      if (!secrets.apiKey) throw new Error("API anahtarı boş.");
      const dr = await ahrefsFreeDR(secrets.apiKey, ["ahrefs.com"]);
      if (dr["ahrefs.com"] == null) throw new Error("Ahrefs yanıt vermedi.");
      return "Bağlandı · Domain Rating çalışıyor (backlink listesi için ücretli plan gerekir)";
    }
    case "indexnow": {
      if (!config.siteUrl) throw new Error("Site adresi gerekli.");
      if (!config.key) throw new Error("Anahtar üretilemedi.");
      const v = await verifyKeyFile(config.siteUrl, config.key);
      if (!v.ok) throw new Error(`${v.detail} Şu adrese, içinde sadece anahtar yazan bir dosya koy: ${v.url}`);
      return `Bağlandı · ${v.detail}`;
    }
  }
}
