import type { EngineId } from "@/types";
import { geminiGenerate } from "@/lib/gemini";
import { resolveRedirect } from "@/lib/community-search";

export interface ProviderResponse {
  text: string;
  model: string;
  /** Model çıktı token sınırına takıldı (OpenAI finish_reason=length, Claude stop_reason=max_tokens, Gemini MAX_TOKENS). */
  truncated?: boolean;
  /** Cevabın web aramasıyla gösterdiği gerçek kaynak adresleri (search: true iken). */
  sources?: string[];
}

/** Optional per-call overrides — used by generation-only call sites (topic/prompt
 * generation; never the real GEO-test engine queries, which must keep using each engine's
 * actual flagship model since that's literally what the tool is measuring) to ask for a
 * cheaper/faster model and a non-default temperature. Providers that don't support one or
 * both silently fall back to their class defaults. */
export interface RunOptions {
  model?: string;
  temperature?: number;
  /** Yalnızca JSON döndürmesini iste (destekleyen sağlayıcılarda yerel JSON modu). */
  json?: boolean;
  /** Uzun yapılandırılmış çıktılar için çıktı token sınırı. */
  maxTokens?: number;
  /**
   * GEO ölçümü: motoru kullanıcının gördüğü gibi web araması AÇIK çalıştır (ChatGPT/Gemini/Claude
   * arayüzleri güncel bilgi için arar ve kaynak gösterir). Desteklemeyen sağlayıcı yok sayar.
   * shortcut: konum her zaman TR; proje ülkesine göre ayarlanmalı (çok ülkeli müşteri gelince).
   */
  search?: boolean;
}

const SEARCH_COUNTRY = "TR";
/** Uygulamalar (ChatGPT/Gemini/Claude arayüzleri) öneri ve ürün sorularında arar; API'de model bazen aramadan cevaplıyor. */
const SEARCH_HINT =
  "You are a helpful assistant like the consumer chat app. When a question asks for recommendations, products, companies, prices or anything that may have changed, search the web first and ground your answer in current sources.";
const uniq = (xs: string[]) => [...new Set(xs.filter((u) => /^https?:\/\//.test(u)))];

export interface LlmProvider {
  engine: EngineId;
  defaultModel: string;
  isConfigured(): boolean;
  run(prompt: string, options?: RunOptions): Promise<ProviderResponse>;
}

/** "Hızlı model (Haiku / Gemini Flash / GPT-mini)" from the prompt-generation methodology
 * card (Kart 14, section C) — bulk per-topic sentence-writing calls use these instead of the
 * flagship models above, since there's no need to pay flagship prices to fill in an
 * already-fully-specified slot. Only for providers it makes sense to downgrade; Perplexity/
 * DeepSeek/xAI don't have an equivalently-positioned "mini" tier in this app's integration. */
export const FAST_MODEL: Partial<Record<EngineId, string>> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-20241022",
  google: "gemini-2.5-flash", // already the fast tier — same as the flagship pick above
};

/** OpenAI — powers ChatGPT's answers and (with search-enabled models) live citations. */
/**
 * ChatGPT modeli: OPENAI_MODEL tanımlıysa o; yoksa anahtarın erişebildiği en yeni GPT'nin "mini" sürümü
 * (GET /v1/models, en yeni "created"), mini yoksa en yeni genel GPT. Sabit "gpt-4o" emekliye ayrılınca
 * GEO ölçümü bozulmasın diye.
 * shortcut: maliyet için mini (ChatGPT ücretsiz katmanının sınıfı); bütçe büyüyünce OPENAI_MODEL ile büyük modele geç.
 */
let openAiModelCache: string | null = null;
export function resetOpenAiModelCache() {
  openAiModelCache = null;
}
async function resolveOpenAiModel(): Promise<string> {
  if (process.env.OPENAI_MODEL) return process.env.OPENAI_MODEL;
  if (openAiModelCache) return openAiModelCache;
  try {
    const res = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, signal: AbortSignal.timeout(10_000) });
    if (res.ok) {
      const list: { id: string; created?: number }[] = (await res.json()).data ?? [];
      const usable = list
        .filter((m) => /^gpt-\d/.test(m.id) && !/nano|audio|realtime|search|transcribe|tts|image|instruct|codex|oss|\d{4}-\d{2}-\d{2}/.test(m.id))
        .sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
      const pick = (usable.find((m) => /-mini$/.test(m.id)) ?? usable.find((m) => !/mini/.test(m.id)))?.id;
      if (pick) return (openAiModelCache = pick);
    }
  } catch {
    // düş
  }
  return "gpt-4o";
}

