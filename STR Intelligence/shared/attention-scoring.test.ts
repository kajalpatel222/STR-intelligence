import { strict as assert } from "node:assert";
import test from "node:test";
import { DEFAULT_INVESTMENT_CRITERIA } from "./investment-criteria.js";
import { createAttentionEvaluationInput, type AttentionEvaluationInput } from "./attention-evaluator.js";
import { evaluateAttention } from "./attention-scoring.js";

function input(overrides: Partial<AttentionEvaluationInput["facts"]> = {}, mode: "strict" | "flexible" = "flexible") {
  return createAttentionEvaluationInput({
    criteria: { ...DEFAULT_INVESTMENT_CRITERIA, mode },
    facts: {
      listingPriceUsd: 375_000,
      propertyKind: "existing_home",
      propertyType: "SINGLE_FAMILY",
      location: { city: "Oakhurst", state: "CA" },
      beds: 3,
      baths: 2,
      livingAreaSqft: 1_700,
      description: "Private Yosemite cabin with mountain view, deck, and room to add a hot tub.",
      photoUrls: ["https://images.example/home.jpg"],
      hasPrimaryImage: true,
      amenities: ["deck", "fireplace", "parking"],
      viewSignals: ["mountain view", "forest view"],
      history: [
        { occurredAt: "2026-07-01", eventType: "listed", priceUsd: 400_000 },
        { occurredAt: "2026-08-01", eventType: "price_change", priceUsd: 375_000 },
      ],
      ...overrides,
    },
    evidence: {
      available: ["listing_price", "property_type", "location", "beds", "baths", "living_area", "description", "photos", "amenities", "view_signals", "listing_history", "price_history"],
      missing: ["lot_area"],
      completeness: "complete",
    },
  });
}

test("calculates the approved category weights and keeps confidence separate", () => {
  const result = evaluateAttention(input());
  assert.equal(result.categories.budget_fit.score, 35);
  assert.equal(result.categories.str_appeal.score, 25);
  assert.equal(result.categories.amenities.score, 9);
  assert.equal(result.categories.value_add.score, 5);
  assert.equal(result.categories.deal_signals.score, 10);
  assert.equal(result.attentionScore, 84);
  assert.equal(result.confidenceScore, 100);
  assert.equal(result.reasons.length, 5);
});

test("treats the minimum budget as a preference and flexible overage as proportional", () => {
  const below = evaluateAttention(input({ listingPriceUsd: 300_000 }));
  assert.equal(below.strictLimitViolations.length, 0);
  assert.equal(below.categories.budget_fit.score, 34.3);

  const nearMiss = evaluateAttention(input({ listingPriceUsd: 420_000 }));
  assert.equal(nearMiss.strictLimitViolations.length, 0);
  assert.equal(nearMiss.riskDeductions[0]?.deductionPoints, 7);
  assert.equal(nearMiss.riskDeductions[0]?.code, "price_above_limit");
});

test("captures a strict maximum violation and applies its hard penalty", () => {
  const result = evaluateAttention(input({ listingPriceUsd: 420_000 }, "strict"));
  assert.equal(result.strictLimitViolations[0]?.code, "purchase_price_above_maximum");
  assert.equal(result.riskDeductions[0]?.deductionPoints, 35);
  assert.equal(result.strictLimitViolations[0]?.observedValueUsd, 420_000);
});

test("missing evidence lowers confidence without directly lowering attractiveness", () => {
  const complete = input();
  const sparse = createAttentionEvaluationInput({
    ...complete,
    facts: {
      ...complete.facts,
      description: undefined,
      photoUrls: [],
      hasPrimaryImage: false,
      amenities: [],
      viewSignals: [],
      history: [],
    },
    evidence: {
      available: ["listing_price", "property_type", "location", "beds", "baths", "living_area"],
      missing: ["description", "photos", "amenities", "view_signals", "listing_history", "price_history", "lot_area"],
      completeness: "partial",
    },
  });
  const result = evaluateAttention(sparse);
  assert.equal(result.attentionScore, 100);
  assert.equal(result.confidenceScore, 77);
  assert.equal(result.categories.str_appeal.score, null);
  assert.equal(result.categories.amenities.score, null);
});

test("missing or nonpositive price stays unscorable while confidence remains explainable", () => {
  for (const listingPriceUsd of [undefined, 0, -1]) {
    const result = evaluateAttention(input({ listingPriceUsd }));
    assert.equal(result.evaluability.status, "unscorable");
    assert.equal(result.attentionScore, null);
    assert.equal(typeof result.confidenceScore, "number");
  }
});

test("does not invent deal signals when history has no price reduction", () => {
  const result = evaluateAttention(input({
    history: [{ occurredAt: "2026-08-01", eventType: "listed", priceUsd: 375_000 }],
  }));
  assert.equal(result.categories.deal_signals.score, 0);
  assert.equal(result.categories.deal_signals.reasons[0]?.code, "deal_signal_evidence");
});
