// Canonical list of AI crawler / agent user-agents that matter for AXO/GEO
// (can AI systems actually reach your content?). 27 bots, each tagged with its role:
//  - citation: fetches pages that are shown/cited in AI answers (blocking it = no citations)
//  - fetch:    on-demand fetch when a user asks the assistant to open a page
//  - training: collects data for model training (blocking it is a legitimate choice)
// Sources: vendors' published crawler docs; list cross-checked with the open-source
// GEO Optimizer project (Auriti Labs, MIT).

export type AiBotRole = "citation" | "fetch" | "training";

export interface AiBotDef {
  userAgent: string;
  engine: string;
  role: AiBotRole;
  purpose: string;
}

export const AI_BOTS: AiBotDef[] = [
  { userAgent: "OAI-SearchBot", engine: "OpenAI", role: "citation", purpose: "Powers ChatGPT search / citations" },
  { userAgent: "ChatGPT-User", engine: "OpenAI", role: "fetch", purpose: "Live browsing when a user asks ChatGPT to visit a page" },
  { userAgent: "GPTBot", engine: "OpenAI", role: "training", purpose: "Training data collection for GPT models" },
  { userAgent: "Claude-SearchBot", engine: "Anthropic", role: "citation", purpose: "Claude search results and citations" },
  { userAgent: "Claude-User", engine: "Anthropic", role: "fetch", purpose: "Live fetch when a user asks Claude to open a page" },
  { userAgent: "ClaudeBot", engine: "Anthropic", role: "training", purpose: "Training data collection for Claude" },
  { userAgent: "PerplexityBot", engine: "Perplexity", role: "citation", purpose: "Indexing for Perplexity answers and citations" },
  { userAgent: "Perplexity-User", engine: "Perplexity", role: "fetch", purpose: "Live fetch when a user asks Perplexity to visit a page" },
  { userAgent: "Googlebot", engine: "Google", role: "citation", purpose: "Core Google crawler (also feeds AI Overviews / AI Mode)" },
  { userAgent: "Google-Extended", engine: "Google", role: "training", purpose: "Opt-out token for Gemini / Vertex training (not AI Overviews)" },
  { userAgent: "Google-CloudVertexBot", engine: "Google", role: "fetch", purpose: "Vertex AI agents fetching pages" },
  { userAgent: "Bingbot", engine: "Microsoft", role: "citation", purpose: "Bing index — feeds Copilot and ChatGPT search results" },
  { userAgent: "Applebot", engine: "Apple", role: "citation", purpose: "Apple search / Siri / Spotlight answers" },
  { userAgent: "Applebot-Extended", engine: "Apple", role: "training", purpose: "Apple Intelligence training opt-out token" },
  { userAgent: "xAI-Bot", engine: "xAI", role: "citation", purpose: "Grok search citations" },
  { userAgent: "DuckAssistBot", engine: "DuckDuckGo", role: "citation", purpose: "DuckDuckGo AI answers" },
  { userAgent: "Amazonbot", engine: "Amazon", role: "citation", purpose: "Alexa / Amazon search answers" },
  { userAgent: "meta-externalagent", engine: "Meta", role: "training", purpose: "Training data collection for Meta AI" },
  { userAgent: "Meta-ExternalFetcher", engine: "Meta", role: "fetch", purpose: "Meta AI on-demand fetch" },
  { userAgent: "facebookexternalhit", engine: "Meta", role: "fetch", purpose: "Link previews for Facebook / Instagram / WhatsApp" },
  { userAgent: "Bytespider", engine: "ByteDance", role: "training", purpose: "ByteDance / TikTok AI training" },
  { userAgent: "cohere-ai", engine: "Cohere", role: "training", purpose: "Cohere language models" },
  { userAgent: "CCBot", engine: "Common Crawl", role: "training", purpose: "Common Crawl dataset used to pretrain many LLMs" },
  { userAgent: "AI2Bot", engine: "Allen Institute", role: "training", purpose: "AI research crawler" },
  { userAgent: "PetalBot", engine: "Huawei", role: "citation", purpose: "Petal Search / Huawei AI" },
  { userAgent: "YouBot", engine: "You.com", role: "citation", purpose: "You.com AI search" },
  { userAgent: "MistralAI-User", engine: "Mistral", role: "fetch", purpose: "Le Chat on-demand fetch" },
];

export const CITATION_BOTS = AI_BOTS.filter((b) => b.role === "citation").map((b) => b.userAgent);
