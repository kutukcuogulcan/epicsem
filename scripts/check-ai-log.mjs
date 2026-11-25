// npx tsx scripts/check-ai-log.mjs — erişim kaydı ayrıştırma öz-denetimi
import assert from "node:assert/strict";
const { parseAiLog } = await import("../lib/ai-log.ts");
const L = (path, st, ref, ua) => `1.2.3.4 - - [10/Oct/2026:13:55:36 +0000] "GET ${path} HTTP/1.1" ${st} 512 "${ref}" "${ua}"`;
const r = parseAiLog([
  L("/blog/a?utm=x", 200, "-", "Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)"),
  L("/blog/b", 403, "-", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; PerplexityBot/1.0"),
  L("/", 200, "-", "Mozilla/5.0 (Applebot-Extended/0.1)"),
  L("/fiyat", 200, "https://chatgpt.com/", "Mozilla/5.0 (Windows NT 10.0) Chrome/130"),
  L("/fiyat", 200, "https://www.perplexity.ai/search?q=x", "Mozilla/5.0 Safari"),
  L("/x", 200, "https://google.com/", "Mozilla/5.0 Safari"),
  "bozuk satır",
].join("\n"));
assert.equal(r.lines, 7); assert.equal(r.parsed, 6);
assert.equal(r.bots.length, 3);
assert.equal(r.bots.find((b) => b.bot.userAgent === "PerplexityBot").blocked, 1);
assert.ok(r.bots.some((b) => b.bot.userAgent === "Applebot-Extended"));
assert.equal(r.pages.find((p) => p.path === "/blog/a").hits, 1);
assert.equal(r.pages.find((p) => p.path === "/blog/b").status, 403); // yalnız engel görüldüyse ilk durum kalır
assert.deepEqual(r.referrals.map((x) => x.source).sort(), ["ChatGPT", "Perplexity"]);
const cf = parseAiLog(JSON.stringify({ ClientRequestURI: "/a?x=1", EdgeResponseStatus: 200, EdgeStartTimestamp: 1795599843000000000, ClientRequestReferer: "https://chatgpt.com/", ClientRequestUserAgent: "Mozilla/5.0 (compatible; GPTBot/1.2)" }));
assert.equal(cf.parsed, 1); assert.equal(cf.bots[0].bot.userAgent, "GPTBot"); assert.equal(cf.from.slice(0, 10), "2026-11-25");
console.log("ai-log ok");
