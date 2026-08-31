import { strict as assert } from "node:assert";
import test from "node:test";
import { createStrComparisonsHandler, toPublicComparison } from "./str-comparisons.js";
import type { StoredComparison, StrComparisonRepositoryPort } from "../str-comparator/repository.js";

const reference = "4e14ec72-fdf3-45e7-8e5f-04835a476dde";
const stored: StoredComparison = { publicReference: reference, status: "discovered", stage: "discovery", target: { canonicalPropertyId: "secret-property", listingSnapshotId: "secret-snapshot", listingUrl: "https://www.zillow.com/homedetails/target", latitude: 37, longitude: -119, address: "Target home" }, candidates: [{ providerListingKey: "secret-provider-key", listingUrl: "https://www.airbnb.com/rooms/123", title: "Cabin", latitude: 37, longitude: -119, distanceMiles: 2, amenities: ["Wifi"], observedNightlyPriceUsd: 250, observedCheckIn: "2026-09-11", observedCheckOut: "2026-09-13", similarityScore: 90, matchReasons: ["Nearby location"], observedAt: "2026-08-30T00:00:00.000Z", rawPayload: { secret: true }, included: true }] };

function repository(): StrComparisonRepositoryPort { return { async resolveTarget() { return stored.target; }, async findComparisonCache() { return { status: "missing" }; }, async createRun() { return "secret-run"; }, async resolveRunId() { return "secret-run"; }, async saveDiscovery() {}, async saveEvidence() {}, async updateSelections() {}, async loadComparison(value) { return value === reference ? stored : undefined; } }; }

test("public DTO excludes provider, database and raw evidence identifiers", () => {
  const serialized = JSON.stringify(toPublicComparison(stored));
  assert.doesNotMatch(serialized, /secret-property|secret-snapshot|secret-provider-key|rawPayload|canonicalProperty/i);
  assert.match(serialized, /Cabin/);
  assert.match(serialized, /250/);
});

test("API validates references, provider URLs, and retains one selection", async () => {
  let invoked = 0;
  const handler = createStrComparisonsHandler({ async invoke({ workflowState }) { invoked += 1; return { workflowState: { ...workflowState, comparisonReference: reference, status: "completed" } }; } }, repository());
  assert.equal((await handler.create({ listingUrl: "javascript:alert(1)" })).statusCode, 400);
  assert.equal((await handler.get("not-a-reference")).statusCode, 400);
  assert.equal((await handler.select(reference, { listingUrls: [] })).statusCode, 400);
  assert.equal((await handler.select(reference, { listingUrls: ["https://evil.example/123"] })).statusCode, 400);
  assert.equal(invoked, 0);
});

test("coalesces concurrent paid discovery requests", async () => {
  let calls = 0;
  const graph = { async invoke({ workflowState }: any) { calls += 1; await new Promise((resolve) => setTimeout(resolve, 20)); return { workflowState: { ...workflowState, comparisonReference: reference, status: "completed" } }; } };
  const handler = createStrComparisonsHandler(graph, repository());
  const [first, second] = await Promise.all([handler.create({ listingUrl: stored.target.listingUrl }), handler.create({ listingUrl: stored.target.listingUrl })]);
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(calls, 1);
});

test("rejects selections that do not belong to the comparison", async () => {
  let selectionWrites = 0;
  const store = { ...repository(), async updateSelections() { selectionWrites += 1; } };
  const handler = createStrComparisonsHandler({ async invoke({ workflowState }) { return { workflowState }; } }, store);
  const result = await handler.select(reference, { listingUrls: ["https://www.airbnb.com/rooms/unrelated"] });
  assert.equal(result.statusCode, 400);
  assert.equal(selectionWrites, 0);
});
