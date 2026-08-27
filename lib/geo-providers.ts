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

export const PROVIDERS: Record<EngineId, LlmProvider> = {
  openai: new OpenAiProvider(),
  anthropic: new AnthropicProvider(),
  google: new GoogleProvider(),
  perplexity: new PerplexityProvider(),
};

export function isDemoMode(): boolean {
  if (process.env.DEMO_MODE === "false") return false;
  const anyConfigured = Object.values(PROVIDERS).some((p) => p.isConfigured());
  return process.env.DEMO_MODE === "true" || !anyConfigured;
}
