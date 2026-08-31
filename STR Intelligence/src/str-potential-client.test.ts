import { strict as assert } from "node:assert";
import test from "node:test";
import { parsePublicStrPotential, requestStrPotential } from "./str-potential-client.js";

function payload() {
  return {
    status: "completed",
    property: { listingUrl: "https://www.zillow.com/homedetails/123", title: "Pine Cabin", location: "Oakhurst, CA", priceUsd: 380000 },
    evaluation: {
      potential: "strong", summary: "Distinctive spaces support a compelling guest stay.", confidence: "moderate", confidenceExplanation: "Several listing facts and photos support the assessment.",
      strengths: [{ code: "outdoor", title: "Inviting outdoor space", explanation: "The patio supports group stays.", evidence: [{ code: "photo-1", kind: "photo", label: "Patio photo", imageIndex: 1 }] }],
      risks: [], missingEvidence: ["Permit history"],
      recommendations: [{ code: "hot-tub", title: "Add a hot tub", rationale: "Supports year-round appeal.", priority: "recommended", estimatedCostLowUsd: 8000, estimatedCostHighUsd: 12000, expectedGuestImpact: "high", requiresProfessionalReview: true, evidence: [] }],
      budget: { estimatedCostLowUsd: 999999, estimatedCostHighUsd: 999999, improvementReserveUsd: 10000, reserveGapLowUsd: 0, reserveGapHighUsd: 0 },
      evaluatedAt: "2026-08-31T12:00:00.000Z",
    },
    savedAt: "2026-08-31T12:00:01.000Z",
  };
}

test("posts the public listing reference and validates the safe response", async () => {
  let request: { url?: string; init?: RequestInit } = {};
  const result = await requestStrPotential("https://www.zillow.com/homedetails/123", { refresh: true, fetcher: async (url, init) => {
    request = { url: String(url), init };
    return new Response(JSON.stringify(payload()), { status: 200, headers: { "Content-Type": "application/json" } });
  }});
  assert.equal(request.url, "/api/str-potential");
  assert.deepEqual(JSON.parse(String(request.init?.body)), { listingUrl: "https://www.zillow.com/homedetails/123", refresh: true });
  assert.equal(result.evaluation.budget.estimatedCostLowUsd, 8000, "budget totals are recalculated from recommendations");
  assert.equal(result.evaluation.budget.reserveGapHighUsd, 2000);
  assert.equal(Object.isFrozen(result.evaluation.recommendations), true);
});

test("rejects malformed, unsafe, and internal-shaped responses", () => {
  assert.throws(() => parsePublicStrPotential({ ...payload(), property: { ...payload().property, listingUrl: "http://localhost/secret" } }), /Invalid listing URL/);
  const invalid = payload();
  invalid.evaluation.recommendations[0]!.estimatedCostLowUsd = 13000;
  assert.throws(() => parsePublicStrPotential(invalid), /cost range/);
  assert.throws(() => parsePublicStrPotential({ ...payload(), evaluation: { ...payload().evaluation, model: { provider: "secret" } } }), /Invalid evaluation/);
});

test("contains server errors behind a user-safe message", async () => {
  await assert.rejects(() => requestStrPotential("https://www.zillow.com/homedetails/123", { fetcher: async () => new Response(JSON.stringify({ status: "unavailable", message: "Please try this property again later." }), { status: 503 }) }), /Please try this property again later/);
  await assert.rejects(() => requestStrPotential("https://www.zillow.com/homedetails/123", { fetcher: async () => new Response("not json", { status: 500 }) }), /could not be evaluated/);
});
