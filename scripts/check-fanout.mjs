// Fan-out: motor cevaplarından arama sorgularının doğru çıkarıldığını doğrular. Çalıştır: node --experimental-strip-types scripts/check-fanout.mjs
import assert from "node:assert/strict";
import { extractSearchQueries } from "../lib/search-queries.ts";

const openai = { output: [
  { type: "web_search_call", action: { type: "search", query: "en iyi ön muhasebe programı 2026" } },
  { type: "web_search_call", action: { type: "search", queries: ["paraşüt fiyat", "En iyi ön muhasebe programı 2026"] } },
  { type: "web_search_call", action: { type: "open_page", url: "https://x.com" } },
  { type: "message", content: [{ type: "output_text", text: "..." }] },
] };
assert.deepEqual(extractSearchQueries("openai", openai), ["en iyi ön muhasebe programı 2026", "paraşüt fiyat"], "tekrar eden (büyük/küçük harf) sorgu bir kez");

const claude = { content: [
  { type: "server_tool_use", name: "web_search", input: { query: "e-fatura programı karşılaştırma" } },
  { type: "web_search_tool_result", content: [] },
  { type: "server_tool_use", name: "web_fetch", input: { url: "https://x.com" } },
  { type: "text", text: "..." },
] };
assert.deepEqual(extractSearchQueries("anthropic", claude), ["e-fatura programı karşılaştırma"]);

const gemini = { candidates: [{ groundingMetadata: { webSearchQueries: ["küçük işletme muhasebe yazılımı", " "] } }] };
assert.deepEqual(extractSearchQueries("google", gemini), ["küçük işletme muhasebe yazılımı"]);
assert.deepEqual(extractSearchQueries("google", {}), [], "arama yapılmadıysa boş");
assert.deepEqual(extractSearchQueries("openai", null), []);
console.log("check-fanout: ok");
