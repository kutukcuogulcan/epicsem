/** /ai-tracker/<motor> SEO sayfalarının içeriği — yalnızca Epicsem'in gerçekten canlı test ettiği motorlar. */
export interface TrackerEngine {
  slug: string;
  name: string;
  vendor: string;
  color: string;
  /** Bu motorun ürün özellikleriyle ilgili kısa, doğrulanabilir not. */
  angle: string;
}

export const TRACKER_ENGINES: TrackerEngine[] = [
  { slug: "chatgpt", name: "ChatGPT", vendor: "OpenAI", color: "#10a37f", angle: "En çok kullanılan AI asistanı; ürün ve hizmet önerisi isteyen kullanıcıların ilk durağı." },
  { slug: "claude", name: "Claude", vendor: "Anthropic", color: "#d97757", angle: "Uzun ve detaylı araştırma sorularında sık kullanılan, kaynak göstermeye özen gösteren asistan." },
  { slug: "gemini", name: "Gemini", vendor: "Google", color: "#4285f4", angle: "Google ekosistemine gömülü; Android, Gmail ve Google aramasıyla iç içe." },
  { slug: "perplexity", name: "Perplexity", vendor: "Perplexity AI", color: "#20b8cd", angle: "Her cevapta kaynak linki veren cevap motoru; atıf alan siteler doğrudan trafik kazanır." },
  { slug: "grok", name: "Grok", vendor: "xAI", color: "#0f172a", angle: "X (Twitter) içine entegre; gündem ve marka algısı sorularında öne çıkıyor." },
  { slug: "deepseek", name: "DeepSeek", vendor: "DeepSeek", color: "#4d6bfe", angle: "Hızla büyüyen açık ağırlıklı model; maliyet odaklı kullanıcılar ve geliştiriciler arasında yaygın." },
];

export const engineBySlug = (s: string) => TRACKER_ENGINES.find((e) => e.slug === s);
