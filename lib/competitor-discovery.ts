import { PROVIDERS, isDemoMode } from "@/lib/geo-providers";
import { extractJsonObject } from "@/lib/llm-json";

/**
 * Kart: Web aramalı rakip bulma + kodda doğrulama.
 *
 * Neden: Peec AI, pnc.com.tr (dijital pazarlama ajansı) için rakip olarak Logo, Mikro, Nebim ve
 * Uyumsoft (ERP yazılım firmaları) önerdi — modelin "genel bilgisinden" uydurulan rakip listesi
 * tamamen yanlış sektörden geldi. Burada iki şey farklı:
 *
 *  1. Rakipler modelin hafızasından değil, WEB ARAMASI yapabilen bir LLM çağrısıyla bulunur
 *     (Perplexity Sonar → OpenAI web_search → Gemini Google Search grounding → Claude
 *     web_search; hangisinin anahtarı varsa o sırayla). Hiçbiri yoksa eski (aramasız) prompta
 *     düşülür ve sonuç `webSearch: false` ile açıkça işaretlenir.
 *  2. Modelin döndürdüğü her domain KODDA doğrulanır: HEAD isteği (gerekirse GET), yönlendirme
 *     varsa son adres, tekrarlar ve kendi domain'imiz atılır, favicon bulunur. Açılmayan domain
 *     listeye hiç girmez.
 *
 * Güven skoru en yüksek 5 rakip `selected: true` gelir; geri kalan doğrulanmış adaylar
 * listede seçili olmadan durur (kullanıcı tek tıkla açabilir).
 */

export interface VerifiedCompetitor {
  name: string;
  /** Doğrulanmış, yönlendirme sonrası son host (www'suz). Elle eklenen satırlarda boş olabilir. */
  domain: string;
  reason?: string;
  /** 0-1 arası, modelin kendi güveni. */
  confidence?: number;
  faviconUrl?: string;
  /** Domain HEAD/GET ile gerçekten açıldı mı. */
  verified?: boolean;
  /** Onboarding'de varsayılan seçili mi (ilk 5). */
  selected?: boolean;
}

export interface CompetitorDiscoveryResult {
  competitors: VerifiedCompetitor[];
  /** Hangi motorla bulundu, ör. "perplexity:sonar (web)". */
  model: string;
  webSearch: boolean;
  demoMode: boolean;
  /** Model kaç aday döndürdü / kaçı doğrulamadan geçti — debug ve kabul testi için. */
  stats: { proposed: number; verified: number; droppedUnreachable: string[]; droppedDuplicate: string[] };
}

export interface CompetitorDiscoveryInput {
  domain: string;
  /** Ana sayfa özeti: title + meta + (varsa) çok sayfalı tarama metninden kısa bir kesit. */
  homeSummary: string;
  country: string;
  language: "tr" | "en";
}

const MAX_CANDIDATES = 10;
const SELECTED_COUNT = 5;
const FETCH_TIMEOUT_MS = 7000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 EpicsemBot/1.0";

// ---------------------------------------------------------------------------------------
// 1) Web aramalı LLM çağrısı
// ---------------------------------------------------------------------------------------

function buildPrompt(input: CompetitorDiscoveryInput): string {
  const lang = input.language === "en" ? "English" : "Turkish";
  return [
    `Company domain: ${input.domain}`,
    `Target country/market: ${input.country}`,
    `Home page summary (real, just-fetched):`,
    input.homeSummary.slice(0, 2500),
    ``,
    `Task: First determine precisely what business this company is in from the summary above (be literal and specific — e.g. "digital marketing agency", not "software").`,
    `Then SEARCH THE WEB for this company's DIRECT competitors in the ${input.country} market: companies selling the same kind of product/service to the same kind of customer. Do NOT include companies from adjacent categories (e.g. an ERP/accounting software vendor is NOT a competitor of a marketing agency), marketplaces, directories, news sites, or the company itself.`,
    `Return up to ${MAX_CANDIDATES} competitors. For each: the company name, its OFFICIAL website domain (as you found it on the web — never guess), a one-sentence reason in ${lang} explaining why it competes directly, and a confidence between 0 and 1 that it is a true direct competitor.`,
    ``,
    `Respond with ONLY a JSON object, no markdown fences, no commentary:`,
    `{"industry": "...", "competitors": [{"name": "...", "domain": "example.com", "reason": "...", "confidence": 0.0}]}`,
  ].join("\n");
}

