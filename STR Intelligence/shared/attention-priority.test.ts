import { strict as assert } from "node:assert";
import test from "node:test";
import type { AttentionEvaluationResult } from "./attention-evaluator.js";
import { classifyAttentionPriority } from "./attention-priority.js";

function result(attentionScore: number | null, confidenceScore: number | null, options: { unscorable?: boolean; strict?: boolean } = {}): AttentionEvaluationResult {
  return {
    attentionScore,
    confidenceScore,
    evaluability: options.unscorable
      ? { status: "unscorable", code: "missing_or_nonpositive_price", text: "Missing price" }
      : { status: "evaluable" },
    categories: {} as AttentionEvaluationResult["categories"],
    reasons: [],
    riskDeductions: [],
    strictLimitViolations: options.strict
      ? [{ code: "purchase_price_above_maximum", text: "Over limit", observedValueUsd: 450_000, limitValueUsd: 400_000 }]
      : [],
  };
}

test("classifies exact Attention and Confidence boundaries", () => {
  assert.equal(classifyAttentionPriority(result(75, 65)).band, "review_now");
  assert.equal(classifyAttentionPriority(result(75, 64)).band, "promising");
  assert.equal(classifyAttentionPriority(result(55, 90)).band, "promising");
  assert.equal(classifyAttentionPriority(result(54.9, 100)).band, "low_priority");
});

test("makes unscorable and strict-limit homes ineligible", () => {
  assert.equal(classifyAttentionPriority(result(null, 20, { unscorable: true })).reasonCode, "unscorable");
  assert.equal(classifyAttentionPriority(result(80, 90, { strict: true })).reasonCode, "strict_limit_violation");
});
