// Rakip kartı: takip edilen markaların siteleri "ulaşılacak kaynak" sayılmaz. Çalıştır: node --experimental-strip-types scripts/check-battlecards.mjs
import assert from "node:assert/strict";
import { buildBattlecards } from "../lib/geo-insights.ts";

const r = (t, domains) => ({ engine: "openai", model: "m", promptText: t, topic: "", responseText: t, mentioned: false, position: null, sentiment: null, citations: domains.map((d) => ({ url: `https://${d}/x`, domain: d })), branded: false });
const runs = [r("Royal Canin iyi", ["www.royalcanin.com", "trendyol.com"]), r("Royal Canin çok iyi", ["vet.royalcanin.com", "hillspet.com.tr", "trendyol.com"])];
const [b] = buildBattlecards(runs, { name: "Purina", domain: "purina.com.tr" }, [{ name: "Royal Canin", domain: "royalcanin.com" }, { name: "Hill's", domain: "hillspet.com.tr" }]);
assert.deepEqual(b.theirSources, [{ domain: "trendyol.com", count: 2 }], "rakip siteleri (alt alan adları dahil) kaynak listesinde yok");
assert.ok(!b.actions.some((a) => a.includes("royalcanin.com")), "rakibin kendi sitesine ulaş denmez");
assert.ok(b.actions.some((a) => a.includes("trendyol.com (mağaza")), "mağazaya ürün listeleme önerisi");
{
  const shop = [r("Royal Canin iyi", ["petlebi.com"]), r("Royal Canin çok iyi", ["petlebi.com"])];
  const own = { name: "Purina", domain: "purina.com.tr" }, rv = [{ name: "Royal Canin", domain: "royalcanin.com" }];
  assert.ok(buildBattlecards(shop, own, rv)[0].actions.some((a) => a.includes("petlebi.com rakibi alıntılıyor")), "otomatik tanınmıyorsa ortaklık önerisi");
  assert.ok(buildBattlecards(shop, own, rv, ["petlebi.com"])[0].actions.some((a) => a.includes("petlebi.com (mağaza")), "elle E-ticaret işaretlenince mağaza önerisi");
}
console.log("check-battlecards: ok");