class OpenAiProvider implements LlmProvider {
  engine: EngineId = "openai";
  defaultModel = "ChatGPT (en yeni GPT)";
  isConfigured() {
    return Boolean(process.env.OPENAI_API_KEY);
  }
  async run(prompt: string, options?: RunOptions): Promise<ProviderResponse> {
    const model = !options?.model || options.model === this.defaultModel ? await resolveOpenAiModel() : options.model;
    if (options?.search) {
      // ChatGPT arayüzü gibi: Responses API + web_search aracı (eski *-search-preview modelleri kapatıldı).
      const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
                // Maliyet: cevap ~1200 token ile sınırlı, arama bağlamı "low" (modele giden arama metni az).
        body: JSON.stringify({ model, instructions: SEARCH_HINT, input: prompt, max_output_tokens: 1200, tools: [{ type: "web_search", search_context_size: "low", user_location: { type: "approximate", country: SEARCH_COUNTRY } }] }),
      });
      if (!r.ok) throw new Error(friendlyApiError("ChatGPT (OpenAI)", r.status, await r.text()));
      const d = await r.json();
      const parts = (Array.isArray(d.output) ? d.output : []).filter((o: any) => o?.type === "message").flatMap((o: any) => (Array.isArray(o.content) ? o.content : []));
      const text = parts.filter((c: any) => c?.type === "output_text").map((c: any) => String(c.text ?? "")).join("");
      const sources = uniq(parts.flatMap((c: any) => (Array.isArray(c?.annotations) ? c.annotations : [])).filter((a: any) => a?.type === "url_citation").map((a: any) => String(a.url ?? "")));
      return { text, model, sources, truncated: d.status === "incomplete" };
    }
    // Yeni GPT (akıl yürüten) modelleri `temperature` kabul etmiyor; bir kez reddeden modele bir daha gönderilmez.
    const send = (withTemp: boolean) =>
      fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          ...(withTemp ? { temperature: options?.temperature ?? 0.4 } : {}),
          ...(options?.json ? { response_format: { type: "json_object" } } : {}),
          // max_tokens yeni modellerde reddediliyor; max_completion_tokens eski modellerde de geçerli.
          ...(options?.maxTokens ? { max_completion_tokens: Math.min(16000, options.maxTokens) } : {}),
        }),
      });
    let res = await send(!noTemperatureModels.has(model));
    if (res.status === 400) {
      const body = await res.text();
      if (!/temperature/i.test(body)) throw new Error(friendlyApiError("ChatGPT (OpenAI)", 400, body));
      noTemperatureModels.add(model);
      res = await send(false);
    }
    if (!res.ok) throw new Error(friendlyApiError("ChatGPT (OpenAI)", res.status, await res.text()));
    const data = await res.json();
    return { text: data.choices?.[0]?.message?.content ?? "", model, truncated: data.choices?.[0]?.finish_reason === "length" };
  }
}

/**
 * Anthropic model adları zamanla değişiyor ve her anahtar her modele erişemiyor (canlıda
 * "model: claude-sonnet-4-5 not_found" hatası görüldü). Sabit ad yerine: önce env
 * (ANTHROPIC_MODEL / ANTHROPIC_FAST_MODEL), yoksa anahtarın gerçekten erişebildiği modelleri
 * GET /v1/models ile listele ve en yeni Sonnet'i (hızlı katman için en yeni Haiku'yu) seç.
 * Sonuç süreç boyunca önbellekte tutulur.
 */
