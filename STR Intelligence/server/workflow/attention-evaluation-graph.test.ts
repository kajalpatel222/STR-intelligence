import { strict as assert } from "node:assert";
import test from "node:test";
import { createAttentionEvaluationInput } from "../../shared/attention-evaluator.js";
import { DEFAULT_INVESTMENT_CRITERIA } from "../../shared/investment-criteria.js";
import { createAttentionEvaluationGraph } from "./attention-evaluation-graph.js";

test("evaluates each current listing through an evaluation-only LangGraph", async () => {
  const input = createAttentionEvaluationInput({
    criteria: DEFAULT_INVESTMENT_CRITERIA,
    facts: { listingPriceUsd: 390000, propertyKind: "existing_home", photoUrls: [], hasPrimaryImage: false, amenities: [], viewSignals: [], history: [] },
    evidence: { available: ["listing_price"], missing: ["description", "photos"], completeness: "minimal" },
  });
  const result = await createAttentionEvaluationGraph().invoke({ inputs: [input, input], evaluations: [] });
  assert.equal(result.evaluations.length, 2);
  assert.deepEqual(result.evaluations.map((evaluation) => evaluation.listingIndex), [0, 1]);
  assert.equal(typeof result.evaluations[0]?.result.attentionScore, "number");
  assert.equal(result.evaluations[0]?.priority.band, "promising");
});
