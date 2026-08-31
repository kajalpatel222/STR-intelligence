import { strict as assert } from "node:assert";
import test from "node:test";
import { createStrPotentialHandler } from "./str-potential.js";
import type { StrPotentialWorkflowState } from "../workflow/str-potential-graph.js";

const listingUrl = "https://www.zillow.com/homedetails/1";
const saved = { property: { listingUrl, title: "Cabin", amenities: [] }, evaluation: { status: "completed", potential: "strong", summary: "Strong potential", confidence: "moderate", confidenceExplanation: "Some evidence", strengths: [], risks: [], missingEvidence: [], recommendations: [], budget: { estimatedCostLowUsd: 0, estimatedCostHighUsd: 0, improvementReserveUsd: 40000, reserveGapLowUsd: 0, reserveGapHighUsd: 0 }, evaluatedAt: "2026-08-31T00:00:00Z", model: { provider: "secret-provider", model: "secret-model", promptVersion: "secret-prompt" } }, savedAt: "2026-08-31T00:00:00Z", isFresh: true } as const;

test("returns a safe evaluation without model or internal metadata", async () => {
  const handler = createStrPotentialHandler({ async invoke({ workflowState }) { return { workflowState: { ...workflowState, status: "completed", saved } as StrPotentialWorkflowState }; } });
  const result = await handler({ listingUrl });
  assert.equal(result.statusCode, 200);
  const serialized = JSON.stringify(result.body);
  assert.match(serialized, /Strong potential/);
  assert.doesNotMatch(serialized, /secret-provider|secret-model|secret-prompt|canonical|snapshot/i);
});

test("rejects unsafe requests before graph invocation", async () => {
  let calls = 0;
  const handler = createStrPotentialHandler({ async invoke({ workflowState }) { calls += 1; return { workflowState }; } });
  assert.equal((await handler({ listingUrl: "javascript:alert(1)" })).statusCode, 400);
  assert.equal((await handler({ listingUrl, refresh: "yes" })).statusCode, 400);
  assert.equal(calls, 0);
});

test("coalesces duplicate on-demand evaluations", async () => {
  let calls = 0;
  const handler = createStrPotentialHandler({ async invoke({ workflowState }) { calls += 1; await new Promise((resolve) => setTimeout(resolve, 20)); return { workflowState: { ...workflowState, status: "completed", saved } as StrPotentialWorkflowState }; } });
  const [first, second] = await Promise.all([handler({ listingUrl }), handler({ listingUrl })]);
  assert.equal(first.statusCode, 200); assert.equal(second.statusCode, 200); assert.equal(calls, 1);
});