const anthropicModelCache: Partial<Record<"flagship" | "fast", string>> = {};
/** Anahtar değişince (Entegrasyonlar) model seçimi yeniden yapılsın. */
export function resetAnthropicModelCache() {
  delete anthropicModelCache.flagship;
  delete anthropicModelCache.fast;
}

export async function resolveAnthropicModel(tier: "flagship" | "fast" = "flagship"): Promise<string> {
  const envModel = tier === "fast" ? process.env.ANTHROPIC_FAST_MODEL : process.env.ANTHROPIC_MODEL;
  if (envModel) return envModel;
  if (anthropicModelCache[tier]) return anthropicModelCache[tier]!;
  try {
    const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
    });
    if (res.ok) {
      const data = await res.json();
      const ids: string[] = Array.isArray(data.data) ? data.data.map((m: { id: string }) => m.id) : [];
      // Liste en yeniden eskiye gelir.
      const pick =
        (tier === "fast" ? ids.find((id) => id.includes("haiku")) : ids.find((id) => id.includes("sonnet"))) ??
        ids.find((id) => id.includes("sonnet")) ??
        ids[0];
      if (pick) {
        anthropicModelCache[tier] = pick;
        return pick;
      }
    }
  } catch {
    // düş
  }
  return tier === "fast" ? "claude-3-5-haiku-latest" : "claude-sonnet-4-5";
}

const noTemperatureModels = new Set<string>();

/** Anthropic — powers Claude's answers. */
class AnthropicProvider implements LlmProvider {
  engine: EngineId = "anthropic";
  defaultModel = "claude (en yeni Sonnet)";
  isConfigured() {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }
  async run(prompt: string, options?: RunOptions): Promise<ProviderResponse> {
    const model =
      !options?.model || options.model === this.defaultModel
        ? await resolveAnthropicModel("flagship")
        : options.model === FAST_MODEL.anthropic
          ? await resolveAnthropicModel("fast")
          : options.model;
    // Yeni Claude modelleri `temperature` parametresini kabul etmiyor (400 "deprecated").
    // Bir kez reddeden model için parametre bir daha gönderilmez.
    const send = (withTemp: boolean) =>
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: options?.maxTokens ?? 4096,
          ...(withTemp && options?.temperature != null ? { temperature: options.temperature } : {}),
          messages: [{ role: "user", content: prompt }],
          // Claude arayüzü gibi web araması açık; temel sürüm bütün güncel modellerde çalışır. Arama başı ücretli.
          ...(options?.search ? { system: SEARCH_HINT, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3, user_location: { type: "approximate", country: SEARCH_COUNTRY } }] } : {}),
        }),
      });
    let res = await send(!noTemperatureModels.has(model));
    if (res.status === 400) {
      const body = await res.text();
      if (/temperature/i.test(body)) {
        noTemperatureModels.add(model);
        res = await send(false);
      } else throw new Error(`Anthropic API error: ${res.status} ${body}`);
    }
    if (!res.ok) throw new Error(friendlyApiError("Claude", res.status, await res.text()));
    const data = await res.json();
    const blocks: any[] = Array.isArray(data.content) ? data.content : [];
    // Yalnızca metin blokları (arama sorgusu / sonuç blokları metne karışmasın); kaynaklar = cevapta alıntılananlar.
    const text = blocks.filter((c) => c?.type === "text").map((c) => String(c.text ?? "")).join("");
    const sources = uniq(blocks.flatMap((c) => (Array.isArray(c?.citations) ? c.citations : [])).map((c: any) => String(c?.url ?? "")));
    return { text, model, truncated: data.stop_reason === "max_tokens", ...(options?.search ? { sources } : {}) };
  }
}