async function fetchJson(url: string, init: RequestInit, timeoutMs = 45000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${url} → ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
    return body;
  } finally {
    clearTimeout(t);
  }
}

type WebSearchCaller = { id: string; configured: () => boolean; run: (prompt: string) => Promise<{ text: string; model: string }> };

const WEB_SEARCH_CALLERS: WebSearchCaller[] = [
  {
    // Perplexity Sonar her yanıtta zaten canlı web araması yapar.
    id: "perplexity",
    configured: () => Boolean(process.env.PERPLEXITY_API_KEY),
    run: async (prompt) => {
      const model = "sonar";
      const data = await fetchJson("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}` },
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.2 }),
      });
      return { text: data.choices?.[0]?.message?.content ?? "", model: `perplexity:${model}` };
    },
  },
  {
    // OpenAI Responses API + web_search aracı.
    id: "openai",
    configured: () => Boolean(process.env.OPENAI_API_KEY),
    run: async (prompt) => {
      const model = process.env.OPENAI_WEB_SEARCH_MODEL ?? "gpt-4.1-mini";
      const data = await fetchJson("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model, tools: [{ type: "web_search" }], input: prompt }),
      });
      let text: string = typeof data.output_text === "string" ? data.output_text : "";
      if (!text && Array.isArray(data.output)) {
        text = data.output
          .filter((o: any) => o?.type === "message")
          .flatMap((o: any) => (Array.isArray(o.content) ? o.content : []))
          .filter((c: any) => c?.type === "output_text" && typeof c.text === "string")
          .map((c: any) => c.text)
          .join("\n");
      }
      return { text, model: `openai:${model}` };
    },
  },
  {
    // Gemini + Google Search grounding.
    id: "google",
    configured: () => Boolean(process.env.GOOGLE_AI_API_KEY),
    run: async (prompt) => {
      const model = "gemini-2.5-flash";
      const data = await fetchJson(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }] }),
        }
      );
      const text = (data.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? "").join("");
      return { text, model: `google:${model}` };
    },
  },
  {
    // Claude + web_search sunucu aracı.
    id: "anthropic",
    configured: () => Boolean(process.env.ANTHROPIC_API_KEY),
    run: async (prompt) => {
      const model = "claude-sonnet-4-5";
      const data = await fetchJson("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 2500,
          tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const blocks: any[] = Array.isArray(data.content) ? data.content : [];
      // Arama sonrası son metin bloğu JSON'u taşır; hepsini birleştirip JSON ayıklayıcıya bırak.
      const text = blocks.filter((b) => b?.type === "text").map((b) => b.text).join("");
      return { text, model: `anthropic:${model}` };
    },
  },
];

/** Hiçbir web-arama sağlayıcısı yoksa: ilk yapılandırılmış normal model (aramasız). */
async function runWithoutWebSearch(prompt: string): Promise<{ text: string; model: string } | null> {
  for (const id of ["anthropic", "openai", "google", "deepseek", "xai"] as const) {
    const p = PROVIDERS[id];
    if (p.isConfigured()) {
      const r = await p.run(
        prompt.replace("SEARCH THE WEB for", "Using your own knowledge (you have NO web access, so only list companies you are sure about) list")
      );
      return { text: r.text, model: `${id}:${r.model} (web araması yok)` };
    }
  }
  return null;
}

interface RawCandidate {
  name: string;
  domain: string;
  reason: string;
  confidence: number;
}

function parseCandidates(text: string): RawCandidate[] {
  const parsed = extractJsonObject(text);
  const list: any[] = Array.isArray(parsed.competitors) ? parsed.competitors : [];
  return list
    .filter((c) => c && typeof c.name === "string" && c.name.trim() && typeof c.domain === "string" && c.domain.trim())
    .map((c) => ({
      name: String(c.name).trim(),
      domain: String(c.domain).trim(),
      reason: typeof c.reason === "string" ? c.reason.trim() : "",
      confidence: clamp01(Number(c.confidence)),
    }))
    .slice(0, MAX_CANDIDATES + 4); // doğrulamada düşecekler için biraz pay
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n > 1 ? n / 100 : n));
}

