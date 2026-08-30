import { strict as assert } from "node:assert";
import test from "node:test";
import {
  createAttentionEvaluationInput,
  initializeAttentionEvaluationResult,
  type AttentionCategoryBreakdown,
  type AttentionEvaluationInput,
  type AttentionEvaluationResult,
} from "./attention-evaluator.js";
import { explainAttentionEvaluation } from "./attention-reasons.js";
import { DEFAULT_INVESTMENT_CRITERIA } from "./investment-criteria.js";

function input(missing: AttentionEvaluationInput["evidence"]["missing"] = []): AttentionEvaluationInput {
  return createAttentionEvaluationInput({
    criteria: DEFAULT_INVESTMENT_CRITERIA,
    facts: {
      listingPriceUsd: 375_000,
      propertyKind: "existing_home",
      propertyType: "SINGLE_FAMILY",
      location: { city: "Oakhurst", state: "CA" },
      photoUrls: [],
      hasPrimaryImage: false,
      amenities: [],
      viewSignals: [],
      history: [],
    },
    evidence: { available: ["listing_price", "property_type", "location"], missing, completeness: "partial" },
  });
}

function categories(): AttentionCategoryBreakdown {
  const empty = { score: 0, reasons: [], evidenceCodes: [] } as const;
  return { budget_fit: empty, str_appeal: empty, amenities: empty, value_add: empty, deal_signals: empty };
}

test("explains the main positive drivers once using stable code copy", () => {
  const source = input();
  const result: AttentionEvaluationResult = {
    ...initializeAttentionEvaluationResult(source),
    attentionScore: 82,
    confidenceScore: 74,
    categories: {
      ...categories(),
      budget_fit: {
        score: 35,
        reasons: [{ code: "within_purchase_budget", text: "ignored engine copy", evidenceCodes: ["listing_price"] }],
        evidenceCodes: ["listing_price"],
      },
    },
    reasons: [
      { code: "within_purchase_budget", text: "duplicate", evidenceCodes: ["listing_price"] },
      { code: "str_appeal_evidence", text: "ignored", evidenceCodes: ["description"] },
    ],
  };

  assert.deepEqual(explainAttentionEvaluation(source, result), {
    summary: "Attention score 82 out of 100, with 74% confidence.",
    positiveDrivers: [
      "The asking price fits your purchase budget.",
      "The listing shows features that may appeal to short-term-rental guests.",
    ],
    concerns: [],
    missingEvidence: [],
  });
});

test("prioritizes strict limits and risks while describing missing evidence", () => {
  const source = input(["photos", "price_history"]);
  const result: AttentionEvaluationResult = {
    ...initializeAttentionEvaluationResult(source),
    attentionScore: 48,
    confidenceScore: 51,
    reasons: [{ code: "limited_property_evidence", text: "ignored", evidenceCodes: ["photos"] }],
    riskDeductions: [{ code: "unknown_location_risk", text: "ignored", deductionPoints: 4, evidenceCodes: ["location"] }],
    strictLimitViolations: [{
      code: "purchase_price_above_maximum",
      text: "ignored",
      observedValueUsd: 425_000,
      limitValueUsd: 400_000,
    }],
  };

  assert.deepEqual(explainAttentionEvaluation(source, result), {
    summary: "Attention score 48 out of 100, with 51% confidence.",
    positiveDrivers: [],
    concerns: [
      "The asking price is above your strict purchase limit.",
      "The location needs verification before relying on this result.",
      "The listing has limited detail, so its potential needs more review.",
    ],
    missingEvidence: ["Missing listing photos.", "Missing price history."],
  });
});

test("returns a safe explanation when the property is unscorable", () => {
  const sourceBase = input(["listing_price", "description"]);
  const source = createAttentionEvaluationInput({
    ...sourceBase,
    facts: { ...sourceBase.facts, listingPriceUsd: undefined },
  });
  const explanation = explainAttentionEvaluation(source, initializeAttentionEvaluationResult(source));

  assert.equal(explanation.summary, "This property cannot be scored yet because a valid asking price is missing.");
  assert.deepEqual(explanation.positiveDrivers, []);
  assert.deepEqual(explanation.concerns, ["A valid asking price is needed before this property can be scored."]);
  assert.deepEqual(explanation.missingEvidence, ["Missing asking price.", "Missing property description."]);
  assert.equal(Object.isFrozen(explanation), true);
  assert.equal(Object.isFrozen(explanation.concerns), true);
});