/** Google Gemini — also underlies Google AI Overviews / AI Mode behavior patterns. */
class GoogleProvider implements LlmProvider {
  engine: EngineId = "google";
  defaultModel = "gemini-2.5-flash";
  isConfigured() {
    return Boolean(process.env.GOOGLE_AI_API_KEY);
  }
  async run(prompt: string, options?: RunOptions): Promise<ProviderResponse> {
    // Model Google tarafında kapatıldıysa (404) güncel modele geçer (lib/gemini.ts).
    const { data, model } = await geminiGenerate(
      {
        contents: [{ parts: [{ text: prompt }] }],
        ...(options?.search ? { systemInstruction: { parts: [{ text: SEARCH_HINT }] }, tools: [{ google_search: {} }] } : {}),
        generationConfig: {
          ...(options?.temperature != null ? { temperature: options.temperature } : {}),
          ...(options?.json ? { responseMimeType: "application/json" } : {}),
          ...(options?.maxTokens ? { maxOutputTokens: options.maxTokens } : {}),
        },
      },
      { preferred: options?.model ?? this.defaultModel }
    );
    const text = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    if (!options?.search) return { text, model, truncated: data.candidates?.[0]?.finishReason === "MAX_TOKENS" };
    // Google araması kaynakları yönlendirme bağlantısı olarak gelir; gerçek adrese çözülür.
    const chunks: { web?: { uri?: string } }[] = data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const sources = uniq((await Promise.all(chunks.slice(0, 15).map((c) => resolveRedirect(String(c.web?.uri ?? ""))))).map((u) => u ?? ""));
    return { text, model, sources, truncated: data.candidates?.[0]?.finishReason === "MAX_TOKENS" };
  }
}

/** Perplexity — natively cites sources, closest analog to real AEO citation behavior. */
class PerplexityProvider implements LlmProvider {
  engine: EngineId = "perplexity";
  defaultModel = "sonar";
  isConfigured() {
    return Boolean(process.env.PERPLEXITY_API_KEY);
  }
  async run(prompt: string): Promise<ProviderResponse> {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      },
      body: JSON.stringify({
        model: this.defaultModel,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(friendlyApiError("Perplexity", res.status, await res.text()));
    const data = await res.json();
    let text = data.choices?.[0]?.message?.content ?? "";
    const citations: string[] | undefined = data.citations;
    if (citations?.length) {
      text += "\n\nSources:\n" + citations.map((c) => `- ${c}`).join("\n");
    }
    return { text, model: this.defaultModel };
  }
}

/** DeepSeek — OpenAI-compatible API, increasingly cited in AI-search comparisons/roundups. */
class DeepSeekProvider implements LlmProvider {
  engine: EngineId = "deepseek";
  defaultModel = "deepseek-chat";
  isConfigured() {
    return Boolean(process.env.DEEPSEEK_API_KEY);
  }
  async run(prompt: string): Promise<ProviderResponse> {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: this.defaultModel,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
      }),
    });
    if (!res.ok) throw new Error(`DeepSeek API error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return { text: data.choices?.[0]?.message?.content ?? "", model: this.defaultModel, truncated: data.choices?.[0]?.finish_reason === "length" };
  }
}

/** xAI Grok — OpenAI-compatible API, surfaced directly inside X/Twitter's search & Explore. */
class XaiProvider implements LlmProvider {
  engine: EngineId = "xai";
  defaultModel = "grok-2-latest";
  isConfigured() {
    return Boolean(process.env.XAI_API_KEY);
  }
  async run(prompt: string): Promise<ProviderResponse> {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: this.defaultModel,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
      }),
    });
    if (!res.ok) throw new Error(`xAI API error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return { text: data.choices?.[0]?.message?.content ?? "", model: this.defaultModel, truncated: data.choices?.[0]?.finish_reason === "length" };
  }
}

/**
 * Meta AI and Microsoft Copilot — unlike the providers above, these consumer assistants
 * don't expose a simple public chat-completion API a small tool can call directly (Meta's
 * public APIs are for raw Llama model hosting, not the Meta AI assistant product itself;
 * Copilot's is bundled into Azure/M365 enterprise offerings, not a standalone endpoint).
 * They're included in the engine list — and shown everywhere in the UI — because they're
 * real, commonly-cited GEO surfaces, but `isConfigured()` always returns false so every run
 * clearly goes through the labeled demo simulator instead of silently pretending to call a
 * real API. Swap in a real integration here the day either platform ships one.
 */