// ---------------------------------------------------------------------------------------
// 2) Kodda doğrulama
// ---------------------------------------------------------------------------------------

/** "https://www.Foo.com/abc" → "foo.com" */
export function normalizeHost(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//.test(s) ? s : `https://${s}`);
    const host = u.hostname.replace(/^www\./, "");
    if (!host.includes(".") || /\s/.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

/** pnc.com.tr ve pnc.com gibi aynı markanın farklı TLD'lerini "kendimiz" saymak için kaba kök. */
function brandRoot(host: string): string {
  const parts = host.split(".");
  const secondLevel = new Set(["com", "net", "org", "gov", "edu", "co", "gen", "biz", "web", "av", "bel", "k12"]);
  if (parts.length >= 3 && secondLevel.has(parts[parts.length - 2])) return parts[parts.length - 3];
  return parts.length >= 2 ? parts[parts.length - 2] : host;
}

async function timedFetch(url: string, method: "HEAD" | "GET"): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { method, redirect: "follow", signal: ctrl.signal, headers: { "User-Agent": UA, Accept: "text/html,*/*" } });
  } finally {
    clearTimeout(t);
  }
}

/** Sitenin gerçekten açıldığını kontrol eder; açıldıysa yönlendirme sonrası son host'u döner.
 * 401/403/429 "site var ama bot'u engelliyor" demektir (Cloudflare vb.) — insanlar için açılır,
 * o yüzden erişilebilir sayılır. 404/5xx/ağ hatası/zaman aşımı → erişilemez. */
export async function verifyDomain(host: string): Promise<{ ok: boolean; finalHost: string; origin: string }> {
  for (const url of [`https://${host}/`, `https://www.${host}/`, `http://${host}/`]) {
    for (const method of ["HEAD", "GET"] as const) {
      try {
        const res = await timedFetch(url, method);
        res.body?.cancel().catch(() => {});
        const reachable = res.status < 400 || res.status === 401 || res.status === 403 || res.status === 429;
        if (reachable) {
          const final = new URL(res.url || url);
          return { ok: true, finalHost: final.hostname.replace(/^www\./, ""), origin: final.origin };
        }
        // HEAD'i desteklemeyen sunucular 405/501 döner → aynı URL'i GET ile dene.
        if (method === "HEAD" && (res.status === 405 || res.status === 501 || res.status === 400)) continue;
        break;
      } catch {
        if (method === "HEAD") continue; // HEAD ağ hatası verdiyse GET ile bir şans daha
        break;
      }
    }
  }
  return { ok: false, finalHost: host, origin: `https://${host}` };
}

/** Önce sitenin kendi /favicon.ico'su; yoksa Google'ın favicon servisi (her zaman bir görsel döner). */
async function findFavicon(origin: string, host: string): Promise<string> {
  try {
    const res = await timedFetch(`${origin}/favicon.ico`, "HEAD");
    const type = res.headers.get("content-type") ?? "";
    if (res.ok && (type.startsWith("image/") || type.includes("icon"))) return `${origin}/favicon.ico`;
  } catch {
    // düş
  }
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
}

