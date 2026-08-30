import { strict as assert } from "node:assert";
import test from "node:test";
import { DEFAULT_INVESTMENT_CRITERIA } from "./investment-criteria.js";
import {
  createAttentionEvaluationInput,
  initializeAttentionEvaluationResult,
  type AttentionEvaluationInput,
} from "./attention-evaluator.js";

function completeHome(): AttentionEvaluationInput {
  return {
    criteria: DEFAULT_INVESTMENT_CRITERIA,
    facts: {
      listingPriceUsd: 375_000,
      propertyKind: "existing_home",
      propertyType: "SINGLE_FAMILY",
      location: { address: "123 Pine St", city: "Oakhurst", state: "CA", postalCode: "93644" },
      beds: 3,
      baths: 2,
      livingAreaSqft: 1_700,
      lotAreaSqft: 21_780,
      lotAreaAcres: 0.5,
      description: "Mountain home with deck and views.",
      photoUrls: ["https://images.example/home.jpg"],
      hasPrimaryImage: true,
      amenities: ["deck", "fireplace"],
      viewSignals: ["mountain view"],
      history: [{ occurredAt: "2026-08-01T00:00:00.000Z", eventType: "listed", priceUsd: 390_000 }],
    },
    evidence: {
      available: ["listing_price", "property_type", "location", "beds", "baths", "living_area", "lot_area", "description", "photos", "amenities", "view_signals", "listing_history", "price_history"],
      missing: [],
      completeness: "complete",
    },
  };
}

test("represents a complete home without calculating scores", () => {
  const input = createAttentionEvaluationInput(completeHome());
  const result = initializeAttentionEvaluationResult(input);
  assert.equal(result.evaluability.status, "evaluable");
  assert.equal(result.attentionScore, null);
  assert.equal(result.confidenceScore, null);
  assert.deepEqual(Object.keys(result.categories), ["budget_fit", "str_appeal", "amenities", "value_add", "deal_signals"]);
  assert.equal(result.categories.budget_fit.score, null);
  assert.deepEqual(result.riskDeductions, []);
  assert.deepEqual(result.strictLimitViolations, []);
});

test("represents sparse evidence without treating it as low attractiveness", () => {
  const sparse = completeHome();
  const input = createAttentionEvaluationInput({
    ...sparse,
    facts: { ...sparse.facts, description: undefined, photoUrls: [], hasPrimaryImage: false, amenities: [], viewSignals: [], history: [] },
    evidence: {
      available: ["listing_price", "property_type", "location"],
      missing: ["beds", "baths", "living_area", "lot_area", "description", "photos", "amenities", "view_signals", "listing_history", "price_history"],
      completeness: "minimal",
    },
  });
  const result = initializeAttentionEvaluationResult(input);
  assert.equal(result.evaluability.status, "evaluable");
  assert.equal(result.attentionScore, null);
  assert.equal(result.confidenceScore, null);
  assert.deepEqual(result.riskDeductions, []);
});

test("represents missing or nonpositive price as unscorable", () => {
  for (const listingPriceUsd of [undefined, 0, -1]) {
    const complete = completeHome();
    const input = createAttentionEvaluationInput({ ...complete, facts: { ...complete.facts, listingPriceUsd } });
    const result = initializeAttentionEvaluationResult(input);
    assert.deepEqual(result.evaluability, {
      status: "unscorable",
      code: "missing_or_nonpositive_price",
      text: "A positive listing price is required before this property can be evaluated.",
    });
  }
});

test("fact, evidence, history, and result collections are independent snapshots", () => {
  const source = completeHome();
  const first = createAttentionEvaluationInput(source);
  const second = createAttentionEvaluationInput(source);
  const firstResult = initializeAttentionEvaluationResult(first);
  const secondResult = initializeAttentionEvaluationResult(second);

  assert.notStrictEqual(first.facts.photoUrls, second.facts.photoUrls);
  assert.notStrictEqual(first.facts.amenities, second.facts.amenities);
  assert.notStrictEqual(first.facts.history, second.facts.history);
  assert.notStrictEqual(first.facts.history[0], second.facts.history[0]);
  assert.notStrictEqual(first.evidence.available, second.evidence.available);
  assert.notStrictEqual(firstResult.categories, secondResult.categories);
  assert.notStrictEqual(firstResult.categories.budget_fit.reasons, secondResult.categories.budget_fit.reasons);
  assert.equal(Object.isFrozen(first.facts.photoUrls), true);
  assert.equal(Object.isFrozen(firstResult.categories), true);
});
