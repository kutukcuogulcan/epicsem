import type { EngineId } from "@/types";

export interface ProviderResponse {
  text: string;
  model: string;
}

/** Optional per-call overrides — used by generation-only call sites (topic/prompt
 * generation; never the real GEO-test engine queries, which must keep using each engine's
 * actual flagship model since that's literally what the tool is measuring) to ask for a
 * cheaper/faster model and a non-default temperature. Providers that don't support one or
 * both silently fall back to their class defaults. */
export interface RunOptions {
  model?: string;
  temperature?: number;
}

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
class OpenAiProvider implements LlmProvider {
  engine: EngineId = "openai";
  defaultModel = "gpt-4o";
  isConfigured() {
    return Boolean(process.env.OPENAI_API_KEY);
  }
  async run(prompt: string, options?: RunOptions): Promise<ProviderResponse> {
    const model = options?.model ?? this.defaultModel;
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: options?.temperature ?? 0.4,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI API error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return { text: data.choices?.[0]?.message?.content ?? "", model };
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
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        temperature: options?.temperature,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    const text = Array.isArray(data.content) ? data.content.map((c: { text?: string }) => c.text ?? "").join("") : "";
    return { text, model };
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
    const model = options?.model ?? this.defaultModel;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          ...(options?.temperature != null ? { generationConfig: { temperature: options.temperature } } : {}),
        }),
      }
    );
    if (!res.ok) throw new Error(`Google AI API error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    return { text, model };
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
    if (!res.ok) throw new Error(`Perplexity API error: ${res.status} ${await res.text()}`);
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
    return { text: data.choices?.[0]?.message?.content ?? "", model: this.defaultModel };
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
    return { text: data.choices?.[0]?.message?.content ?? "", model: this.defaultModel };
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
  return provider.run(prompt, { model: FAST_MODEL[provider.engine], temperature });
}

export function isDemoMode(): boolean {
  if (process.env.DEMO_MODE === "false") return false;
  const anyConfigured = Object.values(PROVIDERS).some((p) => p.isConfigured());
  return process.env.DEMO_MODE === "true" || !anyConfigured;
}
