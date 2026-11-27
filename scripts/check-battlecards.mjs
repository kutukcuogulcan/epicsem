// Rakip kartı: takip edilen markaların siteleri "ulaşılacak kaynak" sayılmaz. Çalıştır: node --experimental-strip-types scripts/check-battlecards.mjs
import assert from "node:assert/strict";
import { buildBattlecards } from "../lib/geo-insights.ts";

const r = (t, domains) => ({ engine: "openai", model: "m", promptText: t, topic: "", responseText: t, mentioned: false, position: null, sentiment: null, citations: domains.map((d) => ({ url: `https://${d}/x`, domain: d })), branded: false });
const runs = [r("Royal Canin iyi", ["www.royalcanin.com", "trendyol.com"]), r("Royal Canin çok iyi", ["vet.royalcanin.com", "hillspet.com.tr", "trendyol.com"])];
const [b] = buildBattlecards(runs, { name: "Purina", domain: "purina.com.tr" }, [{ name: "Royal Canin", domain: "royalcanin.com" }, { name: "Hill's", domain: "hillspet.com.tr" }]);
assert.deepEqual(b.theirSources, [{ domain: "trendyol.com", count: 2 }], "rakip siteleri (alt alan adları dahil) kaynak listesinde yok");
assert.ok(!b.actions.some((a) => a.includes("royalcanin.com")), "rakibin kendi sitesine ulaş denmez");
assert.ok(b.actions.some((a) => a.includes("trendyol.com (mağaza")), "mağazaya ürün listeleme önerisi");
console.log("check-battlecards: ok");
