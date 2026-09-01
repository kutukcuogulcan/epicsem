import type { EngineId } from "@/types";

export interface ProviderResponse {
  text: string;
  model: string;
}

export interface LlmProvider {
  engine: EngineId;
  defaultModel: string;
  isConfigured(): boolean;
  run(prompt: string): Promise<ProviderResponse>;
}

/** OpenAI — powers ChatGPT's answers and (with search-enabled models) live citations. */
class OpenAiProvider implements LlmProvider {
  engine: EngineId = "openai";
  defaultModel = "gpt-4o";
  isConfigured() {
    return Boolean(process.env.OPENAI_API_KEY);
  }
  async run(prompt: string): Promise<ProviderResponse> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: this.defaultModel,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI API error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return { text: data.choices?.[0]?.message?.content ?? "", model: this.defaultModel };
  }
}

/** Anthropic — powers Claude's answers. */
class AnthropicProvider implements LlmProvider {
  engine: EngineId = "anthropic";
  defaultModel = "claude-sonnet-4-5";
  isConfigured() {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }
  async run(prompt: string): Promise<ProviderResponse> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.defaultModel,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    const text = Array.isArray(data.content) ? data.content.map((c: { text?: string }) => c.text ?? "").join("") : "";
    return { text, model: this.defaultModel };
  }
}

/** Google Gemini — also underlies Google AI Overviews / AI Mode behavior patterns. */
class GoogleProvider implements LlmProvider {
  engine: EngineId = "google";
  defaultModel = "gemini-2.5-flash";
  isConfigured() {
    return Boolean(process.env.GOOGLE_AI_API_KEY);
  }
  async run(prompt: string): Promise<ProviderResponse> {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.defaultModel}:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    if (!res.ok) throw new Error(`Google AI API error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    return { text, model: this.defaultModel };
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

export function isDemoMode(): boolean {
  if (process.env.DEMO_MODE === "false") return false;
  const anyConfigured = Object.values(PROVIDERS).some((p) => p.isConfigured());
  return process.env.DEMO_MODE === "true" || !anyConfigured;
}
