// Canonical list of AI crawler / agent user-agents that matter for AXO
// (Agent Experience Optimization — can AI systems actually reach your content).
// Sources: OpenAI, Anthropic, Perplexity, Google, Meta, Common Crawl published bot docs.

export interface AiBotDef {
  userAgent: string;
  engine: "OpenAI" | "Anthropic" | "Perplexity" | "Google" | "Meta" | "Common Crawl";
  purpose: string;
}

export const AI_BOTS: AiBotDef[] = [
  { userAgent: "GPTBot", engine: "OpenAI", purpose: "Training data collection for ChatGPT/GPT models" },
  { userAgent: "ChatGPT-User", engine: "OpenAI", purpose: "Live browsing when a user asks ChatGPT to visit a page" },
  { userAgent: "OAI-SearchBot", engine: "OpenAI", purpose: "Powers ChatGPT search / citations" },
  { userAgent: "ClaudeBot", engine: "Anthropic", purpose: "Training data collection for Claude" },
  { userAgent: "Claude-Web", engine: "Anthropic", purpose: "Live browsing / citations for Claude" },
  { userAgent: "anthropic-ai", engine: "Anthropic", purpose: "General Anthropic crawler" },
  { userAgent: "PerplexityBot", engine: "Perplexity", purpose: "Indexing for Perplexity answers and citations" },
  { userAgent: "Perplexity-User", engine: "Perplexity", purpose: "Live fetch when a user asks Perplexity to visit a page" },
  { userAgent: "Google-Extended", engine: "Google", purpose: "Controls use of content for Gemini / AI Overviews training" },
  { userAgent: "Googlebot", engine: "Google", purpose: "Core Google crawler (also feeds AI Overviews)" },
  { userAgent: "meta-externalagent", engine: "Meta", purpose: "Training data collection for Meta AI" },
  { userAgent: "CCBot", engine: "Common Crawl", purpose: "Common Crawl dataset used to pretrain many LLMs" },
];
