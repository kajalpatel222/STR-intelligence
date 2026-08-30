import { strict as assert } from "node:assert";
import test from "node:test";
import { DEFAULT_INVESTMENT_CRITERIA } from "../../shared/investment-criteria.js";
import { handleAttentionEvaluation } from "./attention-evaluation.js";

test("evaluates every supplied home and returns safe explanations", async () => {
  const result = await handleAttentionEvaluation({
    criteria: DEFAULT_INVESTMENT_CRITERIA,
    listings: [
      { price: 390000, propertyType: "SINGLE_FAMILY", city: "Oakhurst", state: "CA", beds: 3, baths: 2, sqft: 1600, imageUrl: "https://example.com/a.jpg", description: "Private cabin with a mountain view and deck", amenities: ["hot tub"] },
      { price: 450000, propertyType: "SINGLE_FAMILY", city: "Mariposa", state: "CA" },
    ],
  });
  assert.equal(result.statusCode, 200);
  const evaluations = result.body.evaluations as Array<{ listingIndex: number; result: { attentionScore: number | null; confidenceScore: number | null }; explanation: { summary: string } }>;
  assert.equal(evaluations.length, 2);
  assert.deepEqual(evaluations.map((item) => item.listingIndex), [0, 1]);
  assert.equal(typeof evaluations[0]?.result.attentionScore, "number");
  assert.equal(typeof evaluations[0]?.result.confidenceScore, "number");
  assert.match(evaluations[0]?.explanation.summary ?? "", /Attention score/);
  assert.equal(JSON.stringify(result.body).includes("raw"), false);
});
test("returns an unscorable result instead of failing the batch when price is missing", async () => {
  const result = await handleAttentionEvaluation({ criteria: DEFAULT_INVESTMENT_CRITERIA, listings: [{ city: "Oakhurst", state: "CA" }] });
  assert.equal(result.statusCode, 200);
  const evaluation = (result.body.evaluations as Array<{ result: { attentionScore: null; evaluability: { status: string } } }>)[0];
  assert.equal(evaluation?.result.attentionScore, null);
  assert.equal(evaluation?.result.evaluability.status, "unscorable");
});
