import { strict as assert } from "node:assert";
import test from "node:test";
import { createStrPotentialGraph, initializeStrPotentialWorkflowState } from "./str-potential-graph.js";
import { StrPotentialRepository, type ResolvedStrPotentialSource, type StrPotentialStore } from "../str-potential/repository.js";

const listingUrl = "https://www.zillow.com/homedetails/1";
class Store implements StrPotentialStore {
  rows: Record<string, unknown>[] = [];
  source: ResolvedStrPotentialSource = { canonicalPropertyId: "property", listingSnapshotId: "snapshot", listingUrl, property: { address_line1: "Cabin" }, snapshot: { id: "snapshot", listing_url: listingUrl, description: "A private cabin", raw_payload: { imgSrc: "https://images.example/cabin.jpg" } }, financialAnalysis: { assumptions_snapshot: { improvementBudgetUsd: 40_000 } }, comparables: [] };
  async resolve() { return this.source; }
  async findLatest() { return this.rows.at(-1); }
  async nextVersion() { return this.rows.length + 1; }
  async insert(row: Record<string, unknown>) { const value = { ...row, created_at: row.evaluated_at }; this.rows.push(value); return value; }
}
function provider(counter: { calls: number }) { return { identity: { provider: "test", model: "vision", promptVersion: "v1" }, async evaluate() { counter.calls += 1; return { potential: "strong" as const, summary: "Strong cabin appeal.", confidence: "moderate" as const, confidenceExplanation: "One image and text.", strengths: [], risks: [], missingEvidence: [], recommendations: [{ code: "hot-tub", title: "Add hot tub", rationale: "Improve guest appeal.", priority: "recommended" as const, estimatedCostLowUsd: 10_000, estimatedCostHighUsd: 20_000, expectedGuestImpact: "high" as const, requiresProfessionalReview: true, evidence: [{ code: "text", kind: "listing_text" as const, label: "Cabin description" }] }] }; } }; }

test("evaluates and persists on demand, then returns fresh cache without another model call", async () => {
  const store = new Store(); const calls = { calls: 0 }; const graph = createStrPotentialGraph({ repository: new StrPotentialRepository(store), provider: provider(calls), now: () => "2026-08-31T00:00:00Z" });
  const first = await graph.invoke({ workflowState: initializeStrPotentialWorkflowState({ workflowId: "one", listingUrl }) });
  assert.equal(first.workflowState.status, "completed");
  assert.equal(first.workflowState.saved?.evaluation.budget.estimatedCostHighUsd, 20_000);
  assert.equal(calls.calls, 1);
  const second = await graph.invoke({ workflowState: initializeStrPotentialWorkflowState({ workflowId: "two", listingUrl }) });
  assert.equal(second.workflowState.dataOrigin, "cache");
  assert.equal(calls.calls, 1);
});

test("returns a saved insufficient-evidence result without invoking the model", async () => {
  const store = new Store(); store.source = { ...store.source, snapshot: { id: "snapshot", listing_url: listingUrl, raw_payload: {} } };
  const calls = { calls: 0 }; const graph = createStrPotentialGraph({ repository: new StrPotentialRepository(store), provider: provider(calls), now: () => "2026-08-31T00:00:00Z" });
  const result = await graph.invoke({ workflowState: initializeStrPotentialWorkflowState({ workflowId: "one", listingUrl }) });
  assert.equal(result.workflowState.status, "insufficient_evidence");
  assert.equal(calls.calls, 0);
});

test("contains model failure and does not persist a partial result", async () => {
  const store = new Store(); const failing = { identity: { provider: "test", model: "vision", promptVersion: "v1" }, async evaluate() { throw new Error("private provider error"); } };
  const result = await createStrPotentialGraph({ repository: new StrPotentialRepository(store), provider: failing }).invoke({ workflowState: initializeStrPotentialWorkflowState({ workflowId: "one", listingUrl }) });
  assert.equal(result.workflowState.failureCode, "provider_unavailable");
  assert.equal(store.rows.length, 0);
});
