// One-off verification script (not part of the app bundle, CJS so tsx's named-export
// detection works reliably) — checks lib/slot-planner.ts's planSlotsForTopics() against the
// methodology card's own worked example before it's wired into any API route: "5 topic × 8
// = 40 slotta sonuç 8 / 20 / 12, hedefle birebir" for an audience split of 20% simple / 50%
// informed / 30% researcher.
const { planSlotsForTopics } = require("../lib/slot-planner.ts");
const { DEFAULT_SECTOR_PACK } = require("../lib/sector-packs.ts");

const topics = ["Topic A", "Topic B", "Topic C", "Topic D", "Topic E"];
const audience = { simple: 0.2, informed: 0.5, researcher: 0.3 };

const plan = planSlotsForTopics(topics, DEFAULT_SECTOR_PACK, audience, 8);

console.log(`Total slots: ${plan.length} (expect 40)`);

const byPersona = { simple: 0, informed: 0, researcher: 0 };
const byIntent = { informational: 0, commercial: 0, transactional: 0, instructional: 0 };
const byForm = { question: 0, need: 0, imperative: 0 };
for (const s of plan) {
  byPersona[s.persona]++;
  byIntent[s.intent]++;
  byForm[s.form]++;
}

console.log("Persona split:", byPersona, "(expect simple:8, informed:20, researcher:12)");
console.log("Intent split summed across 5 topics (expect informational:10 commercial:20 transactional:5 instructional:5):", byIntent);
console.log("Form split:", byForm);

const perTopic = {};
for (const s of plan) {
  perTopic[s.topic] = perTopic[s.topic] || { informational: 0, commercial: 0, transactional: 0, instructional: 0 };
  perTopic[s.topic][s.intent]++;
}
console.log("Per-topic intent counts (each should be informational:2 commercial:4 transactional:1 instructional:1):");
console.log(perTopic);

// Spot-check modifier constraints across all topics: same value should never exceed 2x
// within a single topic.
let modifierCapViolation = false;
const perTopicModifierUsage = {};
for (const s of plan) {
  perTopicModifierUsage[s.topic] = perTopicModifierUsage[s.topic] || {};
  for (const m of s.modifiers) {
    perTopicModifierUsage[s.topic][m] = (perTopicModifierUsage[s.topic][m] || 0) + 1;
    if (perTopicModifierUsage[s.topic][m] > 2) modifierCapViolation = true;
  }
}
console.log(modifierCapViolation ? "❌ modifier cap (max 2/value/topic) VIOLATED" : "✅ modifier cap (max 2/value/topic) respected");

const ok = byPersona.simple === 8 && byPersona.informed === 20 && byPersona.researcher === 12 && !modifierCapViolation;
console.log(ok ? "\n✅ MATCHES the card's worked example (8/20/12)" : "\n❌ DOES NOT MATCH — expected 8/20/12");
process.exit(ok ? 0 : 1);
