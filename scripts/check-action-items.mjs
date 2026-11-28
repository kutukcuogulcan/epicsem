// GEO iş takibi. Çalıştır: node --experimental-strip-types scripts/check-action-items.mjs
import assert from "node:assert/strict";
import { actionKey, sinceDone } from "../lib/action-items.ts";

assert.equal(actionKey("Böbrek & sindirim sayfalarını güçlendir!"), actionKey("böbrek sindirim sayfalarını güçlendir"), "büyük/küçük harf ve noktalama farkı aynı iş");
assert.notEqual(actionKey("Köpek maması sayfası yayınla"), actionKey("Kedi maması sayfası yayınla"));
const done = { doneAt: "2026-12-01T00:00:00.000Z", doneVisibility: 0.57 };
assert.deepEqual(sinceDone(done, [{ createdAt: "2026-11-22T00:00:00.000Z", visibility: 0.5 }]), { tests: 0, from: 0.57, to: null }, "işaretten sonra test yok");
assert.deepEqual(sinceDone(done, [{ createdAt: "2026-12-08T00:00:00.000Z", visibility: 0.6 }, { createdAt: "2026-12-15T00:00:00.000Z", visibility: 0.64 }]), { tests: 2, from: 0.57, to: 0.64 });
assert.equal(sinceDone({ doneAt: null, doneVisibility: null }, []), null);
console.log("check-action-items: ok");
