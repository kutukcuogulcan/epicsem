import { AI_BOTS, type AiBotDef } from "./ai-bots";

/**
 * Sunucu erişim kaydından (Apache/Nginx "combined" biçimi) AI botu ziyaretleri ve AI'dan gelen ziyaretçiler.
 * Tarayıcıda çalışır; dosya sunucuya gönderilmez. AI kullanmaz.
 */

export interface BotStat {
  bot: AiBotDef;
  hits: number;
  pages: number;
  errors: number; // 4xx/5xx
  blocked: number; // 401/403/429 — güvenlik duvarı ya da sunucu reddetti
  last: string;
}
export interface PageStat {
  path: string;
  hits: number;
  bots: string[];
  status: number; // son görülen durum kodu
}
export interface ReferralStat {
  source: string;
  visits: number;
  pages: { path: string; visits: number }[];
}
export interface AiLogReport {
  lines: number;
  parsed: number;
  from: string | null;
  to: string | null;
  bots: BotStat[];
  pages: PageStat[];
  referrals: ReferralStat[];
}

// 1.2.3.4 - - [10/Oct/2026:13:55:36 +0000] "GET /path HTTP/1.1" 200 2326 "referer" "user-agent"
const LINE = /\[([^\]]+)\]\s+"(?:[A-Z]+)\s+(\S+)[^"]*"\s+(\d{3})\s+\S+(?:\s+"([^"]*)"\s+"([^"]*)")?/;

export const AI_REFERRERS: [RegExp, string][] = [
  [/(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/, "ChatGPT"],
  [/(^|\.)perplexity\.ai$/, "Perplexity"],
  [/^gemini\.google\.com$|^bard\.google\.com$/, "Gemini"],
  [/^copilot\.microsoft\.com$|(^|\.)copilot\.cloud\.microsoft$/, "Copilot"],
  [/(^|\.)claude\.ai$/, "Claude"],
  [/(^|\.)deepseek\.com$/, "DeepSeek"],
  [/(^|\.)grok\.com$|^x\.ai$/, "Grok"],
  [/(^|\.)meta\.ai$/, "Meta AI"],
  [/(^|\.)you\.com$/, "You.com"],
];

// Uzun adlar önce: "Applebot-Extended" "Applebot"tan önce eşleşsin
const BOTS = [...AI_BOTS].sort((a, b) => b.userAgent.length - a.userAgent.length).map((b) => ({ b, ua: b.userAgent.toLowerCase() }));
const findBot = (ua: string) => {
  const u = ua.toLowerCase();
  return BOTS.find((x) => u.includes(x.ua))?.b ?? null;
};
const BLOCK = new Set([401, 403, 429]);
const cleanPath = (p: string) => p.split("#")[0].replace(/\?.*$/, "") || "/";

export function parseAiLog(text: string): AiLogReport {
  const bots = new Map<string, { bot: AiBotDef; hits: number; pages: Set<string>; errors: number; blocked: number; last: string }>();
  const pages = new Map<string, { hits: number; bots: Set<string>; status: number }>();
  const refs = new Map<string, Map<string, number>>();
  let lines = 0,
    parsed = 0,
    from: string | null = null,
    to: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    lines++;
    const m = LINE.exec(line);
    if (!m) continue;
    parsed++;
    const [, time, rawPath, st, referer = "", ua = ""] = m;
    const status = Number(st);
    const path = cleanPath(rawPath);
    from ??= time;
    to = time;
    const bot = findBot(ua);
    if (bot) {
      const s = bots.get(bot.userAgent) ?? { bot, hits: 0, pages: new Set(), errors: 0, blocked: 0, last: time };
      s.hits++;
      s.pages.add(path);
      if (status >= 400) s.errors++;
      if (BLOCK.has(status)) s.blocked++;
      s.last = time;
      bots.set(bot.userAgent, s);
      const p = pages.get(path) ?? { hits: 0, bots: new Set(), status };
      p.hits++;
      p.bots.add(bot.userAgent);
      if (!BLOCK.has(status)) p.status = status; // engel kodu botla ilgili, sayfanın durumu değil
      pages.set(path, p);
      continue;
    }
    if (!referer || referer === "-") continue;
    let host = "";
    try {
      host = new URL(referer).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      continue;
    }
    const src = AI_REFERRERS.find(([re]) => re.test(host))?.[1];
    if (!src) continue;
    const r = refs.get(src) ?? new Map<string, number>();
    r.set(path, (r.get(path) ?? 0) + 1);
    refs.set(src, r);
  }
  return {
    lines,
    parsed,
    from,
    to,
    bots: [...bots.values()].map((s) => ({ bot: s.bot, hits: s.hits, pages: s.pages.size, errors: s.errors, blocked: s.blocked, last: s.last })).sort((a, b) => b.hits - a.hits),
    pages: [...pages.entries()].map(([path, p]) => ({ path, hits: p.hits, bots: [...p.bots], status: p.status })).sort((a, b) => b.hits - a.hits).slice(0, 200),
    referrals: [...refs.entries()]
      .map(([source, m]) => ({ source, visits: [...m.values()].reduce((a, b) => a + b, 0), pages: [...m.entries()].map(([path, visits]) => ({ path, visits })).sort((a, b) => b.visits - a.visits).slice(0, 20) }))
      .sort((a, b) => b.visits - a.visits),
  };
}
