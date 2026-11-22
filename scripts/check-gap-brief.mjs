// node --experimental-strip-types scripts/check-gap-brief.mjs (@/ yolları için alias loader gerekir) — Rakip Boşluğu: kaybedilen sorular + sayfa karşılaştırması
import assert from "node:assert/strict";
import { compareFacts, lostQuestions } from "../lib/content-brief.ts";

const base = { url: "https://ben.com/fiyat", wordCount: 400, schemaTypes: ["Organization"], faq: false, author: false, date: false, outboundCitations: 0, aiCrawlScore: 80 };
const other = { url: "https://www.rehber.com/en-iyi", wordCount: 2100, schemaTypes: ["Article", "FAQPage"], faq: true, author: true, date: true, outboundCitations: 6, aiCrawlScore: 90 };
const gaps = compareFacts(base, other);
assert.equal(gaps.length, 6, gaps.join("\n"));
assert.ok(gaps[0].includes("~2100") && gaps[0].includes("rehber.com"));
assert.deepEqual(compareFacts(other, { ...base, schemaTypes: [] }), [], "rakip daha zayıfsa fark yazılmaz");

const run = (engine, text, cites) => ({ engine, promptText: "en iyi muhasebe programı?", responseText: text, mentioned: text.includes("Ben"), citations: cites, sentiment: null, topic: "" });
const runs = [
  run("openai", "1. Logo 2. Mikro", [{ url: "https://rehber.com/a", domain: "rehber.com" }, { url: "https://ben.com/x", domain: "ben.com", isOwnDomain: true }]),
  run("google", "Ben en iyisi", [{ url: "https://rehber.com/a", domain: "rehber.com" }]),
  run("anthropic", "Bilmiyorum", [{ url: "https://rehber.com/a", domain: "rehber.com" }, { url: "https://forum.com/t", domain: "forum.com" }]),
];
const { lost, topUrls } = lostQuestions(runs, { name: "Ben", domain: "ben.com" }, [{ name: "Logo", domain: "logo.com.tr" }, { name: "Mikro", domain: "mikro.com.tr" }]);
assert.equal(lost.length, 1);
assert.deepEqual(lost[0].engines, [{ engine: "openai", winner: "Logo" }, { engine: "anthropic", winner: null }]);
assert.ok(!lost[0].sources.some((s) => s.domain === "ben.com"), "kendi sitesi kaynak listesinde yok");
assert.equal(topUrls[0].url, "https://rehber.com/a");
assert.equal(topUrls[0].n, 2, "kazanılan cevaptaki kaynak sayılmaz");
console.log("gap-brief: ok");