class MetaAiProvider implements LlmProvider {
  engine: EngineId = "meta";
  defaultModel = "meta-ai (no public API)";
  isConfigured() {
    return false;
  }
  async run(): Promise<ProviderResponse> {
    throw new Error("Meta AI has no public chat-completion API yet — demo mode only.");
  }
}

class MicrosoftCopilotProvider implements LlmProvider {
  engine: EngineId = "microsoft";
  defaultModel = "copilot (no public API)";
  isConfigured() {
    return false;
  }
  async run(): Promise<ProviderResponse> {
    throw new Error("Microsoft Copilot has no standalone public chat-completion API yet — demo mode only.");
  }
}

export const PROVIDERS: Record<EngineId, LlmProvider> = {
  openai: new OpenAiProvider(),
  anthropic: new AnthropicProvider(),
  google: new GoogleProvider(),
  perplexity: new PerplexityProvider(),
  deepseek: new DeepSeekProvider(),
  xai: new XaiProvider(),
  meta: new MetaAiProvider(),
  microsoft: new MicrosoftCopilotProvider(),
};

/** Picks the first configured provider that HAS a fast-tier model (openai/anthropic/google
 * only, per FAST_MODEL above) in a fixed preference order (Haiku first, per the methodology
 * card's own ordering) — for bulk generation calls (topic/prompt generation), never for the
 * real GEO-test engine queries. Falls back to any other configured provider at its normal
 * model/temperature if none of the three fast-tier ones are configured, so generation still
 * works (just without the cost savings) rather than failing outright. */
const FAST_PREFERRED_ORDER: EngineId[] = ["anthropic", "google", "openai", "perplexity", "deepseek", "xai"];

export function pickFastProvider(): LlmProvider | null {
  for (const id of FAST_PREFERRED_ORDER) {
    const p = PROVIDERS[id];
    if (p.isConfigured()) return p;
  }
  return null;
}

/** Runs `prompt` against the fast provider, applying its FAST_MODEL override (when one
 * exists for that engine) and the given temperature. Returns null when no provider is
 * configured at all (demo mode) — callers fall back to their own demo content. */
export async function runFast(prompt: string, temperature = 0.7): Promise<ProviderResponse | null> {
  const provider = pickFastProvider();
  if (!provider) return null;
  return provider.run(prompt, { model: FAST_MODEL[provider.engine], temperature, maxTokens: 8000 });
}

export function isDemoMode(): boolean {
  if (process.env.DEMO_MODE === "false") return false;
  const anyConfigured = Object.values(PROVIDERS).some((p) => p.isConfigured());
  return process.env.DEMO_MODE === "true" || !anyConfigured;
}

/** Gerçek modda sadece anahtarı tanımlı motorlar çalışır; kota da yalnız onlar için hesaplanır. */
export function configuredEngines(engines: EngineId[]): EngineId[] {
  return isDemoMode() ? engines : engines.filter((e) => PROVIDERS[e].isConfigured());
}

/** Sağlayıcı hatalarını kullanıcının anlayacağı, ne yapacağını söyleyen Türkçe mesaja çevirir. */
export function friendlyApiError(name: string, status: number, body: string): string {
  if (status === 401 || /invalid.{0,10}api.?key|authentication_error/i.test(body))
    return `${name} API anahtarı geçersiz. Entegrasyonlar sayfasından ${name} anahtarını yenile (Entegrasyonlar → Yapay zekâ motorları).`;
  if (status === 402 || /insufficient_quota|credit balance|billing/i.test(body))
    return `${name} hesabında kredi yok. Sağlayıcının panelinden (Billing) kredi yükle.`;
  if (status === 429) return `${name} istek limiti aşıldı. Birkaç dakika sonra tekrar dene.`;
  if (status >= 500) return `${name} şu an yanıt vermiyor (HTTP ${status}). Biraz sonra tekrar dene.`;
  return `${name} hatası: HTTP ${status} ${body.slice(0, 200)}`;
}