export async function verifyCandidates(
  candidates: RawCandidate[],
  ownDomain: string
): Promise<{ list: VerifiedCompetitor[]; droppedUnreachable: string[]; droppedDuplicate: string[] }> {
  const ownHost = normalizeHost(ownDomain) ?? ownDomain;
  const ownRoot = brandRoot(ownHost);
  const droppedUnreachable: string[] = [];
  const droppedDuplicate: string[] = [];

  // Önce bariz tekrar/kendimiz elemesi (ağ isteği atmadan).
  const seenPre = new Set<string>();
  const pre: (RawCandidate & { host: string })[] = [];
  for (const c of candidates) {
    const host = normalizeHost(c.domain);
    if (!host) {
      droppedUnreachable.push(c.domain);
      continue;
    }
    if (host === ownHost || brandRoot(host) === ownRoot || seenPre.has(host)) {
      droppedDuplicate.push(host);
      continue;
    }
    seenPre.add(host);
    pre.push({ ...c, host });
  }

  const checked = await Promise.all(
    pre.map(async (c) => {
      const v = await verifyDomain(c.host);
      if (!v.ok) return { c, v, favicon: "" };
      const favicon = await findFavicon(v.origin, v.finalHost);
      return { c, v, favicon };
    })
  );

  // Yönlendirme sonrası tekrarlar (ör. iki farklı domain aynı siteye gidiyorsa) ve kendimiz.
  const seenFinal = new Set<string>();
  const list: VerifiedCompetitor[] = [];
  for (const { c, v, favicon } of checked) {
    if (!v.ok) {
      droppedUnreachable.push(c.host);
      continue;
    }
    if (v.finalHost === ownHost || brandRoot(v.finalHost) === ownRoot || seenFinal.has(v.finalHost)) {
      droppedDuplicate.push(v.finalHost);
      continue;
    }
    seenFinal.add(v.finalHost);
    list.push({ name: c.name, domain: v.finalHost, reason: c.reason, confidence: c.confidence, faviconUrl: favicon, verified: true });
  }

  list.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  const top = list.slice(0, MAX_CANDIDATES).map((c, i) => ({ ...c, selected: i < SELECTED_COUNT }));
  return { list: top, droppedUnreachable, droppedDuplicate };
}

// ---------------------------------------------------------------------------------------
// 3) Ana giriş noktası
// ---------------------------------------------------------------------------------------

export async function discoverCompetitors(input: CompetitorDiscoveryInput): Promise<CompetitorDiscoveryResult> {
  const emptyStats = { proposed: 0, verified: 0, droppedUnreachable: [], droppedDuplicate: [] };
  if (isDemoMode()) {
    return { competitors: [{ name: "[DEMO DATA]", domain: "", selected: true }], model: "demo (no API key configured)", webSearch: false, demoMode: true, stats: emptyStats };
  }

  const prompt = buildPrompt(input);
  let raw: { text: string; model: string } | null = null;
  let webSearch = false;
  const errors: string[] = [];

  for (const caller of WEB_SEARCH_CALLERS) {
    if (!caller.configured()) continue;
    try {
      raw = await caller.run(prompt);
      if (parseCandidates(raw.text).length === 0) throw new Error("boş/okunamayan yanıt");
      webSearch = true;
      raw = { ...raw, model: `${raw.model} (web)` };
      break;
    } catch (err) {
      errors.push(`${caller.id}: ${err instanceof Error ? err.message : String(err)}`);
      raw = null;
    }
  }

  if (!raw) {
    raw = await runWithoutWebSearch(prompt);
    if (!raw) throw new Error(errors.length ? `Rakip araması başarısız: ${errors.join(" | ")}` : "Yapılandırılmış model yok");
  }

  const candidates = parseCandidates(raw.text);
  const { list, droppedUnreachable, droppedDuplicate } = await verifyCandidates(candidates, input.domain);

  return {
    competitors: list,
    model: raw.model,
    webSearch,
    demoMode: false,
    stats: { proposed: candidates.length, verified: list.length, droppedUnreachable, droppedDuplicate },
  };
}

/** Taramadan kısa bir "ana sayfa özeti" çıkarır (profil adımı paralel koştuğu için onun
 * açıklamasını bekleyemeyiz — doğrudan gerçek sayfa metninden). */
export function buildHomeSummary(
  page: { url: string; title: string | null; metaDescription: string | null; bodyText: string },
  multiPageText?: string
): string {
  const head = [`URL: ${page.url}`, `Title: ${page.title ?? "-"}`, `Meta description: ${page.metaDescription ?? "-"}`].join("\n");
  const body = (multiPageText && multiPageText.trim() ? multiPageText : page.bodyText).replace(/\s+/g, " ").slice(0, 2000);
  return `${head}\n${body}`;
}
